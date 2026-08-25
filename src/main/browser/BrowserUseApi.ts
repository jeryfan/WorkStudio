import type { BrowserSidebarManager, BrowserPageState } from './BrowserSidebarManager'

/**
 * browser_use 的宿主 API 实现。
 *
 * 取证：Codex 的同名实现（压缩后 `jX`）暴露 88 个方法给 native pipe，其中
 * 核心的一组是：
 *   ping / getTabs / createTab / nameSession / attach / attachTarget /
 *   detach / detachTarget / executeCdp / executeCdpWithCachedExpression /
 *   allowDownload / getInfo / getUserTabs / getUserHistory / claimUserTab /
 *   finalizeTabs / markTab / moveMouse / notifyCursorArrived /
 *   releaseSessionControl / turnEnded / disposeRoute / reassignRoute
 * 参数是 snake_case（实测 `turnEnded({session_id, turn_id})`）。
 *
 * 这里实现的是能靠 Electron `webContents.debugger` 完整支撑的那一档：
 * tab 生命周期 + CDP 直通 + 鼠标移动 + 接管态。没有对应实现的（用户手动开的
 * Chrome tab 认领、浏览历史、下载放行）不做假实现 —— 调用会返回明确的
 * "not implemented"，而不是静默的空结果。
 */

export interface BrowserUseSessionRoute {
  /** Codex `getSessionIdForBrowserRoute`：默认就是 conversationId */
  sessionId: string
  conversationId: string
  /** 与注入给 agent 的 BROWSER_USE_CODEX_APP_BUILD_FLAVOR 必须一致 */
  buildFlavor: string
}

interface TabInfo {
  tab_id: string
  url: string
  title: string
  is_loading: boolean
  zoom_percent: number
  attached: boolean
}

export class BrowserUseApi {
  private readonly cdpEventListeners = new Set<(event: unknown) => void>()

  constructor(
    private readonly manager: BrowserSidebarManager,
    private readonly route: BrowserUseSessionRoute
  ) {
    this.manager.cdp.addEventListener((event) => {
      for (const listener of this.cdpEventListeners) listener(event)
    })
  }

  addCdpEventListener(listener: (event: unknown) => void): () => void {
    this.cdpEventListeners.add(listener)
    return () => {
      this.cdpEventListeners.delete(listener)
    }
  }

  /** 方法分发：native pipe 与进程内调用共用这一张表 */
  async invoke(method: string, params: unknown): Promise<unknown> {
    const args = (params ?? {}) as Record<string, unknown>
    switch (method) {
      case 'ping':
        return { ok: true }
      case 'getTabs':
        return { tabs: this.getTabs() }
      case 'getInfo':
        return this.getInfo()
      case 'createTab':
        return this.createTab(String(args.url ?? 'about:blank'))
      case 'nameSession':
        // 会话命名只影响 Codex 侧的展示，宿主无状态可改
        return { ok: true }
      case 'attach':
        return this.attach(String(args.tab_id ?? ''))
      case 'detach':
        return this.detach(String(args.tab_id ?? ''))
      case 'attachTarget':
        return this.attachTarget(String(args.tab_id ?? ''), String(args.target_id ?? ''))
      case 'detachTarget':
        return this.detachTarget(String(args.tab_id ?? ''), String(args.target_id ?? ''))
      case 'executeCdp':
        return this.executeCdp(
          String(args.tab_id ?? ''),
          String(args.method ?? ''),
          args.params,
          args.session_id == null ? undefined : String(args.session_id)
        )
      case 'moveMouse':
        return this.moveMouse(String(args.tab_id ?? ''), Number(args.x ?? 0), Number(args.y ?? 0))
      case 'closeTab':
        return this.closeTab(String(args.tab_id ?? ''))
      case 'releaseSessionControl':
        this.manager.setBrowserUseActive(this.route.conversationId, null, false)
        return { ok: true }
      case 'turnEnded':
        this.manager.setBrowserUseActive(this.route.conversationId, null, false)
        return { ok: true }
      case 'disposeRoute':
        this.manager.deleteConversation(this.route.conversationId)
        return { ok: true }
      default:
        throw new Error(`browser_use method not implemented: ${method}`)
    }
  }

  getTabs(): TabInfo[] {
    return this.pages().map((page) => this.serializeTab(page))
  }

  /**
   * 后端自述 —— **发现机制的关键**，形状不能改。
   *
   * 取证：客户端（bundled browser plugin 的 `browser-service.mjs`）枚举
   * `/tmp/codex-browser-use` 下的每个 socket，连上后调 `getInfo()`，然后按
   *   `info.type === 'iab'`
   *   `info.metadata.codexSessionId === <当前 turn 的 session id>`
   *   `(期望的 flavor == null || info.metadata.codexAppBuildFlavor === 期望值)`
   * 三条筛。任何一条对不上，这个后端就被 `close()` 掉，agent 那边表现为
   * "no-session-match" / "no-iab-backends"。
   */
  getInfo(): Record<string, unknown> {
    return {
      type: 'iab',
      metadata: {
        codexSessionId: this.route.sessionId,
        codexAppBuildFlavor: this.route.buildFlavor
      },
      tabCount: this.pages().length
    }
  }

  createTab(url: string): TabInfo {
    const route = this.manager.openPageForBrowserUse(this.route.conversationId, url)
    this.manager.setBrowserUseActive(this.route.conversationId, route.browserTabId, true)
    const page = this.manager.findPage(this.route.conversationId, route.browserTabId)
    if (page == null) throw new Error('Failed to create browser tab')
    return this.serializeTab(page)
  }

  async attach(tabId: string): Promise<{ ok: true }> {
    const { page, guest } = this.requireLiveTab(tabId)
    this.manager.cdp.attach(page.browserTabId, guest)
    this.manager.setBrowserUseActive(this.route.conversationId, tabId, true)
    return { ok: true }
  }

  async detach(tabId: string): Promise<{ ok: true }> {
    const page = this.requireTab(tabId)
    const guest = page.guest
    if (guest != null && !guest.isDestroyed()) this.manager.cdp.detach(page.browserTabId, guest)
    this.manager.setBrowserUseActive(this.route.conversationId, tabId, false)
    return { ok: true }
  }

  async attachTarget(tabId: string, targetId: string): Promise<{ session_id: string }> {
    const { page, guest } = this.requireLiveTab(tabId)
    const sessionId = await this.manager.cdp.attachTarget(page.browserTabId, guest, targetId)
    return { session_id: sessionId }
  }

  async detachTarget(tabId: string, targetId: string): Promise<{ ok: true }> {
    const { page, guest } = this.requireLiveTab(tabId)
    await this.manager.cdp.detachTarget(page.browserTabId, guest, targetId)
    return { ok: true }
  }

  async executeCdp(
    tabId: string,
    method: string,
    params: unknown,
    sessionId?: string
  ): Promise<unknown> {
    const { page, guest } = this.requireLiveTab(tabId)
    return this.manager.cdp.send(page.browserTabId, guest, method, params, sessionId)
  }

  async moveMouse(tabId: string, x: number, y: number): Promise<{ ok: true }> {
    const { page, guest } = this.requireLiveTab(tabId)
    await this.manager.cdp.dispatchMouseMove(page.browserTabId, guest, x, y)
    return { ok: true }
  }

  closeTab(tabId: string): { ok: true } {
    this.manager.closePage(this.route.conversationId, tabId)
    return { ok: true }
  }

  private pages(): BrowserPageState[] {
    return this.manager.findPagesForConversation(this.route.conversationId)
  }

  private requireTab(tabId: string): BrowserPageState {
    const page = this.manager.findPage(this.route.conversationId, tabId)
    if (page == null) throw new Error(`Unknown tab: ${tabId}`)
    return page
  }

  private requireLiveTab(tabId: string): { page: BrowserPageState; guest: Electron.WebContents } {
    const page = this.requireTab(tabId)
    const guest = page.guest
    if (guest == null || guest.isDestroyed()) throw new Error(`Tab is not attached: ${tabId}`)
    return { page, guest }
  }

  private serializeTab(page: BrowserPageState): TabInfo {
    return {
      tab_id: page.browserTabId,
      url: page.url ?? '',
      title: page.title,
      is_loading: page.isLoading,
      zoom_percent: page.zoomPercent,
      attached: page.guest != null && !page.guest.isDestroyed()
    }
  }
}
