import { clipboard, dialog, nativeImage, shell, type WebContents } from 'electron'
import { writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'
import type {
  BrowserPageCommand,
  BrowserPageEvent,
  BrowserTabState,
  BrowsingDataKind
} from '@shared/host/messages'
import type { WindowManager } from '../host/WindowManager'
import { BrowserCdpBridge } from './BrowserCdpBridge'
import { clearBrowsingData } from './browserSession'

/**
 * 内置浏览器的宿主侧管理器。
 *
 * 取证：Codex 的 `BrowserSidebarManager`（实测 183 个方法）。本项目落的是它的
 * 核心骨架：页面注册表、`<webview>` 认领、页面命令、状态广播、CDP 接入。
 *
 * 最重要的结构性事实：**浏览器 tab 的权威状态在主进程，不在渲染层**。
 * 渲染层只挂一个 `<webview>` 壳并订阅 `browser-sidebar-state`。理由不是洁癖：
 *   - url/title/loading 的真值在 guest 进程，渲染层持有的永远是慢一拍的副本；
 *   - browser_use 从 agent 侧开页/导航时渲染层不在链路上，状态若由它持有就会
 *     和实际页面对不上；
 *   - 会话切走后 tab 要活着（页面不能重载），生命周期必须比 React 组件长。
 */

/** 路由键：一个会话下可以有多个浏览器 tab */
function pageKey(conversationId: string, browserTabId: string): string {
  return `${conversationId}::${browserTabId}`
}

export interface BrowserRoute {
  conversationId: string
  browserTabId: string
  url: string | null
}

export interface ViewportSize {
  width: number
  height: number
}

interface BrowserPageState extends BrowserRoute {
  /** Electron 给 `<webview>` 的内部 instanceId（认领时绑定） */
  instanceId: number | null
  guest: WebContents | null
  title: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  zoomPercent: number
  browserUseActive: boolean
  findQuery: string
  /** 渲染层报的可见性（Codex 线程态的 `visible`） */
  visible: boolean
  /** 渲染层报的锚点矩形（Codex 线程态的 `bounds`） */
  bounds: { x: number; y: number; width: number; height: number } | null
  /** `visible && bounds != null`，Codex 的 `presented` */
  presented: boolean
  /** 已请求显示、渲染层还没报回可见（Codex `hasPendingBrowserUseVisibilityRequest`） */
  hasPendingBrowserUseVisibilityRequest: boolean
  /** browser_use 的视口覆盖，null 表示没有覆盖（Codex `emulatedViewportSize`） */
  emulatedViewportSize: ViewportSize | null
}

/**
 * capability 在还没有 browser_use tab 时落下的意图（Codex
 * `setPendingCapabilityIntent` / `pendingVisibilityRouteKeys` /
 * `pendingViewportSizesByRouteKey`）。
 *
 * 为什么需要：agent 完全可以先 `visibility.set(true)` 再 `tabs.new()` ——
 * 文档就是这么教的（"When the browser should be visible, call set(true)"）。
 * 此刻还没有任何 tab，命令若直接报错，agent 那边就是一次无谓的失败。
 */
type PendingCapabilityIntent =
  { kind: 'visibility'; visible: boolean } | { kind: 'viewport'; viewportSize: ViewportSize | null }

export class BrowserSidebarManager {
  readonly cdp = new BrowserCdpBridge()

  private readonly pages = new Map<string, BrowserPageState>()
  /**
   * 待认领的路由队列。
   *
   * `will-attach-webview` 拿不到自定义属性（Electron 只把注册过的 webview 属性
   * 放进 params），所以对齐 Codex 的做法：渲染层挂载前先 `registerWebviewHost`
   * 登记，attach 时按 FIFO 认领，再把 Electron 的 instanceId 绑上去。
   */
  private readonly pendingRoutes: BrowserRoute[] = []
  /** will-attach 已认领、还没等到 guest 的（两个事件成对触发） */
  private readonly awaitingGuest: BrowserRoute[] = []
  /**
   * 当前被"呈现"的路由。
   *
   * 取证：Codex 把 `activeConversationId`/`activeBrowserTabId` 存在**窗口态**上，
   * 每个窗口一份。本项目的这个 manager 自始就是窗口无关的（状态一律
   * `sendMessageToAllWindows` 广播），所以这里只有一份全局的活动路由。
   * 多窗口同时各开一个浏览器面板时，`browser_visibility_get` 只会认最后
   * 报上来的那个 —— 这是与 Codex 的已知差异，不是遗漏。
   */
  private activeConversationId: string | null = null
  private activeBrowserTabId: string | null = null
  /** conversationId → 等 tab 出现后才能落地的 capability 意图 */
  private readonly pendingCapabilityIntents = new Map<string, PendingCapabilityIntent[]>()

  constructor(private readonly windowManager: WindowManager) {}

  // -- 渲染层登记与认领 ------------------------------------------------
  registerWebviewHost(route: BrowserRoute & { instanceId?: number }): void {
    const key = pageKey(route.conversationId, route.browserTabId)
    const existing = this.pages.get(key)
    if (existing == null) {
      this.pages.set(key, {
        conversationId: route.conversationId,
        browserTabId: route.browserTabId,
        url: route.url,
        instanceId: null,
        guest: null,
        title: '',
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        zoomPercent: 100,
        browserUseActive: false,
        findQuery: '',
        visible: false,
        bounds: null,
        presented: false,
        hasPendingBrowserUseVisibilityRequest: false,
        emulatedViewportSize: null
      })
    } else if (route.url != null) {
      existing.url = route.url
    }
    /*
     * 只有"还没有活着的 guest"才排队等认领。
     *
     * 渲染层可能重复登记（组件重挂、StrictMode 的 effect 重放、面板切回来），
     * 每次都排一条会留下永远等不到 attach 的幽灵路由 —— 而幽灵路由会被**下一个**
     * webview 认领走，于是那个 webview 拿到别人的 conversationId/browserTabId。
     */
    const current = this.pages.get(key)
    if (current?.guest != null && !current.guest.isDestroyed()) return
    if (
      this.pendingRoutes.some(
        (pending) => pageKey(pending.conversationId, pending.browserTabId) === key
      )
    ) {
      return
    }
    this.pendingRoutes.push({ ...route })
  }

  /** will-attach-webview：认领一条待挂载路由 */
  takePendingRoute(instanceId: number | null): BrowserRoute | null {
    const route = this.pendingRoutes.shift()
    if (route == null) return null
    if (instanceId != null) {
      const state = this.pages.get(pageKey(route.conversationId, route.browserTabId))
      if (state) state.instanceId = instanceId
    }
    this.awaitingGuest.push(route)
    return route
  }

  /** did-attach-webview：把 guest webContents 绑到路由上 */
  attachGuest(guest: WebContents): BrowserRoute | null {
    const route = this.awaitingGuest.shift()
    if (route == null) return null
    const state = this.pages.get(pageKey(route.conversationId, route.browserTabId))
    if (state == null) return null
    state.guest = guest
    this.bindGuestEvents(state, guest)
    /*
     * webview 的 src 已被清空（见 webviewAttach），首次导航由宿主发起。
     * 这样"谁在导航"只有一个答案，agent 与用户的导航不会互相拽。
     */
    if (state.url != null && state.url !== '') {
      void guest.loadURL(state.url).catch(() => undefined)
    }
    this.broadcastState(state.conversationId)
    this.windowManager.sendMessageToAllWindows({
      type: 'browser-sidebar-tab-lifecycle',
      conversationId: state.conversationId,
      browserTabId: state.browserTabId,
      phase: 'attached'
    })
    this.applyPendingCapabilityIntents(state.conversationId, state.browserTabId)
    return route
  }

  private bindGuestEvents(state: BrowserPageState, guest: WebContents): void {
    const sync = (): void => {
      if (guest.isDestroyed()) return
      state.url = guest.getURL()
      state.title = guest.getTitle()
      state.canGoBack = guest.navigationHistory.canGoBack()
      state.canGoForward = guest.navigationHistory.canGoForward()
      this.broadcastState(state.conversationId)
    }

    guest.on('did-start-loading', () => {
      state.isLoading = true
      this.broadcastState(state.conversationId)
    })
    guest.on('did-stop-loading', () => {
      state.isLoading = false
      sync()
    })
    guest.on('did-navigate', sync)
    guest.on('did-navigate-in-page', sync)
    guest.on('page-title-updated', sync)
    guest.on('did-finish-load', () => {
      sync()
      this.windowManager.sendMessageToAllWindows({
        type: 'browser-sidebar-page-loaded',
        conversationId: state.conversationId,
        browserTabId: state.browserTabId,
        url: state.url ?? '',
        title: state.title
      })
    })
    guest.on('found-in-page', (_event, result) => {
      this.windowManager.sendMessageToAllWindows({
        type: 'browser-sidebar-find-state',
        conversationId: state.conversationId,
        browserTabId: state.browserTabId,
        activeMatchOrdinal: result.activeMatchOrdinal ?? 0,
        matches: result.matches ?? 0
      })
    })
    // 页面里点开新窗口：内置浏览器不拉系统浏览器，转成开新 tab 由渲染层决定
    guest.setWindowOpenHandler(({ url }) => {
      state.url = url
      this.windowManager.sendMessageToAllWindows({ type: 'open-browser-tab' })
      return { action: 'deny' }
    })
    guest.on('render-process-gone', () => {
      state.guest = null
      this.windowManager.sendMessageToAllWindows({
        type: 'browser-sidebar-tab-lifecycle',
        conversationId: state.conversationId,
        browserTabId: state.browserTabId,
        phase: 'render-process-gone'
      })
    })
    guest.once('destroyed', () => {
      state.guest = null
      this.windowManager.sendMessageToAllWindows({
        type: 'browser-sidebar-tab-lifecycle',
        conversationId: state.conversationId,
        browserTabId: state.browserTabId,
        phase: 'destroyed'
      })
    })
  }

  /** 页面 preload 上报（SPA 路由、视口、滚动 —— webview 事件覆盖不到的部分） */
  handlePageEvent(guest: WebContents, event: BrowserPageEvent): void {
    const state = this.findStateByGuest(guest)
    if (state == null) return
    if (event.type === 'mounted' || event.type === 'navigate') {
      state.url = event.url
      state.title = event.title
      this.broadcastState(state.conversationId)
    }
    // viewport/scroll/click/log-message 目前只有 browser_use 关心，不广播
  }

  // -- 渲染层命令 ------------------------------------------------------
  async runCommand(
    conversationId: string,
    browserTabId: string,
    command: BrowserPageCommand
  ): Promise<void> {
    const state = this.pages.get(pageKey(conversationId, browserTabId))
    if (state == null) return
    if (command.type === 'close-tab') {
      this.closePage(conversationId, browserTabId)
      return
    }
    const guest = state.guest
    if (guest == null || guest.isDestroyed()) {
      // 还没 attach：导航先落进状态，webview 挂上时用它作为初始 src
      if (command.type === 'navigate') {
        state.url = command.url
        this.broadcastState(conversationId)
      }
      return
    }
    switch (command.type) {
      case 'navigate':
        await guest.loadURL(command.url)
        return
      case 'go-back':
        if (guest.navigationHistory.canGoBack()) guest.navigationHistory.goBack()
        return
      case 'go-forward':
        if (guest.navigationHistory.canGoForward()) guest.navigationHistory.goForward()
        return
      case 'reload':
        if (command.ignoreCache === true) guest.reloadIgnoringCache()
        else guest.reload()
        return
      case 'stop':
        guest.stop()
        return
      case 'set-zoom-percent':
        this.applyZoom(state, guest, command.zoomPercent)
        return
      case 'step-zoom':
        this.applyZoom(state, guest, state.zoomPercent + command.delta * 10)
        return
      case 'reset-zoom':
        this.applyZoom(state, guest, 100)
        return
      case 'set-find-query':
        state.findQuery = command.query
        if (command.query === '') guest.stopFindInPage('clearSelection')
        else guest.findInPage(command.query)
        return
      case 'find-next':
        if (state.findQuery !== '') {
          guest.findInPage(state.findQuery, { forward: true, findNext: true })
        }
        return
      case 'find-previous':
        if (state.findQuery !== '') {
          guest.findInPage(state.findQuery, { forward: false, findNext: true })
        }
        return
      case 'close-find':
        state.findQuery = ''
        guest.stopFindInPage('clearSelection')
        return
      case 'open-find':
        // 查找框是渲染层 UI，宿主这边无事可做
        return
      case 'capture-screenshot':
        await this.captureScreenshotToClipboard({ conversationId, browserTabId })
        return
      case 'open-in-browser':
        if (state.url != null && state.url !== '') await shell.openExternal(state.url)
        return
      case 'print':
        guest.print()
        return
    }
  }

  private applyZoom(state: BrowserPageState, guest: WebContents, percent: number): void {
    state.zoomPercent = clampZoom(percent)
    guest.setZoomFactor(state.zoomPercent / 100)
    this.broadcastState(state.conversationId)
  }

  getState(conversationId: string): BrowserTabState[] {
    const result: BrowserTabState[] = []
    for (const state of this.pages.values()) {
      if (state.conversationId !== conversationId) continue
      result.push({
        browserTabId: state.browserTabId,
        url: state.url ?? '',
        title: state.title,
        isLoading: state.isLoading,
        canGoBack: state.canGoBack,
        canGoForward: state.canGoForward,
        zoomPercent: state.zoomPercent,
        browserUseActive: state.browserUseActive
      })
    }
    return result
  }

  setAudioMuted(conversationId: string, browserTabId: string, muted: boolean): void {
    const guest = this.pages.get(pageKey(conversationId, browserTabId))?.guest
    if (guest != null && !guest.isDestroyed()) guest.setAudioMuted(muted)
  }

  async captureScreenshotToClipboard(params: {
    conversationId: string
    browserTabId: string
  }): Promise<boolean> {
    const png = await this.capturePng(params.conversationId, params.browserTabId)
    if (png == null) return false
    clipboard.writeImage(nativeImage.createFromBuffer(png))
    this.windowManager.sendMessageToAllWindows({
      type: 'browser-sidebar-screenshot-copied',
      conversationId: params.conversationId,
      browserTabId: params.browserTabId
    })
    return true
  }

  async captureScreenshotToFile(params: {
    conversationId: string
    browserTabId: string
  }): Promise<boolean> {
    const png = await this.capturePng(params.conversationId, params.browserTabId)
    if (png == null) return false
    const state = this.pages.get(pageKey(params.conversationId, params.browserTabId))
    const window = this.windowManager.getPrimaryWindow()
    const options = {
      defaultPath: join(homedir(), 'Downloads', suggestedScreenshotName(state?.url ?? '')),
      filters: [{ name: 'PNG', extensions: ['png'] }]
    }
    const result =
      window != null
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, png)
    return true
  }

  /**
   * 截图走 CDP 而不是 `webContents.capturePage()`。
   *
   * capturePage 拍的是**合成后的可见区域**：webview 被面板遮住、滚出视口或
   * 所在窗口不在前台时会拿到空白/残图。`Page.captureScreenshot` 由 guest 自己
   * 渲染，可见性影响小得多。
   *
   * 已知边界（实测）：webview 被完全移出视口（比如 `left:-9999px`）时连合成
   * 表面都没有，即使先下 `Emulation.setDeviceMetricsOverride` 也截不出帧 ——
   * 此时 CDP 命令超时并抛错（而不是永久挂住，见 BrowserCdpBridge 的超时）。
   * Codex 用 `setCaptureSurfaceForBrowserUseForRoute` 给这类页面单独准备一个
   * 捕获表面，本项目尚未实现。
   */
  private async capturePng(conversationId: string, browserTabId: string): Promise<Buffer | null> {
    const state = this.pages.get(pageKey(conversationId, browserTabId))
    const guest = state?.guest
    if (state == null || guest == null || guest.isDestroyed()) return null
    try {
      const base64 = await this.cdp.captureScreenshot(state.browserTabId, guest)
      return Buffer.from(base64, 'base64')
    } catch (error) {
      /*
       * 拿不到帧通常意味着这个页面此刻没有合成表面（面板关了、tab 切走了）。
       * 请渲染层把它停到捕获表面上再试一次 —— 这就是 Codex
       * `setCaptureSurfaceForBrowserUseForRoute` 的用途。
       */
      this.setCaptureSurfaceRequired(conversationId, browserTabId, true)
      try {
        await delay(CAPTURE_SURFACE_SETTLE_MS)
        const base64 = await this.cdp.captureScreenshot(state.browserTabId, guest)
        return Buffer.from(base64, 'base64')
      } catch {
        console.warn('[browser] screenshot failed even with a capture surface', error)
        return null
      } finally {
        if (!state.browserUseActive) {
          this.setCaptureSurfaceRequired(conversationId, browserTabId, false)
        }
      }
    }
  }

  /** 要求/释放捕获表面（渲染层据此决定 webview 停在哪） */
  setCaptureSurfaceRequired(conversationId: string, browserTabId: string, required: boolean): void {
    this.windowManager.sendMessageToAllWindows({
      type: 'browser-sidebar-browser-use-capture-surface',
      conversationId,
      browserTabId,
      required
    })
  }

  async openSiteInfo(conversationId: string, browserTabId: string): Promise<void> {
    const state = this.pages.get(pageKey(conversationId, browserTabId))
    if (state?.url == null || state.url === '') return
    // Chrome 的站点信息弹层属于浏览器自身 UI，内置浏览器没有；退化为外部打开
    await shell.openExternal(state.url)
  }

  closePage(conversationId: string, browserTabId: string): void {
    const key = pageKey(conversationId, browserTabId)
    const state = this.pages.get(key)
    if (state == null) return
    const guest = state.guest
    if (guest != null && !guest.isDestroyed()) {
      this.cdp.detach(state.browserTabId, guest)
      guest.close()
    }
    this.pages.delete(key)
    this.broadcastState(conversationId)
  }

  deleteConversation(conversationId: string): void {
    for (const state of Array.from(this.pages.values())) {
      if (state.conversationId === conversationId) {
        this.closePage(conversationId, state.browserTabId)
      }
    }
  }

  clearBrowsingData(kinds: BrowsingDataKind[]): Promise<void> {
    return clearBrowsingData(kinds)
  }

  // -- browser_use 侧 --------------------------------------------------
  listPages(): BrowserPageState[] {
    return Array.from(this.pages.values())
  }

  findPage(conversationId: string, browserTabId: string): BrowserPageState | null {
    return this.pages.get(pageKey(conversationId, browserTabId)) ?? null
  }

  findPagesForConversation(conversationId: string): BrowserPageState[] {
    return Array.from(this.pages.values()).filter(
      (state) => state.conversationId === conversationId
    )
  }

  /**
   * 由 agent 侧发起开页。
   *
   * 宿主先建状态并让渲染层开面板，`<webview>` 由渲染层挂载后回来认领 ——
   * 顺序不能反：guest webContents 只能由渲染层的 webview 产生，主进程无法
   * 凭空造一个 guest 再塞进页面。
   */
  openPageForBrowserUse(conversationId: string, url: string): BrowserRoute {
    const browserTabId = `bu-${Date.now().toString(36)}-${this.pages.size}`
    this.registerWebviewHost({ conversationId, browserTabId, url })
    this.windowManager.sendMessageToAllWindows({
      type: 'browser-sidebar-open-panel-without-animation',
      conversationId
    })
    this.broadcastState(conversationId)
    return { conversationId, browserTabId, url }
  }

  setBrowserUseActive(conversationId: string, browserTabId: string | null, active: boolean): void {
    for (const state of this.pages.values()) {
      if (state.conversationId !== conversationId) continue
      state.browserUseActive =
        active && (browserTabId == null || state.browserTabId === browserTabId)
    }
    /*
     * agent 接管期间常驻捕获表面：它会在面板不可见时反复截图，
     * 每次都临时申请表面要多等一个 settle 周期。
     */
    if (browserTabId != null) this.setCaptureSurfaceRequired(conversationId, browserTabId, active)
    this.windowManager.sendMessageToAllWindows({
      type: 'browser-sidebar-browser-use-state',
      conversationId,
      browserTabId,
      active
    })
    this.broadcastState(conversationId)
  }

  // -- 呈现态与 capability（visibility / viewport） ---------------------
  /**
   * 渲染层的呈现态同步（Codex `BrowserSidebarManager.sync`）。
   *
   * `presented` 的算法逐字照搬：`payload.visible && payload.bounds != null`。
   * 只看 `visible` 不够 —— 面板"开着"但这个 tab 被别的 tab 盖住时，渲染层报的
   * bounds 是 null，此时它并没有被呈现给用户。
   */
  sync(payload: {
    conversationId: string
    browserTabId: string
    visible: boolean
    bounds: { x: number; y: number; width: number; height: number } | null
  }): void {
    const state = this.pages.get(pageKey(payload.conversationId, payload.browserTabId))
    if (state == null) return
    const presented = payload.visible && payload.bounds != null
    state.visible = payload.visible
    state.bounds = payload.bounds
    state.presented = presented
    // 真的被呈现出来了，待决的显示请求就算兑现了
    if (presented) state.hasPendingBrowserUseVisibilityRequest = false
    if (presented || this.activeConversationId == null) {
      this.activeConversationId = payload.conversationId
      this.activeBrowserTabId = payload.browserTabId
    }
  }

  /**
   * Codex `Zpe`（`isBrowserVisibleForBrowserUseForRoute`）。
   *
   * 待决的显示请求也算"可见"：`set(true)` 之后 agent 紧接着 `get()`，渲染层
   * 那一帧还没画完就报 false 的话，agent 会以为显示失败并重试。
   */
  isBrowserVisibleForBrowserUse(conversationId: string, browserTabId?: string): boolean {
    const tabId = browserTabId ?? this.resolveBrowserUseTabId(conversationId)
    if (tabId == null) return false
    if (this.activeConversationId !== conversationId || this.activeBrowserTabId !== tabId) {
      return false
    }
    const state = this.pages.get(pageKey(conversationId, tabId))
    if (state == null) return false
    return state.hasPendingBrowserUseVisibilityRequest || (state.visible && state.bounds != null)
  }

  /** Codex `Xpe`（`setBrowserVisibleForBrowserUseForRoute`） */
  setBrowserVisibleForBrowserUse(
    conversationId: string,
    visible: boolean,
    browserTabId?: string
  ): void {
    const tabId = browserTabId ?? this.resolveBrowserUseTabId(conversationId)
    if (tabId == null) {
      // 还没有 tab：显示意图存起来，隐藏意图直接丢（本来就是隐藏的）
      if (visible) this.pushCapabilityIntent(conversationId, { kind: 'visibility', visible: true })
      return
    }
    const state = this.pages.get(pageKey(conversationId, tabId))
    if (state == null) return

    if (visible) {
      // Codex `Qpe`：显示同时进入接管态
      this.setBrowserUseActive(conversationId, tabId, true)
      if (state.presented) return
      state.hasPendingBrowserUseVisibilityRequest = true
      /*
       * Codex 在这里分两条路：会话已是活动会话就发 `toggle-browser-panel
       * {open:true}`，否则发 `browser-sidebar-open-panel-without-animation`。
       * 分岔的原因是动画 —— 切会话本身有转场，叠上面板展开动画会抖。
       *
       * 本项目只发后者：渲染层这条路是"按 browserTabId 打开/激活一个浏览器
       * tab"，本来就没有展开动画，两条路会落到同一个实现上。
       */
      this.windowManager.sendMessageToAllWindows({
        type: 'browser-sidebar-open-panel-without-animation',
        conversationId,
        browserTabId: tabId,
        source: 'browser_use',
        initiator: 'browser_use'
      })
      return
    }

    state.hasPendingBrowserUseVisibilityRequest = false
    state.presented = false
    state.visible = false
    state.bounds = null
    /*
     * Codex 在关面板前还会发一条 `browser-sidebar-clear-pending-panel-open`
     * 让渲染层撤掉排队中的"开面板"意图。本项目没有这条消息：渲染层收到
     * open-panel 就同步开 tab，不排队，没有可撤的意图。待决标志只存在宿主这边
     * （上面那行 `hasPendingBrowserUseVisibilityRequest = false` 就是撤它）。
     */
    if (this.activeConversationId === conversationId && this.activeBrowserTabId === tabId) {
      this.windowManager.sendMessageToAllWindows({
        type: 'toggle-browser-panel',
        open: false,
        source: 'browser_use',
        initiator: 'browser_use'
      })
    }
  }

  /** Codex `MZ`（`setViewportForBrowserUseForRoute`） */
  async setViewportForBrowserUse(
    conversationId: string,
    viewportSize: ViewportSize | null,
    browserTabId?: string
  ): Promise<void> {
    const clamped = viewportSize == null ? null : clampViewport(viewportSize)
    const tabId = browserTabId ?? this.resolveBrowserUseTabId(conversationId)
    if (tabId == null) {
      /*
       * Codex 在没有 tab 时对 `set` 直接抛 "A browser tab id is required"，
       * 但同一个 `executeUnhandledCommand` 入口在抛之前先把意图存了下来
       * （`setPendingCapabilityIntent` 并返回 `{}`）。这里走存意图那条：
       * reset 也存，否则"先 reset 再开 tab"会让 tab 带上过期的覆盖。
       */
      this.pushCapabilityIntent(conversationId, { kind: 'viewport', viewportSize: clamped })
      return
    }
    const state = this.pages.get(pageKey(conversationId, tabId))
    if (state == null) return
    const changed =
      state.emulatedViewportSize?.width !== clamped?.width ||
      state.emulatedViewportSize?.height !== clamped?.height
    state.emulatedViewportSize = clamped
    if (changed) await this.syncPageDeviceMetrics(state)
    this.windowManager.sendMessageToAllWindows({
      type: 'browser-sidebar-browser-use-viewport',
      conversationId,
      browserTabId: tabId,
      viewportSize: clamped
    })
  }

  /**
   * 把视口覆盖下到页面上。
   *
   * 覆盖是**粘性**的：交给 CDP 通道记住，截图临时改视口后要恢复成它，
   * 而不是无条件 clear —— 否则 agent 设完视口截一张图，覆盖就没了。
   */
  private async syncPageDeviceMetrics(state: BrowserPageState): Promise<void> {
    const guest = state.guest
    if (guest == null || guest.isDestroyed()) return
    try {
      await this.cdp.setStickyDeviceMetrics(state.browserTabId, guest, state.emulatedViewportSize)
    } catch (error) {
      console.warn('[browser] failed to apply browser_use viewport', error)
    }
  }

  /**
   * 没给 tab id 时用哪个 tab。
   *
   * Codex 用 `getActiveBrowserUseTab`：优先当前被 browser_use 接管的那个。
   * capability 的 payload 里只有 `browser_id`（= 会话），没有 tab id，
   * 所以这一步是必须的。
   */
  private resolveBrowserUseTabId(conversationId: string): string | null {
    const pages = this.findPagesForConversation(conversationId)
    if (pages.length === 0) return null
    return (pages.find((page) => page.browserUseActive) ?? pages[pages.length - 1]).browserTabId
  }

  private pushCapabilityIntent(conversationId: string, intent: PendingCapabilityIntent): void {
    const queue = this.pendingCapabilityIntents.get(conversationId) ?? []
    // 同类意图只保留最后一次：agent 连着 set 两个尺寸，只有后一个有意义
    const kept = queue.filter((existing) => existing.kind !== intent.kind)
    kept.push(intent)
    this.pendingCapabilityIntents.set(conversationId, kept)
  }

  /** tab 真的起来了：把攒下的 capability 意图补上（Codex 在 debugger 同步点做） */
  private applyPendingCapabilityIntents(conversationId: string, browserTabId: string): void {
    const queue = this.pendingCapabilityIntents.get(conversationId)
    if (queue == null || queue.length === 0) return
    this.pendingCapabilityIntents.delete(conversationId)
    for (const intent of queue) {
      if (intent.kind === 'visibility') {
        this.setBrowserVisibleForBrowserUse(conversationId, intent.visible, browserTabId)
      } else {
        void this.setViewportForBrowserUse(conversationId, intent.viewportSize, browserTabId)
      }
    }
  }

  isBrowserPageWebContents(webContents: WebContents): boolean {
    return this.findStateByGuest(webContents) != null
  }

  private findStateByGuest(guest: WebContents): BrowserPageState | null {
    for (const state of this.pages.values()) {
      if (state.guest != null && state.guest.id === guest.id) return state
    }
    return null
  }

  private broadcastState(conversationId: string): void {
    this.windowManager.sendMessageToAllWindows({
      type: 'browser-sidebar-state',
      conversationId,
      tabs: this.getState(conversationId)
    })
  }
}

/** 渲染层把 webview 挪到捕获表面并让 Chromium 产出一帧所需的时间 */
const CAPTURE_SURFACE_SETTLE_MS = 400

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Codex `hV`：视口覆盖的取值范围，逐字照搬。
 * 越界不报错而是夹紧 —— agent 给出 `width: 0` 时报错没有意义，页面渲染不出来
 * 才是真问题。
 */
const VIEWPORT_BOUNDS = { minWidth: 240, maxWidth: 4096, minHeight: 160, maxHeight: 4096 }

function clampViewport(size: ViewportSize): ViewportSize {
  return {
    width: Math.round(
      Math.min(VIEWPORT_BOUNDS.maxWidth, Math.max(VIEWPORT_BOUNDS.minWidth, size.width))
    ),
    height: Math.round(
      Math.min(VIEWPORT_BOUNDS.maxHeight, Math.max(VIEWPORT_BOUNDS.minHeight, size.height))
    )
  }
}

function clampZoom(percent: number): number {
  return Math.min(500, Math.max(25, Math.round(percent)))
}

function suggestedScreenshotName(url: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  try {
    const host = new URL(url).hostname
    if (host !== '') return `${host}-${stamp}.png`
  } catch {
    /* 非法 URL，走下面的兜底 */
  }
  const base = basename(url)
  return `${base === '' ? 'screenshot' : base}-${stamp}.png`
}

export type { BrowserPageState }
export { pageKey }
