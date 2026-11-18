// 课程工坊 · Host 半边（技能快照 + course_studio 原生工具 + 看板数据面）。
// 工具职责：盘点 Mathigon 仓库课程 / 环境自检 / 编译校验 / 课件存证 / 预览服务。
// 创作本身由 agent 按 skill 完成（写 content.md + functions.ts + styles.scss）。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Schema from '@deepseek-ai/schemastery'
import { registerApi } from '../lib/api.js'
import { createSkillProvider } from '../lib/skills.js'
import { copyCourseSource, getCourse, scanCourses } from '../lib/courses.js'
import {
  archiveDirFor, archiveSummary, deleteArchive, getArchive, listArchiveHistory, listArchives,
  newArchiveId, restoreFromHistory, saveArchive, KIND_LABEL,
} from '../lib/data.js'
import { previewUrl, serverHealth, startServer, verifyCourse } from '../lib/serve.js'

const PLUGIN_VERSION = (() => {
  try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version } catch { return '?' }
})()

export const name = 'course-studio'

export const inject = ['tools', 'skills', 'webServer', 'connection']

export const Config = Schema.object({
  textbooksDir: Schema.string().default('D:\\textbooks-master').description('Mathigon 课程仓库根目录（含 content/ 与 package.json）'),
  previewPort: Schema.number().default(5000).description('本地预览服务端口（mgon-serve）'),
})

export const configRef = { config: null }

function check(args, spec) {
  const problems = []
  for (const key of spec.required || []) {
    if (args?.[key] === undefined) problems.push(`缺少必填参数 ${key}`)
  }
  for (const [key, rule] of Object.entries(spec.properties || {})) {
    const value = args?.[key]
    if (value === undefined) continue
    if (rule.enum && !rule.enum.includes(value)) problems.push(`${key} 只能是 ${rule.enum.join(' / ')} 之一`)
  }
  for (const key of Object.keys(args || {})) {
    if (!spec.properties || !(key in spec.properties)) problems.push(`未知参数 ${key}`)
  }
  if (problems.length) throw new Error(`course_studio 参数有误：${problems.join('；')}。`)
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string', description: '给模型看的回执' },
      data: { type: 'string', description: '可选：详情正文' },
    },
  },
  render: (_args, value) => text(value.data ? `${value.summary}\n\n${value.data}` : value.summary),
}

const result = (ok, summary, data = '') => ({ ok, summary, data })

const cfg = () => ({
  repoDir: configRef.config?.textbooksDir || 'D:\\textbooks-master',
  port: Number(configRef.config?.previewPort) || 5000,
})

// ---------------------------------------------------------------------------
// 工具：course_studio —— 课程盘点 / 自检 / 校验 / 存证 / 预览
// ---------------------------------------------------------------------------
export const courseStudioTool = {
  name: 'course_studio',
  description:
    '课程工坊工具（配合 course-studio 技能使用）：' +
    'list 盘点课件仓库现有课程（找参照、避免 slug 撞名）、check 环境自检（仓库/依赖/预览服务）、' +
    'get 取一门课程的 section 清单、lint + build 编译校验（抓 Maths parsing error / 缺 glossary key，写完课件必须跑）、' +
    'save 课件存证（复制源文件入档案库，用户在侧栏「课程工坊」看板回看+预览真实渲染效果）、' +
    'serve 启动本地预览服务（mgon-serve，面板 iframe 预览用）、archive/history/delete/restore 档案管理。' +
    '制作课件的标准闭环：写课程 → lint → build → save → serve + 告知用户去面板预览。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('list 盘点课程；check 环境自检；get 课程详情；lint 风格校验（自动修）；build 编译校验；save 课件存证；serve 启动预览服务；archive 档案列表；get-archive 档案详情；delete 删除档案；history 档案历史；restore 恢复删除的档案',
        { enum: ['list', 'check', 'get', 'lint', 'build', 'save', 'serve', 'archive', 'get-archive', 'delete', 'history', 'restore'] }),
      slug: str('get：课程目录名（content/ 下的目录名，list 里能看到）；save：课件所在课程目录名（必填）'),
      locale: str('save/get：课件 locale（en=content/ 直接写，cn=translations/cn 镜像），默认 en', { enum: ['en', 'cn'] }),
      title: str('save：课件标题（不传则自动从 content.md H1 读）'),
      subject: str('save：学科（数学/物理/化学/生物/地理/信息科技/其他）'),
      grade: str('save：学段（小学/初中/高中/大学/通识）'),
      goal: str('save：教学目标一句话（面板档案卡片显示）'),
      sections: str('save：section slug 列表 JSON 数组或逗号分隔（不传则自动从 content.md 的 > section: 读）'),
      note: str('save：这一版做了什么（写进历史，方便回看）；history：关键词'),
      buildOk: str('save：编译校验是否通过（先跑 build 再 save，通过传 true；未校验会如实标记 buildOk=false）', { enum: ['true', 'false'] }),
      warnings: num('save：build 报告的警告条数'),
      noLint: str('build：传 "true" 跳过 lint 只做编译（lint 已单独跑过时用）', { enum: ['true', 'false'] }),
      id: str('get-archive/delete/serve-id：档案 id（archive 里能看到）'),
      section: str('serve：可选，要预览的 section slug（不传用档案第一个 section）'),
      confirm: str('delete 必须传 "yes"', { enum: ['yes'] }),
      kind: str('history：只看某一类事件', { enum: ['all', 'create', 'update', 'delete', 'restore'] }),
      limit: num('history/list：最多几条，默认 20'),
      eventId: str('restore：历史事件 id（history 里能看到）'),
    },
  },
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)
    const { repoDir, port } = cfg()

    if (args.action === 'list') {
      const courses = scanCourses(repoDir)
      if (!courses.length) {
        return result(false, `在 ${repoDir} 没扫到任何课程（content/ 下要有含 content.md 的目录）。检查插件 Config 的「课程仓库路径」。`)
      }
      const limit = Math.min(200, Number(args.limit) || 60)
      const shown = courses.slice(0, limit)
      const lines = shown.map((c) =>
        `- ${c.slug}｜${c.title}${c.chinese ? '｜中文' : ''}｜${c.sectionCount} sections / ${c.steps} steps｜locales: ${c.locales.join('+')}`)
      return result(true, `仓库 ${repoDir} 共 ${courses.length} 门课程${courses.length > limit ? `（显示前 ${limit} 门）` : ''}：`,
        lines.join('\n') + '\n\n写新课前先读一门最接近的课程的 content.md + functions.ts；slug 不要撞上面这些名字。')
    }

    if (args.action === 'check') {
      const { existsSync } = await import('node:fs')
      const repo = {
        dir: repoDir,
        pkg: existsSync(join(repoDir, 'package.json')),
        deps: existsSync(join(repoDir, 'node_modules')),
        content: existsSync(join(repoDir, 'content')),
        skill: existsSync(join(repoDir, '.agents', 'skills', 'mathigon-skill')),
      }
      const health = await serverHealth(port)
      const lines = [
        `仓库目录：${repoDir} ${repo.pkg ? '✓' : '✗（检查插件 Config）'}`,
        `依赖 node_modules：${repo.deps ? '✓' : '✗（需要先 npm install）'}`,
        `content/ 目录：${repo.content ? '✓' : '✗'}`,
        `仓库自带 mathigon-skill 参考：${repo.skill ? '✓' : '（无，用插件内置 skill）'}`,
        `预览服务 :${port}：${health.up ? '✓ 在跑' : '✗ 没起（save 后用 serve 动作启动）'}`,
      ]
      return result(repo.pkg && repo.deps, lines.join('\n'),
        repo.pkg && repo.deps ? '' : '环境没就绪时不要开始写课件，先解决仓库/依赖。')
    }

    if (args.action === 'get') {
      if (!args.slug) throw new Error('get 需要 slug（先 list 找到）。')
      const course = getCourse(repoDir, args.slug, args.locale)
      if (!course) return result(false, `课程 ${args.slug} 不存在（locale=${args.locale}）。用 list 查看现有课程。`)
      return result(true, `课程「${course.title}」（${course.slug}，${course.chinese ? '中文课件' : '英文课件'}，${course.sectionCount} sections）：`,
        `sections: ${course.sections.join(', ') || '（无显式 section 指令！）'}\nsteps=${course.steps} blanks=${course.blanks} interactives=${course.interactives}`)
    }

    if (args.action === 'lint' || args.action === 'build') {
      const outcome = await verifyCourse(repoDir, { lint: args.action === 'lint' || args.noLint !== 'true' })
      if (outcome.error) return result(false, outcome.error)
      const lines = []
      if (outcome.lint) {
        lines.push(`lint：${outcome.lint.code === 0 ? '通过（lint-fix 已自动修风格）' : `退出码 ${outcome.lint.code}`}${outcome.lint.errors.length ? `\n  ${outcome.lint.errors.join('\n  ')}` : ''}`)
      }
      if (outcome.build) {
        lines.push(`编译（mgon-build）：${outcome.build.errors.length ? '有错误' : outcome.build.warnings.length ? `通过，${outcome.build.warnings.length} 条警告` : '通过，零警告'}`)
        if (outcome.build.errors.length) lines.push(`  错误：\n  ${outcome.build.errors.join('\n  ')}`)
        if (outcome.build.warnings.length) lines.push(`  警告：\n  ${outcome.build.warnings.join('\n  ')}`)
      }
      const ok = outcome.ok
      return result(ok, ok
        ? `校验通过。接下来：course_studio save 存证 → serve 启动预览 → 让用户去侧栏「课程工坊」预览真实课件。`
        : `校验没通过，按上面的错误逐条修完再重跑（Maths parsing error 多半是中文混进了 backtick 公式）。`,
        lines.join('\n') + (outcome.tail && !ok ? `\n\n构建输出末尾：\n${outcome.tail}` : ''))
    }

    if (args.action === 'save') {
      if (!args.slug) throw new Error('save 需要 slug（课件所在课程目录名）。')
      const course = getCourse(repoDir, args.slug, args.locale)
      if (!course) return result(false, `课程 ${args.slug} 不存在（locale=${args.locale}）。先写好 content/ <slug>/content.md，再 save。`)
      // 同 slug+locale 的档案已存在 → 覆盖更新多一版历史（agent 不用记 id）
      const existing = listArchives().find((a) => a.courseSlug === course.slug && a.locale === (args.locale || course.locale))
      const id = existing?.id || newArchiveId()
      // 先定 id → 复制源文件入档案库 → 一次 saveArchive（单条历史事件）
      const destDir = archiveDirFor(id)
      const files = copyCourseSource(course.dir, destDir)
      const { archive: a, created } = saveArchive({
        id,
        title: args.title || course.title,
        courseSlug: course.slug,
        locale: args.locale || course.locale,
        subject: args.subject,
        grade: args.grade,
        goal: args.goal,
        sections: args.sections || course.sections,
        note: args.note,
        buildOk: args.buildOk === 'true',
        warnings: args.warnings,
        sourceDir: destDir,
        files,
      })
      return result(true,
        `课件「${a.title}」已${created ? '存证' : `更新（第 ${a.revisions.length} 版）`}（id=${a.id}，${(a.sections || []).length} 个 section，源文件 ${files.length} 项，buildOk=${a.buildOk ? 'true' : 'false'}）。` +
        `用户可在侧栏「课程工坊」→ 课件档案回看；serve 启动预览服务后可在面板里看到真实渲染的课件。` +
        (a.buildOk ? '' : ' 注意：这份课件还没通过编译校验，先跑 build 再交付。'))
    }

    if (args.action === 'serve') {
      const outcome = await startServer(repoDir, port)
      let line = outcome.ok
        ? (outcome.alreadyRunning ? `预览服务已在跑：${outcome.url}` : `预览服务已启动：${outcome.url}`)
        : `预览服务没起来：${outcome.error}`
      if (args.id) {
        const archive = getArchive(args.id)
        if (archive && outcome.ok) line += `\n「${archive.title}」预览地址：${previewUrl(port, archive.courseSlug, args.section || archive.sections?.[0])}（面板 iframe 会加载它）`
      }
      return result(outcome.ok, line, outcome.ok ? '' : outcome.error || '')
    }

    if (args.action === 'archive') {
      const archives = listArchives()
      if (!archives.length) return result(true, '还没有课件档案。save 一份即可。')
      const limit = Math.min(100, Number(args.limit) || 20)
      return result(true, `共 ${archives.length} 份课件档案：`,
        archives.slice(0, limit).map((a) => {
          const s = archiveSummary(a)
          return `- ${s.title}（${s.subject}·${s.grade}｜${s.courseSlug}｜${s.sectionCount} sections｜${s.buildOk ? '校验✓' : '未校验'}｜id=${s.id}）`
        }).join('\n'))
    }

    if (args.action === 'get-archive') {
      const archive = args.id ? getArchive(args.id) : null
      if (!archive) return result(false, `没有课件档案 ${args.id || ''}（先 archive 列表找 id）。`)
      const s = archiveSummary(archive)
      return result(true, `课件档案「${s.title}」（${s.subject}·${s.grade}）：`,
        `课程：${s.courseSlug}（${s.locale}）\nsections: ${s.sections.join(', ')}\n教学目标：${s.goal || '—'}\n存档文件：${s.files.join(', ') || '—'}\n校验：${s.buildOk ? '通过' : '未通过/未校验'}（${s.warnings} 警告）\n版本：${s.revisions} 版\n预览：${previewUrl(port, s.courseSlug, s.sections[0])}`)
    }

    if (args.action === 'history') {
      const events = listArchiveHistory({ kind: args.kind || 'all', q: args.note || args.q, limit: Math.min(100, Number(args.limit) || 20) })
      if (!events.length) return result(true, '还没有历史记录', 'save / delete 之后这里会留记录。')
      return result(true, `最近 ${events.length} 条课件历史：`,
        events.map((e) => `- ${String(e.at).slice(0, 16).replace('T', ' ')} ${KIND_LABEL[e.kind] || e.kind}｜${e.title}｜${e.summary}｜event=${e.id}`).join('\n'))
    }

    if (args.action === 'restore') {
      const event = args.eventId ? listArchiveHistory({ limit: 300 }).find((e) => e.id === args.eventId) : null
      const target = event && event.kind === 'delete' ? restoreFromHistory(args.eventId) : null
      if (!target) {
        const hint = event ? '这条历史不是删除记录（只有删除才有快照可恢复）。' : '要传 eventId（history 里能看到，形如 ev-xxx）。'
        return result(false, '没有可恢复的快照', hint)
      }
      return result(true, `已恢复课件档案「${target.title}」（id=${target.id}）`, archiveSummary(target) && `sections: ${(target.sections || []).join(', ')}`)
    }

    // delete
    if (!args.id) throw new Error('delete 需要 id（先 archive 找到）。')
    if (args.confirm !== 'yes') return result(false, '删除课件档案请用 confirm:"yes"。')
    const removed = deleteArchive(args.id)
    return removed
      ? result(true, `课件档案「${removed.title}」已删除（生成历史里留了快照，可用 restore 恢复；仓库里的课程源文件不受影响）。`)
      : result(false, `没有课件档案 ${args.id}。`)
  },
}

export function apply(ctx, config) {
  configRef.config = { ...(config ?? {}), _version: PLUGIN_VERSION }
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]

  ctx.effect(() => ctx.tools.register(courseStudioTool), `${name}: tool course_studio`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs, configRef.config.textbooksDir)), `${name}: skills`)
  ctx.effect(() => registerApi(ctx, { configRef }), `${name}: routes`)
}
