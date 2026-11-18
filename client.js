// ============================================================================
// 课程工坊 · 浏览器半边
//   侧栏加「课程工坊」入口；主区域是 /dsh-course-studio/ 工作台页面（iframe），
//   布局对齐「带货视频拆解」：概览 / 发起制作 / 课件档案 / 课件预览 / 档案历史 / 制作规范。
//   页面里点「在新对话发起制作」时 postMessage 一段创作指令，这里开新对话并填进输入框。
//   明暗跟随 dsh 主题，切换时把配色发给页面。
//
// 注意：scripts/build.mjs 的 banner 已经包了一层 __ModuleLoader__ 注册，
// 这个文件只写 CJS 的 exports，不要自己再调 window.__ModuleLoader__.load。
// ============================================================================
const h = require('react').createElement
const React = require('react')

const PANEL_ID = 'course-studio'
const LABEL = '课程工坊'
const SRC = '/dsh-course-studio/'
const MSG = 'dsh-course-studio'

// 侧栏图标：黑板 + 板书
function PanelIcon(props) {
  const s = (props && props.size) || 18
  return h('svg', {
    width: s, height: s, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round'
  },
    h('rect', { x: 4, y: 5, width: 16, height: 14, rx: 2 }),
    h('path', { d: 'M8 9.5h8M8 13h5' }),
    h('circle', { cx: 9, cy: 16, r: 0.9, fill: 'currentColor', stroke: 'none' }),
    h('path', { d: 'M12 16h4' }))
}

function apply(ctx) {
  const frames = new Set()
  let scheme = null

  const post = (frame, payload) => {
    try { if (frame && frame.contentWindow) frame.contentWindow.postMessage(payload, location.origin) } catch { /* 已卸载 */ }
  }
  const pushScheme = () => {
    if (scheme) for (const frame of frames) post(frame, { type: MSG + ':scheme', scheme })
  }

  // 主题：有 theme 服务就跟随，没有就用页面自己的浅色默认
  try {
    if (typeof ctx.inject === 'function') {
      ctx.inject(['theme'], (c) => {
        const push = (snap) => {
          try { scheme = snap.active.colorScheme } catch { scheme = null }
          pushScheme()
        }
        try { push(c.theme.getTheme()) } catch { /* ignore */ }
        c.on('theme/change', push)
      })
    }
  } catch { /* ignore */ }

  function Panel() {
    const ref = React.useRef(null)

    React.useEffect(() => {
      const self = ref.current
      if (self) frames.add(self)
      function onMessage(e) {
        const frame = ref.current
        if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return
        const m = e.data
        if (!m || m.type !== MSG + ':start' || typeof m.prompt !== 'string') return
        try {
          ctx.uiWorkspace.startSession(undefined, { prompt: m.prompt, whenDraftExists: 'replace' })
        } catch (err) {
          console.error('[course-studio] 开新对话失败', err)
          post(frame, { type: MSG + ':start-failed', message: String((err && err.message) || err) })
        }
      }
      addEventListener('message', onMessage)
      pushScheme()
      return () => { removeEventListener('message', onMessage); frames.delete(self) }
    }, [])

    return h('iframe', {
      ref,
      src: SRC,
      title: LABEL,
      allow: 'fullscreen; clipboard-write',
      onLoad: (e) => { pushScheme(); post(e.currentTarget, { type: MSG + ':scheme', scheme }) },
      style: { width: '100%', height: '100%', border: 0, display: 'block', background: 'transparent' }
    })
  }

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 22, label: () => LABEL }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}

exports.isPlugin = true
exports.inject = ['slots', 'uiWorkspace']
exports.apply = apply
