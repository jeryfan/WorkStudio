import { BrowserWindow, screen, shell, type Rectangle, type WebContents } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { HostMessage } from '@shared/host/messages'
import { ChunkedMessageSender } from './ChunkedMessageSender'
import { WebviewWindow } from './WebviewWindow'
import icon from '../../../resources/icon.png?asset'

const isMac = process.platform === 'darwin'
const isWin32 = process.platform === 'win32'

/**
 * 主窗口的最小尺寸。抽成常量是因为 `setPrimaryWindowMode` 也要用它 ——
 * onboarding 尺寸比它小的时候必须临时把下限压到 onboarding 尺寸，
 * 否则 `setSize` 会被最小尺寸顶回去（表现为"窗口没变小"）。
 */
const PRIMARY_MIN_SIZE = { width: 1080, height: 700 }

/**
 * onboarding 的窗口尺寸 —— Codex 主进程 chunk 的 `hge()`：
 *   v2 → `{width: fge, height: pge}` = 1090×760
 *   其他 → `{width: WQ, height: WQ}` = 560×560
 *   app → null（回到用户自己的窗口几何）
 */
const ONBOARDING_SIZE_V2 = { width: 1090, height: 760 }
const ONBOARDING_SIZE_LEGACY = { width: 560, height: 560 }
/** Codex `GQ`：Windows 上目标尺寸接近工作区就直接最大化 */
const WIN32_MAXIMIZE_RATIO = 0.9

export interface WindowMode {
  mode: 'app' | 'onboarding'
  onboardingVariant?: 'v2'
}

/** Codex `hge(mode)` */
function targetSizeFor(mode: WindowMode): { width: number; height: number } | null {
  if (mode.mode !== 'onboarding') return null
  return mode.onboardingVariant === 'v2' ? ONBOARDING_SIZE_V2 : ONBOARDING_SIZE_LEGACY
}

function sameMode(a: WindowMode, b: WindowMode): boolean {
  return a.mode === b.mode && a.onboardingVariant === b.onboardingVariant
}

/**
 * 窗口与渲染目标的注册中心。
 *
 * 取证：Codex 的 `windowManager`（`getPrimaryWindow` / `ensureWindow` /
 * `createFreshWindow` / `sendMessageToWindow` / `sendMessageToAllWindows` /
 * `getRendererWindowLogFields`）。宿主消息的所有发送点都经过它，
 * 服务实现里不出现 `webContents.send`。
 */
export class WindowManager {
  readonly chunkedMessageSender = new ChunkedMessageSender({
    onDiagnostic: (message, detail) => console.warn('[host]', message, detail ?? '')
  })

  private readonly webviewWindows = new Map<number, WebviewWindow>()
  private readonly registrationListeners = new Set<(target: WebviewWindow) => void>()

  /** 当前主窗口模式（Codex `primaryWindowMode`），app 模式为 null */
  private primaryWindowMode: WindowMode = { mode: 'app' }
  /** 进 onboarding 之前的窗口几何（Codex `primaryWindowRestoreBounds`） */
  private primaryWindowRestoreBounds: {
    bounds: Rectangle
    wasMaximized: boolean
    wasFullScreen: boolean
  } | null = null

  /** 应用窗口的 preload（浏览器页面用的是另一个产物，见 browser/webviewAttach.ts） */
  private readonly preloadPath = join(__dirname, '../preload/index.js')

  createWindow(): BrowserWindow {
    // 尺寸依据 prototype/1.html 的绝对定位反推：
    // 卡片区底边 433+104=537，输入框顶边 = 视口高-141 → 视口高需 ≥678
    // 卡片 714px + 左右 48px 边距，侧边栏 299px+1px 边框 → 窗口宽需 ≥1062
    const window = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: PRIMARY_MIN_SIZE.width,
      minHeight: PRIMARY_MIN_SIZE.height,
      show: false,
      autoHideMenuBar: true,
      // 1.html 的顶栏是 fixed 横跨全宽 + 侧边栏 padding-top:44px 让位，
      // 本就是在模拟无边框窗口
      ...(isMac
        ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 13, y: 15 } }
        : {
            titleBarStyle: 'hidden' as const,
            titleBarOverlay: { color: '#f4f4f5', symbolColor: '#6f6f74', height: 44 }
          }),
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: this.preloadPath,
        sandbox: false,
        // 内置浏览器用 <webview>；attach 时机由主进程拦截（browser/webviewAttach.ts）
        webviewTag: true
      }
    })

    window.on('ready-to-show', () => window.show())

    window.webContents.setWindowOpenHandler((details) => {
      void shell.openExternal(details.url)
      return { action: 'deny' }
    })

    this.register(window)

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      void window.loadFile(join(__dirname, '../renderer/index.html'))
    }
    return window
  }

  /** 已有主窗口就复用，否则新建（Codex `ensureWindow`） */
  async ensureWindow(): Promise<BrowserWindow> {
    const primary = this.getPrimaryWindow()
    if (primary != null) return primary
    return this.createWindow()
  }

  getPrimaryWindow(): BrowserWindow | null {
    const focused = BrowserWindow.getFocusedWindow()
    if (focused != null && !focused.isDestroyed()) return focused
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) return window
    }
    return null
  }

  /** 窗口不可见/最小化时把它带到前台（菜单命令都要先做这件事） */
  async showPrimaryWindow(): Promise<BrowserWindow | null> {
    const window = await this.ensureWindow()
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    return window
  }

  /**
   * 主窗口模式 —— Codex 主进程 chunk 的 `setPrimaryWindowMode(webContents, mode)`，
   * 逐段照搬（顺序也照搬，因为顺序会影响结果）：
   *
   *   1. 发起者必须是**当前主窗口**，否则直接返回（第二个窗口不能改主窗口几何）；
   *   2. 模式没变：目标尺寸非空时把窗口带到前台，别的什么都不做；
   *   3. 进 onboarding：先记下原几何（只记第一次），退出全屏/最大化，设为可缩放，
   *      按工作区裁剪目标尺寸，**先把最小尺寸压到目标尺寸**再 `setSize`，
   *      然后居中并显示；Windows 上目标接近工作区（≥90%）时改为最大化；
   *   4. 回 app：恢复可缩放/可最大化/可全屏，还原原几何与最大化/全屏状态。
   *
   * 第 3 步里 `setMinimumSize` 必须在 `setSize` 之前 —— 主窗口的最小尺寸
   * （1080×700）比 onboarding 尺寸大的那一维会把 `setSize` 顶回去。
   *
   * Windows 上还要减掉窗口边框（`getBounds` 与 `getContentBounds` 的差），
   * Codex 同：目标尺寸说的是内容区，而 `setSize` 设的是整窗。
   */
  setPrimaryWindowMode(sender: WebContents, mode: WindowMode): void {
    const window = BrowserWindow.fromWebContents(sender)
    if (window == null || window.isDestroyed()) return
    const primary = this.getPrimaryWindow()
    if (primary == null || primary.isDestroyed() || primary.id !== window.id) return

    const target = targetSizeFor(mode)
    if (sameMode(this.primaryWindowMode, mode)) {
      if (target != null) {
        if (window.isMinimized()) window.restore()
        window.show()
      }
      return
    }
    this.primaryWindowMode = mode

    if (target != null) {
      this.primaryWindowRestoreBounds ??= {
        bounds: window.getNormalBounds(),
        wasMaximized: window.isMaximized(),
        wasFullScreen: window.isFullScreen()
      }
      if (window.isFullScreen()) window.setFullScreen(false)
      if (window.isMaximized()) window.unmaximize()
      window.setResizable(true)

      const workArea = screen.getDisplayMatching(window.getNormalBounds()).workAreaSize
      const chrome = isWin32
        ? {
            width: Math.max(0, window.getBounds().width - window.getContentBounds().width),
            height: Math.max(0, window.getBounds().height - window.getContentBounds().height)
          }
        : { width: 0, height: 0 }
      const available = {
        width: workArea.width - chrome.width,
        height: workArea.height - chrome.height
      }
      const size = {
        width: Math.min(target.width, available.width),
        height: Math.min(target.height, available.height)
      }
      const shouldMaximize =
        isWin32 &&
        (size.width >= available.width * WIN32_MAXIMIZE_RATIO ||
          size.height >= available.height * WIN32_MAXIMIZE_RATIO)

      window.setMaximizable(isWin32)
      window.setFullScreenable(false)
      window.setMinimumSize(
        Math.min(PRIMARY_MIN_SIZE.width, size.width),
        Math.min(PRIMARY_MIN_SIZE.height, size.height)
      )
      window.setSize(size.width, size.height)
      if (!shouldMaximize) window.center()
      if (window.isMinimized()) window.restore()
      window.show()
      if (shouldMaximize) window.maximize()
      return
    }

    window.setResizable(true)
    window.setMaximizable(true)
    window.setFullScreenable(true)
    window.setMinimumSize(PRIMARY_MIN_SIZE.width, PRIMARY_MIN_SIZE.height)
    const restore = this.primaryWindowRestoreBounds
    this.primaryWindowRestoreBounds = null
    if (restore == null) return
    window.setBounds(restore.bounds)
    if (restore.wasMaximized) window.maximize()
    if (restore.wasFullScreen) window.setFullScreen(true)
  }

  private register(window: BrowserWindow): void {
    const target = new WebviewWindow(window.webContents, this.chunkedMessageSender, window)
    this.webviewWindows.set(window.webContents.id, target)

    window.webContents.once('destroyed', () => {
      this.webviewWindows.delete(target.id)
      this.chunkedMessageSender.dispose(window.webContents)
    })

    // 焦点与全屏状态：渲染层的顶栏与快捷键提示要跟着变
    window.on('focus', () => target.send({ type: 'electron-window-focus-changed', focused: true }))
    window.on('blur', () => target.send({ type: 'electron-window-focus-changed', focused: false }))
    window.on('enter-full-screen', () =>
      target.send({ type: 'window-fullscreen-changed', fullscreen: true })
    )
    window.on('leave-full-screen', () =>
      target.send({ type: 'window-fullscreen-changed', fullscreen: false })
    )

    for (const listener of this.registrationListeners) listener(target)
  }

  /** WindowContext 用它把新窗口接进 app-server 连接与服务树 */
  onWindowRegistered(listener: (target: WebviewWindow) => void): () => void {
    this.registrationListeners.add(listener)
    for (const target of this.webviewWindows.values()) listener(target)
    return () => {
      this.registrationListeners.delete(listener)
    }
  }

  getWebviewWindow(webContents: WebContents): WebviewWindow | null {
    return this.webviewWindows.get(webContents.id) ?? null
  }

  hasRegisteredWebContents(webContents: WebContents): boolean {
    return this.webviewWindows.has(webContents.id)
  }

  getAllWebviewWindows(): WebviewWindow[] {
    return Array.from(this.webviewWindows.values()).filter((target) => !target.isDestroyed())
  }

  sendMessageToWindow(window: BrowserWindow | WebContents, message: HostMessage): void {
    const webContents = 'webContents' in window ? window.webContents : window
    this.getWebviewWindow(webContents)?.send(message)
  }

  sendMessageToAllWindows(message: HostMessage): void {
    for (const target of this.getAllWebviewWindows()) target.send(message)
  }
}
