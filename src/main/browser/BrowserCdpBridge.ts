import type { WebContents } from 'electron'

/**
 * 内置浏览器的 CDP 通道。
 *
 * 取证（这是"agent 如何真的操作内置浏览器"的落点）：Codex 在 guest webContents 上
 * `debugger.attach('1.3')`，之后所有页面操作都是 `debugger.sendCommand(...)`：
 *   - `Target.attachToTarget { flatten: true }` 拿 sessionId（iframe / OOPIF）
 *   - `Page.captureScreenshot`
 *   - `Input.dispatchMouseEvent`
 *   - `Emulation.setDeviceMetricsOverride`
 * CDP 事件经 `debugger.on('message')` 反向推给调用方。
 *
 * 为什么用 Electron 自带的 debugger 而不是开 `--remote-debugging-port`：
 * 开端口意味着本机任何进程都能接上并控制这个浏览器（含用户的登录态），
 * 而 debugger 是进程内通道，权限边界跟着主进程。
 */
export interface CdpEvent {
  /** 事件来源的 tab（browser_use 侧的 tab id） */
  tabId: string
  method: string
  params: unknown
  /** flatten 模式下的子 target session */
  sessionId?: string
}

const DEFAULT_CDP_TIMEOUT_MS = 15_000
/** 第一次截图给短超时：失败要尽快落到 beyondViewport 的重试上 */
const FIRST_CAPTURE_TIMEOUT_MS = 2_000
const FALLBACK_CAPTURE_TIMEOUT_MS = 10_000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  return Promise.race([
    promise.finally(() => {
      if (timer != null) clearTimeout(timer)
    }),
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    })
  ])
}

/**
 * 截图用的默认视口。
 *
 * guest 的真实可见尺寸主进程拿不到（`<webview>` 的布局在渲染层），
 * 页面 preload 上报的 viewport 才是准的；这里只在没有上报时兜底一个尺寸，
 * 保证"至少能截出图"而不是永远挂着。
 */
function defaultViewport(): { width: number; height: number; deviceScaleFactor: number } {
  return { width: 1280, height: 800, deviceScaleFactor: 0 }
}

export class BrowserCdpBridge {
  /** tabId → 已 attach 的 target sessionId 表 */
  private readonly targetSessions = new Map<string, Map<string, string>>()
  private readonly attached = new Set<string>()
  private readonly listeners = new Set<(event: CdpEvent) => void>()
  /**
   * 常驻的视口覆盖（browser_use 的 `viewport.set`）。
   *
   * 必须单独记一份：截图会临时下一次 `setDeviceMetricsOverride` 再撤，
   * 撤的时候如果无条件 `clearDeviceMetricsOverride`，agent 设的视口就被截图
   * 顺手清掉了 —— 表现为"设了 390x844，截完图页面又变回默认宽度"。
   */
  private readonly stickyDeviceMetrics = new Map<string, { width: number; height: number }>()

  addEventListener(listener: (event: CdpEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  isAttached(webContents: WebContents): boolean {
    return webContents.debugger.isAttached()
  }

  attach(tabId: string, webContents: WebContents): void {
    if (webContents.isDestroyed()) throw new Error(`Unknown tab: ${tabId}`)
    if (webContents.debugger.isAttached()) return
    try {
      webContents.debugger.attach('1.3')
    } catch (error) {
      // 别的调试器（DevTools）已经接着时 Electron 会抛这个，视为成功
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('already attached')) return
      throw error
    }
    this.attached.add(tabId)
    webContents.debugger.on('message', (_event, method, params, sessionId) => {
      if (method === 'Target.detachedFromTarget') {
        const detached = (params as { sessionId?: string }).sessionId
        if (detached != null) this.forgetTargetSession(tabId, detached)
      }
      for (const listener of this.listeners) {
        listener({ tabId, method, params, ...(sessionId ? { sessionId } : {}) })
      }
    })
    webContents.debugger.on('detach', () => {
      this.attached.delete(tabId)
      this.targetSessions.delete(tabId)
    })
  }

  detach(tabId: string, webContents: WebContents): void {
    this.attached.delete(tabId)
    this.targetSessions.delete(tabId)
    this.stickyDeviceMetrics.delete(tabId)
    if (webContents.isDestroyed() || !webContents.debugger.isAttached()) return
    try {
      webContents.debugger.detach()
    } catch {
      /* 已经断了 */
    }
  }

  /**
   * 发一条 CDP 命令。
   *
   * 必须带超时：CDP 命令**可以永远不返回**。最常见的是
   * `Page.captureScreenshot` 打在一个没有渲染表面的页面上（webview 被遮住、
   * 滚出视口、或所在窗口不可见）——命令既不成功也不失败。没有超时的话，
   * 这个 hang 会一路传到渲染层的服务调用上，表现为"点了截图什么都没发生"。
   */
  async send<T = unknown>(
    tabId: string,
    webContents: WebContents,
    method: string,
    params?: unknown,
    sessionId?: string,
    timeoutMs = DEFAULT_CDP_TIMEOUT_MS
  ): Promise<T> {
    this.attach(tabId, webContents)
    const command = webContents.debugger.sendCommand(
      method,
      params as Record<string, unknown> | undefined,
      sessionId
    ) as Promise<T>
    return withTimeout(command, timeoutMs, `CDP ${method} timed out after ${timeoutMs}ms`)
  }

  /** `Target.attachToTarget` 的 flatten 模式：拿到 sessionId 才能对子 target 发命令 */
  async attachTarget(tabId: string, webContents: WebContents, targetId: string): Promise<string> {
    const existing = this.targetSessions.get(tabId)?.get(targetId)
    if (existing != null) return existing
    const result = await this.send<{ sessionId?: string }>(
      tabId,
      webContents,
      'Target.attachToTarget',
      { flatten: true, targetId }
    )
    if (typeof result.sessionId !== 'string') {
      throw new Error('Target.attachToTarget did not return a sessionId')
    }
    const table = this.targetSessions.get(tabId) ?? new Map<string, string>()
    table.set(targetId, result.sessionId)
    this.targetSessions.set(tabId, table)
    return result.sessionId
  }

  async detachTarget(tabId: string, webContents: WebContents, targetId: string): Promise<void> {
    const sessionId = this.targetSessions.get(tabId)?.get(targetId)
    if (sessionId == null) return
    try {
      await this.send(tabId, webContents, 'Target.detachFromTarget', { sessionId })
    } finally {
      this.forgetTargetSession(tabId, sessionId)
    }
  }

  sessionIdForTarget(tabId: string, targetId: string): string | undefined {
    return this.targetSessions.get(tabId)?.get(targetId)
  }

  private forgetTargetSession(tabId: string, sessionId: string): void {
    const table = this.targetSessions.get(tabId)
    if (!table) return
    for (const [targetId, id] of table) {
      if (id === sessionId) table.delete(targetId)
    }
  }

  /**
   * 截图：返回 PNG 的 base64（不带 data: 前缀，与 CDP 一致）。
   *
   * 截图前先用 `Emulation.setDeviceMetricsOverride` 把渲染表面钉住 ——
   * 这就是 Codex 的 `queuePageDeviceMetricsSync` /
   * `setCaptureSurfaceForBrowserUseForRoute` 在做的事。不钉的话，页面不可见时
   * 合成器会被挂起，`Page.captureScreenshot` 永远不返回。
   */
  async captureScreenshot(
    tabId: string,
    webContents: WebContents,
    viewport?: { width: number; height: number; deviceScaleFactor?: number }
  ): Promise<string> {
    const bounds = viewport ?? this.stickyDeviceMetrics.get(tabId) ?? defaultViewport()
    let surfaceApplied = false
    try {
      await this.setDeviceMetrics(tabId, webContents, bounds)
      surfaceApplied = true
    } catch {
      // 设不上就直接试截图：可见页面本来也不需要这一步
    }
    try {
      try {
        const result = await this.send<{ data: string }>(
          tabId,
          webContents,
          'Page.captureScreenshot',
          { format: 'png', captureBeyondViewport: false },
          undefined,
          FIRST_CAPTURE_TIMEOUT_MS
        )
        return result.data
      } catch {
        /*
         * 页面完全不可见（移出视口 / 窗口不在前台）时合成器**没有帧可交**，
         * 上面那次会超时；`captureBeyondViewport: true` 也一样超时 —— 实测过。
         *
         * 唯一还能出帧的办法是让 Chromium 重新开始生产帧：`Page.startScreencast`
         * 会为这个页面建立捕获通道，第一帧到手就停掉。Codex 的
         * `setCaptureSurfaceForBrowserUseForRoute` 是常驻一个捕获表面，
         * 目的一样；按需开关的代价更小，也不影响不可见时的功耗。
         */
        return this.captureViaScreencast(tabId, webContents, bounds)
      }
    } finally {
      // 恢复到粘性覆盖（没有就真的清掉），而不是一律 clear
      if (surfaceApplied) {
        await this.setDeviceMetrics(
          tabId,
          webContents,
          this.stickyDeviceMetrics.get(tabId) ?? null
        ).catch(() => undefined)
      }
    }
  }

  /**
   * 靠 screencast 取一帧。
   *
   * 只在 `Page.captureScreenshot` 拿不到帧时用：开启 screencast 会让 Chromium
   * 恢复对这个页面的帧生产，拿到第一帧立刻停，避免不可见页面持续耗电。
   */
  private async captureViaScreencast(
    tabId: string,
    webContents: WebContents,
    bounds: { width: number; height: number }
  ): Promise<string> {
    const frame = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        dispose()
        reject(new Error(`CDP screencast produced no frame after ${FALLBACK_CAPTURE_TIMEOUT_MS}ms`))
      }, FALLBACK_CAPTURE_TIMEOUT_MS)
      const dispose = this.addEventListener((event) => {
        if (event.tabId !== tabId || event.method !== 'Page.screencastFrame') return
        const params = event.params as { data?: string; sessionId?: number }
        if (typeof params.data !== 'string') return
        clearTimeout(timer)
        dispose()
        // 必须 ack，否则 Chromium 不会再发下一帧（这里虽然只要一帧，也要收尾）
        if (params.sessionId != null) {
          void this.send(tabId, webContents, 'Page.screencastFrameAck', {
            sessionId: params.sessionId
          }).catch(() => undefined)
        }
        resolve(params.data)
      })
    })

    await this.send(tabId, webContents, 'Page.startScreencast', {
      format: 'png',
      maxWidth: bounds.width,
      maxHeight: bounds.height,
      everyNthFrame: 1
    })
    try {
      return await frame
    } finally {
      await this.send(tabId, webContents, 'Page.stopScreencast').catch(() => undefined)
    }
  }

  /**
   * 常驻视口覆盖：`browser_viewport_set` / `browser_viewport_reset` 的落点。
   * 与 `setDeviceMetrics` 的区别只在于**记不记住** —— 记住的那份会在截图之后
   * 被恢复回去。
   */
  async setStickyDeviceMetrics(
    tabId: string,
    webContents: WebContents,
    metrics: { width: number; height: number } | null
  ): Promise<void> {
    if (metrics == null) this.stickyDeviceMetrics.delete(tabId)
    else this.stickyDeviceMetrics.set(tabId, metrics)
    await this.setDeviceMetrics(tabId, webContents, metrics)
  }

  /** 视口覆盖：browser_use 需要固定视口才能让坐标可复现 */
  async setDeviceMetrics(
    tabId: string,
    webContents: WebContents,
    metrics: { width: number; height: number; deviceScaleFactor?: number; mobile?: boolean } | null
  ): Promise<void> {
    if (metrics == null) {
      await this.send(tabId, webContents, 'Emulation.clearDeviceMetricsOverride')
      return
    }
    await this.send(tabId, webContents, 'Emulation.setDeviceMetricsOverride', {
      width: metrics.width,
      height: metrics.height,
      deviceScaleFactor: metrics.deviceScaleFactor ?? 0,
      mobile: metrics.mobile ?? false
    })
  }

  /** 鼠标移动：Codex 的 `moveMouse`，用来把"agent 光标"画到页面上 */
  async dispatchMouseMove(
    tabId: string,
    webContents: WebContents,
    x: number,
    y: number
  ): Promise<void> {
    await this.send(tabId, webContents, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'none'
    })
  }
}
