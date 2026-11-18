// 课程工坊 · Mathigon 本地服务管理 + 编译校验。
// 预览：mgon-serve 在 localhost:<port> 渲染真实课件页（面板 iframe 直接嵌 /course/<slug>/<section>）。
// 校验：npm run assets 编译全仓库，输出里抓 "Maths parsing error" / "Missing glossary|bios keys" / error。
//       npm run lint 校验 content/**/*.ts（先 lint-fix 自动修风格）。
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import http from 'node:http'

// Windows 上 Node 22.18+ spawn .cmd 必须 shell:true（CVE-2024-27980 后的默认行为变更），否则 EINVAL；
// windowsHide 防止 detached 的 npm 进程弹黑窗。
const NPM = 'npm'
const SPAWN_OPTS = { shell: process.platform === 'win32', windowsHide: true }

// --- 预览服务健康检查 ---------------------------------------------------------

export function serverHealth(port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: timeoutMs }, (res) => {
      res.resume()
      resolve({ up: res.statusCode >= 200 && res.statusCode < 500, statusCode: res.statusCode })
    })
    req.on('timeout', () => { req.destroy(); resolve({ up: false, statusCode: 0 }) })
    req.on('error', () => resolve({ up: false, statusCode: 0 }))
  })
}

// 启动 mgon-serve（detached 常驻），轮询健康检查直到就绪或超时。
export async function startServer(repoDir, port, { waitMs = 60000 } = {}) {
  if (!existsSync(join(repoDir, 'package.json'))) {
    return { ok: false, error: `仓库目录不对：${repoDir} 下没有 package.json（在插件 Config 里检查「课程仓库路径」）` }
  }
  const before = await serverHealth(port)
  if (before.up) return { ok: true, alreadyRunning: true, url: previewBase(port) }
  const child = spawn(NPM, ['run', 'server'], {
    cwd: repoDir, detached: true, stdio: 'ignore',
    env: { ...process.env, PORT: String(port) }, ...SPAWN_OPTS,
  })
  child.unref()
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    const after = await serverHealth(port)
    if (after.up) return { ok: true, alreadyRunning: false, url: previewBase(port) }
  }
  return { ok: false, error: `预览服务 ${waitMs / 1000}s 内没起来（首次启动 mgon-serve 可能要编译，稍后在面板重试，或去 ${repoDir} 手动 npm run server 看报错）`, url: previewBase(port) }
}

export const previewBase = (port) => `http://127.0.0.1:${port}`

// 课程预览地址：/course/<slug>[/section]（section 来自 content.md 的 > section: 指令）
export function previewUrl(port, slug, section) {
  const base = previewBase(port)
  return section ? `${base}/course/${slug}/${section}` : `${base}/course/${slug}`
}

// --- 编译校验 -----------------------------------------------------------------

function run(repoDir, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(NPM, args, { cwd: repoDir, env: process.env, ...SPAWN_OPTS })
    let out = ''
    let done = false
    const timer = setTimeout(() => {
      if (!done) { done = true; try { child.kill() } catch { /* */ }; resolve({ code: -1, out, timedOut: true }) }
    }, timeoutMs)
    child.stdout.on('data', (c) => { out += c })
    child.stderr.on('data', (c) => { out += c })
    child.on('error', (err) => {
      if (done) return
      done = true; clearTimeout(timer)
      resolve({ code: -1, out: `${out}\n${err.message}`, timedOut: false })
    })
    child.on('close', (code) => {
      if (done) return
      done = true; clearTimeout(timer)
      resolve({ code, out, timedOut: false })
    })
  })
}

// 从构建输出里挑出对课件作者有用的行（错误/警告），丢弃普通进度日志
export function parseBuildOutput(out) {
  const lines = String(out).split(/\r?\n/)
  const errors = []
  const warnings = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (/Maths parsing error/i.test(line)) errors.push(line)
    else if (/^\s*!|Unknown symbol|Unknown directive|Missing .*keys/i.test(line)) warnings.push(line)
    else if (/\berror\b/i.test(line) && !/0 errors/i.test(line)) errors.push(line)
  }
  // 去重，同类合并计数
  const uniq = (arr) => [...new Set(arr.map((s) => s.slice(0, 300)))]
  return { errors: uniq(errors), warnings: uniq(warnings) }
}

// 完整校验：lint-fix（自动修 import 排序/风格）→ lint → assets 编译。
// 返回 { ok, lint: {fixed, errors}, build: {errors, warnings}, tail }
export async function verifyCourse(repoDir, { lint = true, timeoutMs = 420000 } = {}) {
  if (!existsSync(join(repoDir, 'package.json'))) {
    return { ok: false, error: `仓库目录不对：${repoDir} 下没有 package.json`, lint: null, build: null, tail: '' }
  }
  if (!existsSync(join(repoDir, 'node_modules'))) {
    return { ok: false, error: `仓库缺 node_modules：请先在 ${repoDir} 执行 npm install`, lint: null, build: null, tail: '' }
  }
  const result = { ok: true, lint: null, build: null, tail: '' }
  if (lint) {
    const fix = await run(repoDir, ['run', 'lint-fix', '--silent'], 120000)
    const check = await run(repoDir, ['run', 'lint', '--silent'], 120000)
    const parsed = parseBuildOutput(check.out)
    result.lint = { fixCode: fix.code, code: check.code, errors: parsed.errors, timedOut: check.timedOut }
    if (check.code !== 0 && parsed.errors.length) result.ok = false
  }
  const build = await run(repoDir, ['run', 'assets', '--silent'], timeoutMs)
  const parsed = parseBuildOutput(build.out)
  result.build = { code: build.code, errors: parsed.errors, warnings: parsed.warnings, timedOut: build.timedOut }
  result.tail = build.out.split(/\r?\n/).filter(Boolean).slice(-15).join('\n')
  if (build.timedOut) result.ok = false
  if (parsed.errors.length) result.ok = false
  return result
}
