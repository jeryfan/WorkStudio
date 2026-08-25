import { ipcRenderer } from 'electron'
import type { HOST_CHANNEL } from '@shared/host/channels'
import type { BrowserPageEvent } from '@shared/host/messages'

/*
 * 通道名在这里写成字面量、并用 `typeof HOST_CHANNEL.x` 钉住，是刻意的。
 *
 * 这个 preload 跑在 sandbox:true 的页面里，那里的 `require` 只认 electron 与
 * 少数内置模块，**不能 require 相对路径的文件**。而只要它 `import` 了
 * `@shared/host/channels`，rollup 就会把公共模块抽成 `chunks/xxx.js`，
 * 加载时立刻抛错 —— 错还发生在 guest 进程里，很难看见。
 *
 * 用 type-only import + 字面量类型标注：编译期两边必须一致，运行期零依赖。
 */
const BROWSER_PAGE_EVENT: typeof HOST_CHANNEL.browserPageEvent = 'codex_desktop:browser-page-event'

/**
 * 内置浏览器**页面内**的 preload。
 *
 * 取证：Codex 的同名产物是 `.vite/build/browser-page-preload.js`（361KB，
 * 里面还带 WebMCP / 标注层 / 评论覆盖层的运行时）。它由主进程在
 * `will-attach-webview` 里强制注入 —— 渲染层给的 webpreferences 会被删掉，
 * 页面无法自己指定 preload，这是安全边界的一部分。
 *
 * 这里只做最小职责：把页面生命周期与几何信息上报给宿主。
 * 宿主需要它们的原因：
 *   - 地址栏/标题/加载态的真值在页面里，webview 的 did-navigate 事件在
 *     SPA 的 history.pushState 上不触发；
 *   - browser_use 需要视口与 devicePixelRatio 才能把 CDP 截图坐标换算回
 *     渲染层的逻辑像素。
 *
 * 注意：这个 preload 跑在 sandbox:true 的页面里，只能用 ipcRenderer，
 * 不能碰 fs/path。
 */

function send(event: BrowserPageEvent): void {
  try {
    ipcRenderer.send(BROWSER_PAGE_EVENT, event)
  } catch {
    /* 页面正在销毁，丢弃 */
  }
}

/*
 * Codex 在这里会同步问一次宿主 WebMCP 是否开启
 *（`ipcRenderer.sendSync('codex_desktop:get-browser-webmcp-enabled')`），
 * 因为页面侧的 MCP bridge 要在任何页面脚本之前注入。
 *
 * 本项目没有 WebMCP 运行时，这个同步调用就是纯风险：`sendSync` 会阻塞 guest
 * 渲染进程，宿主侧任何一次时序错位（比如 attach 被拒、监听器还没挂上）都会
 * 让页面永久卡住。等 WebMCP 真正落地时再把它加回来 —— 通道名与主进程侧的
 * 处理都已经就位。
 */

function reportViewport(): void {
  send({
    type: 'viewport',
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio
  })
}

function reportNavigation(type: 'mounted' | 'navigate'): void {
  send({ type, url: location.href, title: document.title })
}

window.addEventListener('DOMContentLoaded', () => {
  reportNavigation('mounted')
  reportViewport()
})

window.addEventListener('resize', reportViewport)

// 滚动位置：browser_use 的坐标换算与"回到上次位置"都要
let scrollTimer: ReturnType<typeof setTimeout> | null = null
window.addEventListener(
  'scroll',
  () => {
    if (scrollTimer != null) return
    scrollTimer = setTimeout(() => {
      scrollTimer = null
      send({ type: 'scroll', scrollX: window.scrollX, scrollY: window.scrollY })
    }, 100)
  },
  { passive: true }
)

/**
 * SPA 路由变化：history API 不产生 navigation 事件，必须打补丁。
 * 只包一层并调用原函数，页面自己的行为不受影响。
 */
for (const method of ['pushState', 'replaceState'] as const) {
  const original = history[method]
  history[method] = function patched(this: History, ...args: Parameters<History['pushState']>) {
    const result = original.apply(this, args)
    reportNavigation('navigate')
    return result
  }
}
window.addEventListener('popstate', () => reportNavigation('navigate'))
window.addEventListener('hashchange', () => reportNavigation('navigate'))
