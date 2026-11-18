// 课程工坊 · 课件档案 + 历史持久化（$DSH_HOME/dsh-course-studio/）。
//
//   archives.json  [{ id, title, courseSlug, locale, subject, grade, goal, sections[],
//                     note, buildOk, warnings, dir, files[], createdAt, updatedAt,
//                     revisions: [{ rev, at, kind, title, note }] }]
//   history.json   [{ id, at, kind: create|update|delete|restore, archiveId, title,
//                     sectionCount, rev, summary, snapshot? }]
//
// 每次 save 都多一版（revisions，最多 20 版）；保存/删除/恢复都写 history，
// 工具 course_studio 的 history 动作和面板「课件档案」读同一份。
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-course-studio')
const COURSES_DIR = join(DATA_DIR, 'courses')
const ARCHIVE_FILE = join(DATA_DIR, 'archives.json')
const HIST_FILE = join(DATA_DIR, 'history.json')
const MAX_ARCHIVES = 100
const MAX_REVISIONS = 20
const MAX_HISTORY = 300

export const KIND_LABEL = { create: '新建', update: '更新', delete: '删除', restore: '恢复' }
export const SUBJECTS = ['数学', '物理', '化学', '生物', '地理', '信息科技', '其他']
export const GRADES = ['小学', '初中', '高中', '大学', '通识']

export function ensureDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  if (!existsSync(COURSES_DIR)) mkdirSync(COURSES_DIR, { recursive: true })
}

// 原子写：先 .tmp 再 rename，页面轮询时不会读到半截 JSON。
function writeJson(file, value) {
  ensureDirs()
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  try {
    renameSync(tmp, file)
  } catch (err) {
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    throw err
  }
}

function readJson(file, fallback) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    return raw ?? fallback
  } catch {
    return fallback
  }
}

function load() {
  const raw = readJson(ARCHIVE_FILE, [])
  return Array.isArray(raw) ? raw : []
}

function save(list) {
  writeJson(ARCHIVE_FILE, list.slice(0, MAX_ARCHIVES))
}

function loadHistory() {
  const raw = readJson(HIST_FILE, [])
  return Array.isArray(raw) ? raw : []
}

function pushHistory(event) {
  const list = loadHistory()
  list.unshift(event)
  writeJson(HIST_FILE, list.slice(0, MAX_HISTORY))
}

const now = () => new Date().toISOString()
const id4 = () => Math.random().toString(36).slice(2, 6)

// host 在复制源文件前先要一个档案 id（目录名依赖它）；saveArchive 传入同一 id 就不会再生成
export function newArchiveId() {
  return `course-${now().slice(0, 10).replace(/-/g, '')}-${id4()}`
}

function normalizeSections(value) {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean).slice(0, 40)
  if (typeof value === 'string') return value.split(/[,，;；\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 40)
  return []
}

// ---------------------------------------------------------------- 档案

export function archiveSummary(a) {
  return {
    id: a.id, title: a.title, courseSlug: a.courseSlug, locale: a.locale,
    subject: a.subject, grade: a.grade, goal: a.goal || '', note: a.note || '',
    sections: a.sections, sectionCount: (a.sections || []).length,
    buildOk: Boolean(a.buildOk), warnings: a.warnings || 0,
    files: a.files || [], fileCount: (a.files || []).length,
    createdAt: a.createdAt, updatedAt: a.updatedAt,
    revisions: (a.revisions || []).length,
  }
}

// 保存课件档案（id 相同 = 覆盖更新，多一版 revision）。sourceDir 是已复制好源文件的目录。
export function saveArchive({ id, title, courseSlug, locale, subject, grade, goal, sections, note, buildOk, warnings, sourceDir, files }) {
  if (!title || !String(title).trim()) throw new Error('课件标题（title）不能为空。')
  if (!courseSlug || !String(courseSlug).trim()) throw new Error('课程目录名（courseSlug）不能为空。')
  const list = load()
  const sectionsNorm = normalizeSections(sections)
  const entry = {
    id: (id && list.some((a) => a.id === id) ? id : (id || newArchiveId())),
    title: String(title).trim(),
    courseSlug: String(courseSlug).trim(),
    locale: locale === 'cn' ? 'cn' : 'en',
    subject: SUBJECTS.includes(subject) ? subject : '其他',
    grade: GRADES.includes(grade) ? grade : '通识',
    goal: String(goal || '').trim(),
    sections: sectionsNorm,
    note: String(note || '').trim(),
    buildOk: Boolean(buildOk),
    warnings: Number.isFinite(Number(warnings)) ? Number(warnings) : 0,
    dir: sourceDir,
    files: Array.isArray(files) ? files : [],
    createdAt: now(), updatedAt: now(),
    revisions: [],
  }
  const existing = id ? list.find((a) => a.id === id) : null
  if (existing) {
    entry.id = existing.id
    entry.createdAt = existing.createdAt
    entry.revisions = [...(existing.revisions || []), {
      rev: (existing.revisions || []).length + 1, at: now(), kind: 'update',
      title: existing.title, note: entry.note || '覆盖更新',
    }].slice(-MAX_REVISIONS)
    Object.assign(existing, entry)
    save(list)
    pushHistory({ id: `ev-${now().replace(/\W/g, '')}-${id4()}`, at: now(), kind: 'update', archiveId: existing.id, title: existing.title, sectionCount: sectionsNorm.length, rev: entry.revisions.length, summary: entry.note || '更新课件' })
    return { archive: existing, created: false }
  }
  list.unshift(entry)
  save(list)
  pushHistory({ id: `ev-${now().replace(/\W/g, '')}-${id4()}`, at: now(), kind: 'create', archiveId: entry.id, title: entry.title, sectionCount: sectionsNorm.length, rev: 0, summary: `新建课件档案（${entry.subject} · ${entry.grade}，${sectionsNorm.length} 个 section）` })
  return { archive: entry, created: true }
}

export function listArchives() {
  return load()
}

export function getArchive(id) {
  return load().find((a) => a.id === id) || null
}

export function deleteArchive(id) {
  const list = load()
  const index = list.findIndex((a) => a.id === id)
  if (index === -1) return null
  const [removed] = list.splice(index, 1)
  save(list)
  pushHistory({ id: `ev-${now().replace(/\W/g, '')}-${id4()}`, at: now(), kind: 'delete', archiveId: removed.id, title: removed.title, sectionCount: (removed.sections || []).length, rev: (removed.revisions || []).length, summary: '删除课件档案（留快照可恢复）', snapshot: removed })
  return removed
}

export function restoreFromHistory(eventId) {
  const event = loadHistory().find((e) => e.id === eventId)
  if (!event || event.kind !== 'delete' || !event.snapshot) return null
  const list = load()
  if (list.some((a) => a.id === event.snapshot.id)) return event.snapshot // 已存在就不重复插
  list.unshift(event.snapshot)
  save(list)
  pushHistory({ id: `ev-${now().replace(/\W/g, '')}-${id4()}`, at: now(), kind: 'restore', archiveId: event.snapshot.id, title: event.snapshot.title, sectionCount: (event.snapshot.sections || []).length, rev: (event.snapshot.revisions || []).length, summary: '从删除快照恢复' })
  return event.snapshot
}

export function listArchiveHistory({ kind = 'all', q = '', limit = 20 } = {}) {
  let events = loadHistory()
  if (kind !== 'all') events = events.filter((e) => e.kind === kind)
  if (q) {
    const needle = q.toLowerCase()
    events = events.filter((e) => `${e.title} ${e.summary} ${e.archiveId}`.toLowerCase().includes(needle))
  }
  return events.slice(0, Math.min(100, Number(limit) || 20))
}

export function clearHistory() {
  writeJson(HIST_FILE, [])
}

export function stats() {
  const list = load()
  const events = loadHistory()
  const subjects = {}
  const grades = {}
  for (const a of list) {
    subjects[a.subject] = (subjects[a.subject] || 0) + 1
    grades[a.grade] = (grades[a.grade] || 0) + 1
  }
  const sections = list.reduce((n, a) => n + (a.sections || []).length, 0)
  return {
    archives: list.length,
    sections,
    buildOk: list.filter((a) => a.buildOk).length,
    events: events.length,
    lastEventAt: events[0]?.at || null,
    subjects, grades,
  }
}

export function archiveDirFor(id) {
  return join(COURSES_DIR, id)
}

// 源文件目录没传时给一个默认位置（档案库 courses/<id>/）
export { COURSES_DIR }
