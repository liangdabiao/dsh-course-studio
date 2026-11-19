// 课程工坊 · Mathigon 仓库扫描 + 课件源文件归档复制。
// Mathigon 课程结构（见 skill references）：content/<course>/content.md + functions.ts + styles.scss
// 中文课件直接写在 content/<course>/（规范见 references/chinese-localization.md）。
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// 一个课件目录里归档时带走的源文件（其余 images/svg/assets 目录整体复制）
const SOURCE_FILES = ['content.md', 'functions.ts', 'styles.scss', 'hints.yaml', 'package.json']

const countIds = (md) => (md.match(/^> id:/gm) || []).length
const countBlanks = (md) => (md.match(/\[\[/g) || []).length

// 互动组件（真正可操作的；x-img 之类静态媒体不算）。
const INTERACTIVE_TAGS = new Set([
  'x-geopad', 'x-slider', 'x-var', 'x-equation', 'x-equation-system', 'x-coordinate-system',
  'x-coordinate-sketch', 'x-picker', 'x-gesture', 'x-sortable', 'x-slideshow', 'x-tabbox',
  'x-free-text', 'x-scale-box', 'x-solved', 'x-buckets', 'x-polypad', 'x-solid',
  'x-polyhedron', 'x-conic-section', 'x-gallery', 'x-video',
])

// 组件两种写法都要算：pug 缩进行 `x-geopad(...)`（仓库里的真实用法）和 HTML 标签 `<x-slider ...>`。
const countInteractives = (md) => {
  let n = 0
  for (const m of md.matchAll(/(?:^|\n)[ \t]*(x-[a-z][\w-]*)\s*\(/g)) if (INTERACTIVE_TAGS.has(m[1])) n += 1
  for (const m of md.matchAll(/<(x-[a-z][\w-]*)[\s>]/g)) if (INTERACTIVE_TAGS.has(m[1])) n += 1
  // 句内滑块语法 `${n}{n|5|2,20,1}`：渲染成 x-var，源码里没有标签形态
  for (const m of md.matchAll(/\$\{([A-Za-z_]\w*)\}\{\1\s*\|/g)) n += 1
  return n
}

// section slug 去重保序：同一步骤/后续步骤重复声明 `> section:` 很常见（如 codes、zu-pi），
// 重复计数会让 section 数虚高，面板「section 合计」和档案 section 列表都跟着错。
const collectSections = (md) => [
  ...new Set((md.match(/^> section:\s*(.+)$/gm) || []).map((l) => l.replace(/^> section:\s*/, '').trim()).filter(Boolean)),
]

function parseTitle(md) {
  const h1 = md.match(/^#\s+(.+)$/m)
  return h1 ? h1[1].trim() : ''
}

// 判断一门课是不是中文课件：H1/正文里中文字符占比高
export function isChineseCourse(md) {
  const sample = md.slice(0, 4000)
  const cjk = (sample.match(/[\u4e00-\u9fff]/g) || []).length
  const latin = (sample.match(/[A-Za-z]/g) || []).length
  return cjk > 0 && cjk * 2 > latin
}

// 扫描仓库里全部课程（content/ 主课程 + translations/cn/ 翻译镜像，同一门课两边都有时合并为一条）
export function scanCourses(repoDir) {
  const contentDir = join(repoDir, 'content')
  const cnDir = join(repoDir, 'translations', 'cn')
  const map = new Map()
  const scan = (dir, locale) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.') || entry.name === 'shared') continue
      const mdFile = join(dir, entry.name, 'content.md')
      if (!existsSync(mdFile)) continue
      let md = ''
      try { md = readFileSync(mdFile, 'utf8') } catch { continue }
      const sections = collectSections(md)
      const slug = entry.name
      const prev = map.get(slug)
      const info = {
        slug,
        locale,
        title: parseTitle(md) || slug,
        chinese: isChineseCourse(md),
        sections,
        sectionCount: sections.length,
        steps: countIds(md),
        blanks: countBlanks(md),
        interactives: countInteractives(md),
        dir: join(dir, entry.name),
        updatedAt: safeMtime(mdFile),
      }
      if (!prev) { map.set(slug, info); continue }
      // 同一 slug：主 locale 的标题/元数据优先，sections 取更全的一边
      map.set(slug, {
        ...prev, ...info,
        title: prev.locale === 'en' && prev.title !== slug ? prev.title : info.title,
        sections: info.sections.length >= prev.sections.length ? info.sections : prev.sections,
        sectionCount: Math.max(prev.sectionCount, info.sectionCount),
        chinese: prev.chinese || info.chinese,
        locales: [...new Set([prev.locale, info.locale])],
        dir: prev.locale === 'en' ? prev.dir : info.dir,
      })
    }
  }
  scan(contentDir, 'en')
  scan(cnDir, 'cn')
  const list = [...map.values()].map((c) => ({ ...c, locales: c.locales || [c.locale] }))
  list.sort((a, b) => a.slug.localeCompare(b.slug))
  return list
}

function safeMtime(file) {
  try { return statSync(file).mtime.toISOString() } catch { return null }
}

export function getCourse(repoDir, slug, locale = 'en') {
  const base = locale === 'cn' ? join(repoDir, 'translations', 'cn') : join(repoDir, 'content')
  const dir = join(base, slug)
  const mdFile = join(dir, 'content.md')
  if (!existsSync(mdFile)) return null
  const md = readFileSync(mdFile, 'utf8')
  const sections = collectSections(md)
  return {
    slug, locale, dir, title: parseTitle(md) || slug,
    chinese: isChineseCourse(md), sections, sectionCount: sections.length,
    steps: countIds(md), blanks: countBlanks(md), interactives: countInteractives(md),
    updatedAt: safeMtime(mdFile),
  }
}

// 课件源文件归档复制：三件套 + hints.yaml + images/svg/audio/components 目录（存在才带）。
// 返回 { dir, files } —— files 是归档里实际落盘的相对路径清单。
export function copyCourseSource(courseDir, destDir) {
  const files = []
  mkdirSync(destDir, { recursive: true })
  for (const name of SOURCE_FILES) {
    const src = join(courseDir, name)
    if (!existsSync(src)) continue
    copyFileSync(src, join(destDir, name))
    files.push(name)
  }
  for (const sub of ['images', 'svg', 'audio', 'components']) {
    const src = join(courseDir, sub)
    if (!existsSync(src)) continue
    cpSync(src, join(destDir, sub), { recursive: true })
    files.push(`${sub}/`)
  }
  return files
}

// 从归档目录读回一个源文件的文本（给面板「查看源码」用）
export function readArchivedFile(archiveDir, rel) {
  const clean = String(rel || '').replace(/\\/g, '/')
  if (!SOURCE_FILES.includes(clean)) return null
  const file = join(archiveDir, clean)
  if (!existsSync(file)) return null
  return readFileSync(file, 'utf8')
}
