import { BrowserWindow, shell, type WebContents } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { HostMessage } from '@shared/host/messages'
import { ChunkedMessageSender } from './ChunkedMessageSender'
import { WebviewWindow } from './WebviewWindow'
import icon from '../../../resources/icon.png?asset'

const isMac = process.platform === 'darwin'

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

  /** 应用窗口的 preload（浏览器页面用的是另一个产物，见 browser/webviewAttach.ts） */
  private readonly preloadPath = join(__dirname, '../preload/index.js')

  createWindow(): BrowserWindow {
    // 尺寸依据 prototype/1.html 的绝对定位反推：
    // 卡片区底边 433+104=537，输入框顶边 = 视口高-141 → 视口高需 ≥678
    // 卡片 714px + 左右 48px 边距，侧边栏 299px+1px 边框 → 窗口宽需 ≥1062
    const window = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 1080,
      minHeight: 700,
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
