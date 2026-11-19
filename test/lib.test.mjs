// 课程工坊 · lib 层单测（沙盒：临时目录模拟 Mathigon 仓库 + 独立 DSH_HOME）。
// 运行：node test/lib.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SANDBOX = mkdtempSync(join(tmpdir(), 'dsh-course-studio-test-'))
process.env.DSH_HOME = join(SANDBOX, 'dsh-home') // 必须在 import data.js 之前设好

const { scanCourses, getCourse, copyCourseSource, readArchivedFile, isChineseCourse } =
  await import('../lib/courses.js')
const {
  DATA_DIR, COURSES_DIR, KIND_LABEL, SUBJECTS, newArchiveId, saveArchive, listArchives,
  getArchive, deleteArchive, restoreFromHistory, listArchiveHistory, clearHistory,
  stats, archiveSummary, archiveDirFor,
} = await import('../lib/data.js')
const { parseBuildOutput, previewUrl, serverHealth, verifyCourse, previewBase } =
  await import('../lib/serve.js')

// ---------------------------------------------------------------- 沙盒仓库

const REPO = join(SANDBOX, 'textbooks')
function seedRepo() {
  const en = join(REPO, 'content', 'pythagoras-lab')
  mkdirSync(join(en, 'images'), { recursive: true })
  writeFileSync(join(en, 'content.md'), [
    '# 勾股定理互动课',
    '',
    '## 引入：金字塔里的直角',
    '> id: intro',
    '> section: intro',
    '',
    '古代埃及人用 [[绳结]] 放样直角。',
    '',
    '## 面积拼块证明',
    '> id: puzzle-proof',
    '> section: puzzle-proof',
    '> goals: place-u',
    '',
    '拖动方块：`a^2 + b^2 = c^2`',
    '',
    '## 应用与测验',
    '> id: quiz',
    '> section: quiz',
    '',
  ].join('\n'), 'utf8')
  writeFileSync(join(en, 'functions.ts'), 'export function intro($step) {}\n', 'utf8')
  writeFileSync(join(en, 'styles.scss'), '.pythagoras { color: red; }\n', 'utf8')
  writeFileSync(join(en, 'hints.yaml'), 'drag-hint: 试着拖动橙色点。\n', 'utf8')
  writeFileSync(join(en, 'images', 'fig.png'), 'fake-png', 'utf8')

  // 中文镜像（translations/cn）
  const cn = join(REPO, 'translations', 'cn', 'circles')
  mkdirSync(cn, { recursive: true })
  writeFileSync(join(cn, 'content.md'), '# 圆与π\n\n## 引言\n> id: intro\n> section: introduction\n\n圆是最完美的图形。\n', 'utf8')

  // 无 content.md 的目录（应被忽略）
  mkdirSync(join(REPO, 'content', '_drafts'), { recursive: true })
}
seedRepo()

test.after?.(() => rmSync(SANDBOX, { recursive: true, force: true }))

// ---------------------------------------------------------------- courses.js

test('scanCourses：识别课程、解析标题/sections/steps/blanks', () => {
  const list = scanCourses(REPO)
  const ours = list.find((c) => c.slug === 'pythagoras-lab')
  assert.ok(ours, '应扫到 pythagoras-lab')
  assert.equal(ours.title, '勾股定理互动课')
  assert.deepEqual(ours.sections, ['intro', 'puzzle-proof', 'quiz'])
  assert.equal(ours.sectionCount, 3)
  assert.equal(ours.steps, 3)
  assert.ok(ours.blanks >= 1)
  assert.equal(ours.chinese, true)
})

test('scanCourses：合并 en 主课程与 cn 翻译镜像（locales 合并）', () => {
  // circles 只有 cn 有 content.md（本地沙盒没放 en 版），也应独立成一条、locale=cn
  const circles = scanCourses(REPO).find((c) => c.slug === 'circles')
  assert.ok(circles, '应扫到 translations/cn/circles')
  assert.equal(circles.locale, 'cn')
  assert.deepEqual(circles.locales, ['cn'])
})

test('scanCourses：忽略 _ 开头目录与缺 content.md 的目录', () => {
  const slugs = scanCourses(REPO).map((c) => c.slug)
  assert.ok(!slugs.includes('_drafts'))
})

test('isChineseCourse：中文正文判 true，英文判 false', () => {
  assert.equal(isChineseCourse('# 勾股定理\n\n这是中文课件。'), true)
  assert.equal(isChineseCourse('# Circles and Pi\n\nFor as long as humans existed...'), false)
})

test('getCourse：取单门课；不存在的 slug 返回 null', () => {
  const course = getCourse(REPO, 'pythagoras-lab')
  assert.equal(course.title, '勾股定理互动课')
  assert.ok(course.dir.endsWith(join('content', 'pythagoras-lab')))
  assert.equal(getCourse(REPO, 'no-such-course'), null)
})

test('sections 去重保序：同一步骤/后续步骤重复声明 > section: 不虚增 section 数', () => {
  const repo = join(SANDBOX, 'dup-repo')
  const dir = join(repo, 'content', 'dup-sections')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'content.md'), [
    '# 重复 section 的课',
    '',
    '## 两种温标',
    '> id: scales',
    '> section: scales',
    '',
    '正文。',
    '',
    '---',
    '> id: slope',
    '> section: scales',   // 同一 section 的第二个 step（常见写法）
    '',
    '正文。',
    '',
    '## 一次函数图像',
    '> id: graph',
    '> section: linear',
    '',
    '---',
    '> id: slider',
    '> section: linear',
    '',
  ].join('\n'), 'utf8')
  assert.deepEqual(getCourse(repo, 'dup-sections').sections, ['scales', 'linear'])
  const scanned = scanCourses(repo).find((c) => c.slug === 'dup-sections')
  assert.equal(scanned.sectionCount, 2)
  // steps 仍按 > id: 数（4 个 step），不受 section 去重影响
  assert.equal(scanned.steps, 4)
})

test('interactives：pug 缩进式组件 / HTML 标签 / 句内滑块都计数，静态 x-img 不算', () => {
  const repo = join(SANDBOX, 'int-repo')
  const dir = join(repo, 'content', 'int-course')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'content.md'), [
    '# 互动组件统计',
    '',
    '> id: one',
    '> section: intro',
    '',
    '    x-geopad(width=600 height=400)',
    '    x-slider(:bind="n" min=0 max=10)',
    '',
    '    x-img(src="fig.png")',           // 静态媒体，不算互动
    '',
    '<x-coordinate-system size="400"></x-coordinate-system>',
    '',
    '拖动滑块：现在是 ${n}{n|5|2,20,1} 摄氏度。',
    '',
  ].join('\n'), 'utf8')
  assert.equal(getCourse(repo, 'int-course').interactives, 4) // geopad + slider + coordinate-system + 句内滑块
})

test('copyCourseSource：三件套 + hints + images 都归档，返回文件清单', () => {
  const course = getCourse(REPO, 'pythagoras-lab')
  const dest = join(SANDBOX, 'archive-out')
  const files = copyCourseSource(course.dir, dest)
  assert.ok(files.includes('content.md'))
  assert.ok(files.includes('functions.ts'))
  assert.ok(files.includes('styles.scss'))
  assert.ok(files.includes('hints.yaml'))
  assert.ok(files.includes('images/'))
  assert.ok(existsSync(join(dest, 'images', 'fig.png')))
})

test('readArchivedFile：白名单外/穿越路径拒绝，白名单内返回文本', () => {
  const dir = join(SANDBOX, 'archive-out')
  assert.ok(readArchivedFile(dir, 'content.md').includes('勾股定理'))
  assert.equal(readArchivedFile(dir, 'package.json'), null)
  assert.equal(readArchivedFile(dir, '../escape.txt'), null)
  assert.equal(readArchivedFile(dir, 'does-not-exist.md'), null)
})

// ---------------------------------------------------------------- data.js

test('data 目录落在 DSH_HOME 沙盒下', () => {
  assert.ok(DATA_DIR.startsWith(process.env.DSH_HOME))
  assert.ok(COURSES_DIR.startsWith(DATA_DIR))
})

test('newArchiveId：course-<日期>-<随机> 格式且不重复', () => {
  const a = newArchiveId()
  const b = newArchiveId()
  assert.match(a, /^course-\d{8}-[a-z0-9]{4}$/)
  assert.notEqual(a, b)
})

test('saveArchive：新建（缺省 subject/grade/sections 归一），archiveSummary 完整', () => {
  const { archive, created } = saveArchive({
    title: '勾股定理互动课', courseSlug: 'pythagoras-lab', locale: 'en',
    subject: '数学', grade: '初中', goal: '学生能拼出面积证明',
    sections: 'intro, puzzle-proof, quiz', note: '首版',
  })
  assert.equal(created, true)
  assert.match(archive.id, /^course-/)
  assert.equal(archive.subject, '数学')
  assert.deepEqual(archive.sections, ['intro', 'puzzle-proof', 'quiz'])
  assert.equal(archiveSummary(archive).sectionCount, 3)
  assert.equal(listArchives().length, 1)
})

test('saveArchive：section 数组/逗号串/空值都能归一，非法学科回落', () => {
  const { archive } = saveArchive({ title: 'X 课', courseSlug: 'x', subject: '魔法', sections: ['a', ' b ', ''] })
  assert.equal(archive.subject, '其他')
  assert.deepEqual(archive.sections, ['a', 'b'])
  // 上限 40
  const many = Array.from({ length: 50 }, (_, i) => `s${i}`)
  const { archive: capped } = saveArchive({ title: 'Y 课', courseSlug: 'y', sections: many })
  assert.equal(capped.sections.length, 40)
})

test('saveArchive：同 id 覆盖更新多一版 revision + update 历史', () => {
  const first = listArchives()[0]
  const { archive, created } = saveArchive({
    id: first.id, title: '勾股定理互动课（修订）', courseSlug: first.courseSlug,
    subject: first.subject, grade: first.grade, note: '修了 quiz',
  })
  assert.equal(created, false)
  assert.equal(archive.revisions.length, 1)
  assert.equal(archive.revisions[0].rev, 1)
  const events = listArchiveHistory({ kind: 'update' })
  assert.ok(events.some((e) => e.archiveId === first.id && e.summary === '修了 quiz'))
})

test('saveArchive：title/courseSlug 缺失直接抛错', () => {
  assert.throws(() => saveArchive({ courseSlug: 'x' }), /标题/)
  assert.throws(() => saveArchive({ title: 't' }), /课程目录名/)
})

test('deleteArchive：留删除快照，restore 恢复；重复恢复不重复插入', () => {
  const victim = saveArchive({ title: '待删课', courseSlug: 'doomed' }).archive
  const removed = deleteArchive(victim.id)
  assert.ok(removed)
  assert.equal(getArchive(victim.id), null)
  const delEvents = listArchiveHistory({ kind: 'delete' })
  const ev = delEvents.find((e) => e.archiveId === victim.id)
  assert.ok(ev?.snapshot, '删除事件带快照')
  const restored = restoreFromHistory(ev.id)
  assert.equal(restored.id, victim.id)
  assert.ok(getArchive(victim.id))
  // 档案已存在时再 restore 返回快照但不再插入
  const again = restoreFromHistory(ev.id)
  assert.equal(listArchives().filter((a) => a.id === victim.id).length, 1)
  assert.equal(restoreFromHistory('ev-not-exist'), null)
})

test('listArchiveHistory：kind/q/limit 过滤', () => {
  const all = listArchiveHistory({ limit: 100 })
  assert.ok(all.length >= 3)
  const limited = listArchiveHistory({ limit: 2 })
  assert.equal(limited.length, 2)
  const q = listArchiveHistory({ q: '勾股' })
  assert.ok(q.length >= 1)
  assert.ok(q.every((e) => `${e.title} ${e.summary}`.includes('勾股')))
})

test('stats：档案数/section 合计/事件数一致', () => {
  const s = stats()
  assert.equal(s.archives, listArchives().length)
  assert.equal(s.sections, listArchives().reduce((n, a) => n + (a.sections || []).length, 0))
  assert.equal(s.events, listArchiveHistory({ limit: 300 }).length)
  assert.ok(s.subjects['数学'] >= 1)
})

test('clearHistory：清空后 stats.events 归零（档案保留）', () => {
  const before = listArchives().length
  clearHistory()
  assert.equal(stats().events, 0)
  assert.equal(listArchives().length, before)
})

test('KIND_LABEL / SUBJECTS 常量齐全', () => {
  assert.deepEqual(Object.keys(KIND_LABEL), ['create', 'update', 'delete', 'restore'])
  assert.ok(SUBJECTS.includes('数学'))
})

test('archiveDirFor：档案目录在 DATA_DIR/courses 下', () => {
  assert.ok(archiveDirFor('course-20260101-abcd').includes(join('courses', 'course-20260101-abcd')))
})

// ---------------------------------------------------------------- serve.js

test('parseBuildOutput：Maths parsing error 进 errors，Missing keys 进 warnings', () => {
  const out = [
    'building circles...',
    '! [WARNING] Maths parsing error in "1/2 × (两平行边之和)": Unknown symbol "两"',
    '! [WARNING] Missing glossary keys: foo',
    '! [WARNING] Maths parsing error in "1/2 × (两平行边之和)": Unknown symbol "两"',
    'build done, 0 errors',
  ].join('\n')
  const { errors, warnings } = parseBuildOutput(out)
  assert.equal(errors.length, 1, '同类错误去重')
  assert.match(errors[0], /Maths parsing error/)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /Missing glossary keys/)
})

test('parseBuildOutput：0 errors / 进度行不算错误', () => {
  const { errors } = parseBuildOutput('compiling...\nbuild done, 0 errors\nall good')
  assert.equal(errors.length, 0)
})

test('parseBuildOutput：真实 error 行进 errors', () => {
  const { errors } = parseBuildOutput('Error: Cannot find module "./components/foo"')
  assert.equal(errors.length, 1)
})

test('previewUrl：带/不带 section', () => {
  assert.equal(previewUrl(5000, 'circles', 'introduction'), 'http://127.0.0.1:5000/course/circles/introduction')
  assert.equal(previewUrl(8080, 'circles'), 'http://127.0.0.1:8080/course/circles')
  assert.equal(previewBase(5000), 'http://127.0.0.1:5000')
})

test('serverHealth：没人监听的端口返回 up:false（不抛错）', async () => {
  const out = await serverHealth(59999)
  assert.equal(out.up, false)
})

test('verifyCourse：仓库不存在/缺 node_modules 直接报错，不跑 npm', async () => {
  const missing = await verifyCourse(join(SANDBOX, 'no-such-repo'))
  assert.equal(missing.ok, false)
  assert.match(missing.error, /package.json/)
  const empty = mkdtempSync(join(tmpdir(), 'course-empty-'))
  writeFileSync(join(empty, 'package.json'), '{}', 'utf8')
  const noDeps = await verifyCourse(empty)
  assert.equal(noDeps.ok, false)
  assert.match(noDeps.error, /node_modules/)
  rmSync(empty, { recursive: true, force: true })
})

// ---------------------------------------------------------------- 冒烟：数据文件落盘

test('存证 JSON 真实落盘（archives.json 可读回）', () => {
  const raw = JSON.parse(readFileSync(join(DATA_DIR, 'archives.json'), 'utf8'))
  assert.ok(Array.isArray(raw) && raw.length >= 3)
})
