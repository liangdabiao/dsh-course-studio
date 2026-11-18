// 课程工坊 · 技能快照提供方。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const RANK = 600
const INVOCATION = { modelInvocable: true, userInvocable: true }

function parse(file) {
  const text = readFileSync(file, 'utf8')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return null
  const block = m[1]
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  let description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^(["'])(.*)\1$/, '$2') || null
  if (!description) {
    const lines = block.split(/\r?\n/)
    const start = lines.findIndex((l) => /^description:\s*>/.test(l))
    if (start !== -1) {
      const collected = []
      for (let i = start + 1; i < lines.length; i++) {
        if (/^\S/.test(lines[i])) break
        collected.push(lines[i].replace(/^\s+/, ''))
      }
      description = collected.join(' ').trim()
    }
  }
  if (!name || !description) return null
  return { name, description, body: text.slice(m[0].length) }
}

function readDir(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const sDir = join(dir, entry.name)
    const skillFile = join(sDir, 'SKILL.md')
    if (!existsSync(skillFile)) continue
    const parsed = parse(skillFile)
    if (parsed) out.push({ dir: sDir, file: skillFile, ...parsed, dirName: entry.name })
  }
  return out
}

function addendum(skill, repoDir) {
  return [
    '',
    '---',
    '',
    '## 在 DSH 插件里使用',
    '',
    `- 本技能目录：\`${skill.dir}\`。**你的 bash 沙箱读不到插件安装目录**——开工前先把整个技能目录复制到当前工作区：`,
    '  ```bash',
    `  cp -r "${skill.dir}" ./course-studio-skill`,
    '  ```',
    `- 之后在工作区副本 \`./course-studio-skill/references/\` 里按需读附属文档（写 content.md 前必读 markdown-dialect.md；中文课件必读 chinese-localization.md）。`,
    `- **课件仓库**：\`${repoDir}\`（插件 Config「课程仓库路径」）。课程写到 \`content/<course-slug>/\` 下；这个目录你的 bash **可以直接读写**（不在插件安装目录里）。`,
    '- 仓库里 `content/` 已有几十门真实课程——**写之前先读一门最接近的课程**（如 circles、euclidean-geometry），抄它的结构与组件用法。',
    '- 完成后走闭环：`course_studio` 工具 `lint` → `build` 校验（盯 Maths parsing error）→ `save` 存证 → 告知用户在侧栏「课程工坊」看板预览。',
    '',
  ].join('\n')
}

export function createSkillProvider(dirs, repoDir) {
  const list = [].concat(dirs)
  const candidate = (s) => ({
    name: s.name, description: s.description, path: s.file,
    invocation: INVOCATION, source: 'bundled', provider: 'dsh-course-studio', rank: RANK,
    locator: s.dir, resourceBase: { kind: 'directory', path: s.dir },
  })

  return {
    name: 'dsh-course-studio',
    async list() { return list.flatMap(readDir).map(candidate) },
    async get(c) {
      const s = list.flatMap(readDir).find((x) => x.dir === c.locator && x.name === c.name)
      if (!s) return undefined
      const content = s.body + addendum(s, repoDir)
      const { rank, locator, ...summary } = candidate(s)
      return { ...summary, content }
    },
  }
}

export { readDir, addendum }
