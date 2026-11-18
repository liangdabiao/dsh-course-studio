// 课程工坊 · E2E 冒烟：course_studio 工具全动作跑通（沙盒 DSH_HOME，不碰真实档案库）。
// 用法：DSH_HOME=<沙盒> node scripts/smoke.mjs [--repo <仓库路径>] [--port <端口>]
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-course-smoke-'))
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : fallback
}
const REPO = argOf('--repo', 'D:\\textbooks-master')
const PORT = Number(argOf('--port', 5000))

const configRef = { config: { textbooksDir: REPO, previewPort: PORT } }
const { courseStudioTool } = await import('../src/host.js')
const run = (args) => courseStudioTool.execute(args)

let failed = 0
const step = async (label, args, expectOk = true) => {
  try {
    const out = await run(args)
    const ok = out.ok === expectOk
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      ${out.summary.split('\n')[0]}${out.data ? `\n      ${String(out.data).split('\n')[0]}` : ''}`)
    if (!ok) failed++
    return out
  } catch (err) {
    console.log(`FAIL  ${label}\n      抛错：${err.message}`)
    failed++
    return null
  }
}

console.log(`== course_studio 冒烟（repo=${REPO} port=${PORT}）==`)
await step('check 环境自检', { action: 'check' })
await step('list 课程盘点', { action: 'list', limit: 8 })
await step('get 演示课详情', { action: 'get', slug: 'course-studio-demo' })
await step('get 不存在的课程（应失败）', { action: 'get', slug: 'no-such-course' }, false)
await step('lint 风格校验', { action: 'lint' })
await step('build 编译校验', { action: 'build' })
await step('save 存证（buildOk=true）', {
  action: 'save', slug: 'course-studio-demo', subject: '数学', grade: '高中',
  goal: '验证课程工坊全链路', note: '冒烟测试存证', buildOk: 'true', warnings: 0,
})
const archives = (await import('../lib/data.js')).listArchives()
const id = archives[0]?.id
if (!id) { console.log('FAIL  save 后档案库为空'); failed++ }
await step('archive 档案列表', { action: 'archive' })
await step('get-archive 档案详情', { action: 'get-archive', id })
const saved = await step('save 重复 slug（再存一版）', {
  action: 'save', slug: 'course-studio-demo', subject: '数学', grade: '高中', note: '第二版',
})
await step('serve 启动预览服务', { action: 'serve', id }, true)
await step('serve 后健康检查', { action: 'check' })
await step('history 历史', { action: 'history' })
await step('delete 删除档案', { action: 'delete', id, confirm: 'yes' })
const events = (await import('../lib/data.js')).listArchiveHistory({ kind: 'delete' })
await step('restore 恢复', { action: 'restore', eventId: events[0]?.id })

// 真实课件页可达性（mgon-serve 渲染的学生视角页面）
const { previewUrl } = await import('../lib/serve.js')
const url = previewUrl(PORT, 'course-studio-demo', 'introduction')
try {
  const res = await fetch(url)
  const html = await res.text()
  const hit = res.ok && html.includes('课程工坊演示课')
  console.log(`${hit ? 'PASS' : 'FAIL'}  真实课件页渲染 ${url}（HTTP ${res.status}${hit ? '，含课件标题' : ''}）`)
  if (!hit) failed++
} catch (err) {
  console.log(`FAIL  真实课件页渲染：${err.message}`)
  failed++
}

console.log(`\n== ${failed ? `${failed} 项失败` : '全部通过'}；沙盒：${process.env.DSH_HOME}（不清理，留查证） ==`)
process.exit(failed ? 1 : 0)
