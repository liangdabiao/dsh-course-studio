// 课程工坊工作台 · 页面逻辑（无框架，hash 路由 + fetch /api/*）
// 布局对齐「带货视频拆解」：左侧 rail，右侧按路由渲染；
// 「发起制作」通过 postMessage 让宿主开新对话并填好创作指令。
const app = document.getElementById('app')
const navArchives = document.getElementById('nav-archives')
const navHistory = document.getElementById('nav-history')
const railFoot = document.getElementById('rail-foot')
const viewer = document.getElementById('viewer')
const viewerTitle = document.getElementById('viewer-title')
const viewerBody = document.getElementById('viewer-body')
const viewerCopy = document.getElementById('viewer-copy')
const toastEl = document.getElementById('toast')

// 页面挂在 /dsh-course-studio/ 下，接口同前缀（不能用 '/api/...' 根绝对路径，会打到宿主）
const BASE = location.pathname.replace(/\/+$/, '') || '/dsh-course-studio'

const state = { catalog: null, q: '', kind: 'all', previewId: null, previewSection: '' }

const KIND = { create: '新建', update: '更新', delete: '删除', restore: '恢复' }
const KIND_TONE = { create: 'ok', update: 'solid', delete: 'bad', restore: 'gold' }
const SOURCE_FILES = ['content.md', 'functions.ts', 'styles.scss', 'hints.yaml']

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const date = (iso) => (iso ? String(iso).slice(0, 10) : '')
const shortTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const kindLabel = (k) => KIND[k] || k || ''

async function api(path, opts) {
  const res = await fetch(BASE + path, opts)
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.ok === false) throw new Error(body.error || `请求失败（${res.status}）`)
  return body
}

async function post(path, payload) {
  return api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
}

function copy(text) {
  const value = String(text || '')
  if (!value) return
  try { navigator.clipboard?.writeText(value) } catch { /* ignore */ }
  toast('已复制到剪贴板')
}

// ---------------------------------------------------------------- 宿主通信 / 主题

addEventListener('message', (e) => {
  if (e.origin !== location.origin) return
  const m = e.data
  if (m && m.type === 'dsh-course-studio:scheme' && m.scheme) document.documentElement.dataset.scheme = m.scheme
  if (m && m.type === 'dsh-course-studio:start-failed') toast('开新对话失败：' + (m.message || ''))
})

function start(prompt) {
  try {
    parent.postMessage({ type: 'dsh-course-studio:start', prompt }, location.origin)
    toast('已把创作指令填进新对话，确认后发送即可')
  } catch {
    toast('当前环境开不了新对话，请手动复制指令')
  }
}

let toastTimer
function toast(text) {
  toastEl.textContent = text
  toastEl.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3400)
}

// ---------------------------------------------------------------- viewer（源码查看）

let viewerText = ''
function openViewer(title, text, { monospace = true } = {}) {
  viewerTitle.textContent = title
  viewerText = text || ''
  viewerBody.innerHTML = `<pre class="pre" style="max-height:none">${esc(viewerText)}</pre>`
  viewerCopy.hidden = false
  viewer.hidden = false
}
function closeViewer() { viewer.hidden = true }
viewerCopy.addEventListener('click', () => copy(viewerText))
viewer.addEventListener('click', (e) => { if (e.target === viewer) closeViewer() })
document.getElementById('viewer-close').addEventListener('click', closeViewer)
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !viewer.hidden) closeViewer() })

// ---------------------------------------------------------------- 数据

async function loadCatalog(force) {
  if (state.catalog && !force) return state.catalog
  state.catalog = await api('/api/catalog')
  return state.catalog
}

function badge(ok, okText, badText) {
  return `<span class="badge ${ok ? 'ok' : 'bad'}">${ok ? okText : badText}</span>`
}

// ---------------------------------------------------------------- 路由

async function render() {
  const hash = location.hash.replace(/^#\/?/, '') || 'home'
  const view = hash.split('?')[0]
  document.querySelectorAll('.nav a[data-view]').forEach((a) =>
    a.setAttribute('aria-current', a.dataset.view === view ? 'true' : 'false'))
  try {
    const catalog = await loadCatalog(true)
    const views = { home: viewHome, new: viewNew, archives: viewArchives, preview: viewPreview, history: viewHistory, guide: viewGuide }
    app.innerHTML = (views[view] || viewHome)(catalog)
    const binders = { home: bindHome, new: bindNew, archives: bindArchives, preview: bindPreview, history: bindHistory }
    if (binders[view]) binders[view](catalog, view)
  } catch (err) {
    app.innerHTML = `<div class="empty-box"><b>看板加载失败</b>${esc(err.message || err)}</div>`
  }
  navArchives.textContent = state.catalog?.archives?.length || ''
  navHistory.textContent = state.catalog?.history?.length || ''
  const s = state.catalog?.stats
  railFoot.innerHTML = s
    ? `<span class="txt">课件档案 ${s.archives} · section ${s.sections} · 历史 ${s.events}</span><span class="txt">v${esc(state.catalog.version || '?')}</span>`
    : ''
}

// ---------------------------------------------------------------- 概览

function viewHome(c) {
  const s = c.stats || {}
  const repo = c.repo || {}
  const server = c.server || {}
  const recent = (c.archives || []).slice(0, 6)
  return `
  <div class="wrap">
    <div class="head">
      <div class="eyebrow">COURSE STUDIO</div>
      <h1>课程工坊</h1>
      <p>提需求 → agent 按 course-studio 技能在本地 Mathigon 仓库创作互动课件（content.md + functions.ts）→ 编译校验 → 存证入档 → 这里预览<b>真实渲染</b>的课件。</p>
    </div>

    <div class="stats">
      <div class="stat accent"><b>${s.archives ?? 0}</b><small>课件档案</small></div>
      <div class="stat"><b>${s.sections ?? 0}</b><small>section 合计</small></div>
      <div class="stat jade"><b>${s.buildOk ?? 0}</b><small>编译校验通过</small></div>
      <div class="stat gold"><b>${s.events ?? 0}</b><small>历史事件</small></div>
    </div>

    <div class="sec-head"><h2>环境</h2><span class="sub">Mathigon 仓库与预览服务</span></div>
    <div class="panel">
      <dl class="kv">
        <dt>课程仓库</dt><dd>${badge(repo.exists, repo.dir, '未找到')} <code style="font-size:11px">${esc(repo.dir || '')}</code>
          ${repo.depsInstalled ? '' : badge(false, '', '缺 node_modules（需 npm install）')}</dd>
        <dt>预览服务</dt><dd>${badge(server.up, `运行中 :${server.port}`, '未启动')} <span class="preview-note">预览 = 本地 mgon-serve 渲染的真实课件页（${esc(server.base || '')}）</span></dd>
        <dt>技能快照</dt><dd>${(c.skills || []).map((k) => `<code>${esc(k.name)}</code>（${k.bodyChars} 字）`).join('　') || '—'}</dd>
      </dl>
    </div>

    <div class="sec-head"><h2>最近课件</h2><a class="more" href="#/archives">全部档案 →</a></div>
    ${recent.length ? `<div class="grid">${recent.map(archiveCard).join('')}</div>`
      : `<div class="empty-box"><b>还没有课件档案</b>去「发起制作」提一个课程需求，agent 做完会存证到这里。</div>`}
  </div>`
}

function bindHome(c) {
  app.querySelectorAll('[data-del]').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (!confirm('删除这份课件档案？（仓库源文件不受影响，可从历史恢复）')) return
      await post('/api/archive/remove', { id: btn.dataset.del })
      toast('已删除')
      render()
    }))
}

// ---------------------------------------------------------------- 档案卡片

function archiveCard(a) {
  return `
  <div class="card plain" data-id="${esc(a.id)}">
    <div class="card-top">
      <span class="dot" style="background:${a.buildOk ? 'var(--ok)' : 'var(--gold)'}"></span>
      <span class="card-title" title="${esc(a.title)}">${esc(a.title)}</span>
      ${a.buildOk ? '<span class="badge ok">校验✓</span>' : '<span class="badge gold">未校验</span>'}
    </div>
    <div class="card-sub muted">${esc(a.subject)} · ${esc(a.grade)} ｜ <code>${esc(a.courseSlug)}</code>${a.locale === 'cn' ? '（cn）' : ''}</div>
    <div class="card-sub">${a.goal ? esc(a.goal) : '<span style="color:var(--ink-3)">（无教学目标备注）</span>'}</div>
    <div class="card-foot">
      <span>${a.sectionCount} sections</span><span>${a.fileCount} 文件</span>
      ${a.revisions ? `<span>${a.revisions} 版</span>` : ''}
      <span class="grow"></span>
      <a class="btn small ghost" href="#/preview?id=${encodeURIComponent(a.id)}">预览</a>
      <button class="btn small danger" data-del="${esc(a.id)}">删除</button>
    </div>
    <div class="card-foot" style="margin-top:4px"><span>${date(a.createdAt)}${a.updatedAt !== a.createdAt ? ` · 更新 ${date(a.updatedAt)}` : ''}</span></div>
  </div>`
}

// ---------------------------------------------------------------- 发起制作

function viewNew(c) {
  const serversUp = c.server?.up
  return `
  <div class="wrap">
    <div class="head">
      <div class="eyebrow">NEW COURSEWARE</div>
      <h1>发起制作</h1>
      <p>一句话说清你想要的课件就行——学科、学段、互动方式都可以不说，agent 会按 course-studio 技能自行判断。</p>
    </div>

    <div class="panel">
      <textarea id="f-topic" rows="3" placeholder="例：做一节勾股定理的互动课，学生能拖拽方块拼出面积证明"></textarea>
      <div class="toolbar" style="margin-top:10px;margin-bottom:0">
        <span class="preview-note">试试：</span>
        <button class="pill" data-ex="做一节光的折射互动课，解释为什么筷子插进水里看起来是弯的">光的折射</button>
        <button class="pill" data-ex="给初中生做一节一元二次方程的互动课，配 5 道测验">一元二次方程</button>
        <button class="pill" data-ex="做一个单摆实验的虚拟实验室课件，能调摆长看周期变化">单摆实验</button>
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="btn jade" id="f-start">发起制作</button>
        <button class="btn ghost" id="f-copy">复制指令</button>
        <span class="preview-note">agent 做完会自动存证；预览服务没起时在「课件预览」页点一下「启动预览服务」。${serversUp ? '' : '（当前预览服务未启动）'}</span>
      </div>
      <details style="margin-top:14px">
        <summary class="preview-note" style="cursor:pointer">查看将发给 agent 的完整指令</summary>
        <textarea id="f-prompt" rows="9" readonly style="margin-top:8px;font-family:ui-monospace,Consolas,monospace;font-size:11.5px"></textarea>
      </details>
    </div>
  </div>`
}

function buildPrompt(topic) {
  return [
    '请利用「课程工坊」插件，制作 Mathigon 互动课件。需求：' + topic,
    '',
    '学科 / 学段 / 互动组件 / section 数量由你根据主题自行判断（默认中文课件，遵守技能红线：--- 分隔 step、显式 > section:、backtick 公式里不放中文、数学实算验证）。',
    '先 course_studio list 找一门最接近的现有课程当参照，slug 不要撞名。',
    '',
    '完成闭环：course_studio lint → build（零 error）→ save 存证（填学科/学段/教学目标）→ serve，并告诉我去侧栏「课程工坊」预览真实课件。',
  ].join('\n')
}

function bindNew() {
  const topic = document.getElementById('f-topic')
  const promptEl = document.getElementById('f-prompt')
  const sync = () => { promptEl.value = buildPrompt(topic.value.trim()) }
  app.querySelectorAll('.pill[data-ex]').forEach((pill) =>
    pill.addEventListener('click', () => { topic.value = pill.dataset.ex; sync() }))
  topic?.addEventListener('input', sync)
  document.getElementById('f-copy')?.addEventListener('click', () => {
    if (!topic.value.trim()) { toast('先写一句话需求'); return }
    sync(); copy(promptEl.value)
  })
  document.getElementById('f-start')?.addEventListener('click', () => {
    const topic = document.getElementById('f-topic').value.trim()
    if (!topic) { toast('先写一句话需求'); return }
    sync()
    // 必须发「完整指令」：只发一句话需求的话，新对话里 agent 不知道要用本插件、也不知道闭环要求。
    start(buildPrompt(topic))
  })
  sync() // 进页面就把「完整指令」渲染出来，免得展开后是空白
}

// ---------------------------------------------------------------- 课件档案

function viewArchives(c) {
  const list = (c.archives || []).filter((a) =>
    !state.q || `${a.title} ${a.courseSlug} ${a.subject} ${a.goal}`.toLowerCase().includes(state.q.toLowerCase()))
  return `
  <div class="wrap">
    <div class="head">
      <div class="eyebrow">ARCHIVE</div>
      <h1>课件档案</h1>
      <p>每份档案是课件源文件（content.md / functions.ts / styles.scss …）的存证副本，仓库里的原件丢了也能从这里回看源码；删除可从历史恢复。</p>
    </div>
    <div class="toolbar">
      <input class="search" id="a-search" placeholder="搜标题 / 课程名 / 学科…" value="${esc(state.q)}">
      <a class="btn small" href="#/new">发起制作</a>
    </div>
    ${list.length ? `<div class="grid">${list.map(archiveCard).join('')}</div>`
      : `<div class="empty-box"><b>没有匹配的课件档案</b>${state.q ? '换个关键词试试。' : '去「发起制作」提一个课程需求。'}</div>`}
  </div>`
}

function bindArchives() {
  const search = document.getElementById('a-search')
  search?.addEventListener('input', () => { state.q = search.value; render() })
  bindHome()
  app.querySelectorAll('.card[data-id]').forEach((card) =>
    card.addEventListener('click', async (e) => {
      if (e.target.closest('button') || e.target.closest('a')) return
      const id = card.dataset.id
      try {
        const { archive, preview } = await api(`/api/archive?id=${encodeURIComponent(id)}`)
        const files = (archive.files || []).filter((f) => SOURCE_FILES.includes(f))
        openViewer(`课件档案 · ${archive.title}`,
          [`标题：${archive.title}（${archive.subject} · ${archive.grade}）`,
            `课程：${archive.courseSlug}（${archive.locale}）`,
            `教学目标：${archive.goal || '—'}`,
            `sections（${(archive.sections || []).length}）：${(archive.sections || []).join(', ') || '—'}`,
            `预览地址：${preview}`,
            `校验：${archive.buildOk ? '编译通过' : '未通过/未校验'}（${archive.warnings} 警告）`,
            `备注：${archive.note || '—'}`,
            `存档文件：${(archive.files || []).join(', ') || '—'}`,
          ].join('\n'))
      } catch (err) { toast(String(err.message || err)) }
    }))
}

// ---------------------------------------------------------------- 课件预览

function viewPreview(c) {
  const archives = c.archives || []
  const current = archives.find((a) => a.id === state.previewId) || archives[0]
  const server = c.server || {}
  const sections = current?.sections || []
  const section = state.previewSection || sections[0] || ''
  const url = current ? `${server.base}/course/${encodeURIComponent(current.courseSlug)}${section ? `/${encodeURIComponent(section)}` : ''}` : ''
  return `
  <div class="wrap">
    <div class="head">
      <div class="eyebrow">LIVE PREVIEW</div>
      <h1>课件预览</h1>
      <p>下面是本地 mgon-serve 渲染的<b>真实课件页</b>（学生视角：逐 step 推进、填空、互动组件都在）。</p>
    </div>
    <div class="toolbar">
      <select id="p-archive" style="max-width:300px">${archives.map((a) =>
        `<option value="${esc(a.id)}" ${current?.id === a.id ? 'selected' : ''}>${esc(a.title)}（${esc(a.courseSlug)}）</option>`).join('')}</select>
      <select id="p-section" style="max-width:260px">${sections.map((s) =>
        `<option value="${esc(s)}" ${s === section ? 'selected' : ''}>${esc(s)}</option>`).join('') || '<option>（无 section）</option>'}</select>
      <span class="grow"></span>
      ${badge(server.up, `服务 :${server.port}`, '服务未启动')}
      <button class="btn small" id="p-serve" ${server.up ? 'disabled' : ''}>${server.up ? '服务运行中' : '启动预览服务'}</button>
      <a class="btn small ghost" href="${esc(url)}" target="_blank" rel="noreferrer">新窗口打开</a>
    </div>
    ${current ? `
      ${server.up
        ? `<div class="preview-stage"><iframe class="preview-frame" id="p-frame" src="${esc(url)}" title="课件预览"></iframe></div>
           <div class="preview-note" style="margin-top:8px">${esc(url)}</div>`
        : `<div class="empty-box"><b>预览服务没在跑</b>点上面的「启动预览服务」（mgon-serve 首次启动可能要 30–60 秒编译），起来后页面会自动加载课件。</div>`}
    ` : `<div class="empty-box"><b>还没有可预览的课件</b>agent 交付并 course_studio save 存证后，这里会出现预览。</div>`}
  </div>`
}

function bindPreview() {
  const archiveSel = document.getElementById('p-archive')
  const sectionSel = document.getElementById('p-section')
  archiveSel?.addEventListener('change', () => { state.previewId = archiveSel.value; state.previewSection = ''; render() })
  sectionSel?.addEventListener('change', () => { state.previewSection = sectionSel.value; render() })
  document.getElementById('p-serve')?.addEventListener('click', async (e) => {
    e.target.disabled = true
    e.target.textContent = '启动中…（最长等 60s）'
    try {
      const out = await post('/api/serve')
      toast(out.alreadyRunning ? '服务已在运行' : '预览服务已启动')
    } catch (err) { toast('启动失败：' + (err.message || err)) }
    render()
  })
}

// ---------------------------------------------------------------- 档案历史

function viewHistory(c) {
  const kinds = ['all', 'create', 'update', 'delete', 'restore']
  const list = c.history || []
  return `
  <div class="wrap">
    <div class="head">
      <div class="eyebrow">HISTORY</div>
      <h1>档案历史</h1>
      <p>保存 / 更新 / 删除 / 恢复都留痕；删除的档案带完整快照，可一键恢复。</p>
    </div>
    <div class="toolbar">
      ${kinds.map((k) => `<button class="pill" data-kind="${k}" aria-pressed="${state.kind === k}">${k === 'all' ? '全部' : kindLabel(k)}</button>`).join('')}
      <span class="grow"></span>
      <button class="btn small danger" id="h-clear">清空历史</button>
    </div>
    ${list.length ? list.map((e) => `
      <div class="hrow" data-event="${esc(e.id)}" data-kind="${esc(e.kind)}">
        <span class="when">${shortTime(e.at)}</span>
        <span class="badge ${KIND_TONE[e.kind] || ''}">${kindLabel(e.kind)}</span>
        <span class="what"><b>${esc(e.title || e.archiveId)}</b><div>${esc(e.summary || '')}</div></span>
        ${e.kind === 'delete' ? '<button class="btn small ghost" data-restore="' + esc(e.id) + '">恢复</button>' : ''}
      </div>`).join('')
      : `<div class="empty-box"><b>还没有历史记录</b>save / delete 之后这里会留痕。</div>`}
  </div>`
}

function bindHistory() {
  app.querySelectorAll('.pill[data-kind]').forEach((pill) =>
    pill.addEventListener('click', () => { state.kind = pill.dataset.kind; render() }))
  document.getElementById('h-clear')?.addEventListener('click', async () => {
    if (!confirm('清空全部历史？（不影响课件档案）')) return
    await post('/api/history/clear')
    toast('已清空')
    render()
  })
  app.querySelectorAll('[data-restore]').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      try {
        const out = await post('/api/archive/restore', { eventId: btn.dataset.restore })
        toast(out.summary || '已恢复')
        render()
      } catch (err) { toast(String(err.message || err)) }
    }))
}

// ---------------------------------------------------------------- 制作规范

const GUIDE = [
  ['核心心智模型', [
    '课程 = 一串 step。content.md 里 > id: 声明的 step 与 functions.ts 里 camelCase 导出函数机械对应；',
    'step 的 > goals: 全部得分才解锁「下一步」；正文里的 [[...]] 填空自动生成 goal（blank-0、blank-1…）。',
    '大多数 step 不需要函数——纯内容 + 填空即可；只在需要自定义交互时才写 functions.ts。',
  ]],
  ['中文课件硬规则', [
    '① 每个 section 必须显式 > section: <英文 slug>——中文 H2 无法 slugify，否则只有第一节可见；',
    '② backtick `...` 是 AsciiMath，里面严禁中文（会报 Unknown symbol）；½ ¼ ² 这类写成 1/2、^2；',
    '③ > id: / > section: / gloss: / bio: key 全英文；正文、填空选项、hints 用中文；',
    '④ 数学里的每个长度、角度、坐标必须实算验证（错图比没图更糟）。',
  ]],
  ['必读参考（技能目录 references/）', [
    'markdown-dialect.md —— 写 content.md 前必读（排版、填空、公式、revel）',
    'functions-model.md —— 写 functions.ts / score goals / 驱动互动前必读',
    'components.md —— x-geopad / x-slider / x-equation 等互动组件用法',
    'libraries.md —— @mathigon 工具函数（Point, Random, animate…）',
    'chinese-localization.md —— 中文课件必读；build-and-config.md —— 构建/服务',
  ]],
  ['交付闭环', [
    '写课程 → course_studio lint（自动修风格）→ course_studio build（抓 Maths parsing error）',
    '→ course_studio save 存证 → course_studio serve 启动预览 → 本面板「课件预览」看真实效果。',
  ]],
]

function viewGuide() {
  return `
  <div class="wrap">
    <div class="head">
      <div class="eyebrow">METHOD</div>
      <h1>制作规范</h1>
      <p>course-studio 技能的要点速查——完整方法论在技能目录 references/ 里，agent 创作时会按需加载。</p>
    </div>
    ${GUIDE.map(([title, items]) => `
      <div class="panel">
        <h2>${esc(title)}</h2>
        <ul style="margin:8px 0 0;padding-left:18px;color:var(--ink-2);font-size:12.5px;line-height:1.9">
          ${items.map((i) => `<li>${esc(i)}</li>`).join('')}
        </ul>
      </div>`).join('')}
    <div class="note" style="margin-top:12px">
      本插件基于 Mathigon（mathigon.org）交互教科书方法论的本地化应用；课程内容请遵守所在仓库的许可约定（Mathigon 仓库 UNLICENSED / private，内容勿直接商用搬运）。
    </div>
  </div>`
}

// ---------------------------------------------------------------- 启动

addEventListener('hashchange', render)
render()
