import { useSyncExternalStore } from 'react'
import { postMessageFromView, subscribeHostMessage } from './hostMessages'
import { whenHostServicesReady } from './appHost'

/**
 * 内置浏览器页面的**持久层**。
 *
 * 为什么需要它：Codex 的浏览器页面生命周期比任何 UI 组件都长 —— 切走会话、
 * 关掉面板、切到别的 tab，页面都还活着（browser_use 可能正在驱动它）。
 * 而 Electron 的 `<webview>` 一旦从 DOM 里摘下来，guest 进程立刻销毁，
 * 再挂回去是一个新页面。所以 webview 不能住在 tab 面板里，只能住在一个
 * 全程挂载的层里，**靠改位置**跟着面板走。
 *
 * 同一层还解决了截图问题：页面完全没有合成表面时 `Page.captureScreenshot`
 * 与 `Page.startScreencast` 都拿不到帧（实测），所以"没有锚点"时 webview 被
 * 停在视口内的一个 `opacity:0` 位置上 —— 这就是 Codex
 * `setCaptureSurfaceForBrowserUseForRoute` /
 * `browser-sidebar-browser-use-capture-surface` 在做的事。
 */

export interface BrowserSurface {
  conversationId: string
  browserTabId: string
  /** 面板里的锚点矩形；为 null 表示当前没有可见位置（停靠到捕获表面） */
  rect: { x: number; y: number; width: number; height: number } | null
  /** browser_use 是否要求保持捕获表面 */
  captureSurfaceRequired: boolean
  /**
   * browser_use 的视口覆盖（宿主已经把 `Emulation.setDeviceMetricsOverride`
   * 下给页面了，这里是元素侧的那一半）。
   *
   * 两边都要改：只改 emulation，元素尺寸还是锚点尺寸，Chromium 会把 390 宽的
   * 布局缩放到元素宽度上，截图和点击坐标全都偏；只改元素尺寸，页面拿到的
   * `window.innerWidth` 又不是 agent 要的值。
   */
  viewportSize: { width: number; height: number } | null
  /**
   * 宿主是否已经登记好这条路由。
   *
   * 必须等它变 true 才能渲染 `<webview>`：登记是异步的 RPC，而 attach 是
   * 元素一进 DOM 就发生的。抢在登记之前 attach，宿主认领不到路由会直接
   * preventDefault，那个 tab 就永远起不来。
   */
  registered: boolean
}

type Listener = () => void

const surfaces = new Map<string, BrowserSurface>()
const listeners = new Set<Listener>()

function key(conversationId: string, browserTabId: string): string {
  return `${conversationId}::${browserTabId}`
}

/**
 * 对外快照。
 *
 * 必须缓存成同一个数组引用：`useSyncExternalStore` 会用引用相等判断有没有变，
 * 每次 getSnapshot 都新建数组会让它认为一直在变，直接进入无限重渲染。
 */
let snapshot: BrowserSurface[] = []

function emit(): void {
  snapshot = Array.from(surfaces.values(), (surface) => ({ ...surface }))
  for (const listener of listeners) listener()
}

/**
 * 登记一个浏览器页面（幂等）。
 * 组件重挂、StrictMode 的 effect 重放都会再调一次，这里必须不产生副作用。
 */
export function ensureBrowserSurface(conversationId: string, browserTabId: string): void {
  const id = key(conversationId, browserTabId)
  if (surfaces.has(id)) return
  surfaces.set(id, {
    conversationId,
    browserTabId,
    rect: null,
    captureSurfaceRequired: false,
    viewportSize: null,
    registered: false
  })
  void whenHostServicesReady()
    .then((services) =>
      services.browserSidebar.registerWebviewHost({
        conversationId,
        browserTabId,
        instanceId: 0,
        url: null
      })
    )
    .then(() => {
      const surface = surfaces.get(id)
      if (surface == null) return
      surface.registered = true
      emit()
    })
    .catch((error: unknown) => {
      console.warn('[browser] failed to register webview host', error)
    })
  emit()
}

/** tab 真的被关掉时才移除（面板卸载不算） */
export function removeBrowserSurface(conversationId: string, browserTabId: string): void {
  if (!surfaces.delete(key(conversationId, browserTabId))) return
  postMessageFromView({
    type: 'browser-sidebar-webview-destroyed',
    conversationId,
    browserTabId
  })
  emit()
}

/** 面板里的锚点矩形变化（滚动、拖拽分栏、窗口 resize 都会变） */
export function setBrowserSurfaceRect(
  conversationId: string,
  browserTabId: string,
  rect: BrowserSurface['rect']
): void {
  const surface = surfaces.get(key(conversationId, browserTabId))
  if (surface == null) return
  const previous = surface.rect
  if (
    previous?.x === rect?.x &&
    previous?.y === rect?.y &&
    previous?.width === rect?.width &&
    previous?.height === rect?.height
  ) {
    return
  }
  surface.rect = rect
  emit()
}

/**
 * 把呈现态报给宿主（Codex `browser-sidebar-sync`）。
 *
 * 这是 `browser_visibility_get` 的唯一数据来源：面板开没开只有渲染层知道，
 * 但回答问题的是 native pipe 上的 agent，所以判断必须在宿主。
 *
 * **量的是 tab 面板本身，不是 webview 的锚点。** 这两件事必须分开：
 * 空白新 tab（还没有 URL）根本不渲染 webview，也就没有锚点 —— 但那个 tab
 * 明明就在用户面前。用锚点当依据的话 `browser_visibility_get` 会对一个开着的
 * 浏览器面板回 false。Codex 的 `bounds` 是浏览器视图的 frame，与页面加载
 * 无关，语义就是"这个 tab 占了屏幕上这块地方"。
 *
 * 宿主那边的推导（`presented = visible && bounds != null`）不变，所以这里
 * 传的 `visible` 仍然只是"有没有量到一块非零的地方"。
 */
export function reportBrowserSurfacePresentation(
  conversationId: string,
  browserTabId: string,
  bounds: BrowserSurface['rect']
): void {
  const presented = bounds != null && bounds.width > 0 && bounds.height > 0
  postMessageFromView({
    type: 'browser-sidebar-sync',
    conversationId,
    browserTabId,
    visible: presented,
    bounds: presented ? bounds : null
  })
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useBrowserSurfaces(): BrowserSurface[] {
  return useSyncExternalStore(subscribe, () => snapshot)
}

/** 宿主要求/释放捕获表面（Codex `browser-sidebar-browser-use-capture-surface`） */
export function subscribeCaptureSurfaceRequests(): () => void {
  return subscribeHostMessage('browser-sidebar-browser-use-capture-surface', (message) => {
    const surface = surfaces.get(key(message.conversationId, message.browserTabId))
    if (surface == null || surface.captureSurfaceRequired === message.required) return
    surface.captureSurfaceRequired = message.required
    emit()
  })
}

/** browser_use 的视口覆盖（Codex `browser-sidebar-browser-use-viewport`） */
export function subscribeBrowserUseViewport(): () => void {
  return subscribeHostMessage('browser-sidebar-browser-use-viewport', (message) => {
    const surface = surfaces.get(key(message.conversationId, message.browserTabId))
    if (surface == null) return
    const next = message.viewportSize
    if (
      surface.viewportSize?.width === next?.width &&
      surface.viewportSize?.height === next?.height
    ) {
      return
    }
    surface.viewportSize = next
    emit()
  })
}
