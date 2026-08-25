import type { BrowserWindow, WebContents } from 'electron'
import { HOST_CHANNEL } from '@shared/host/channels'
import type { HostMessage } from '@shared/host/messages'
import type { ChunkedMessageSender } from './ChunkedMessageSender'

export interface Disposable {
  dispose(): void
}

/**
 * 一个可接收宿主消息的渲染目标。
 *
 * 取证：Codex 的 `y$`（webContents + chunkedMessageSender + browserWindow）。
 * 为什么要这层包装而不是直接传 webContents：
 *   - app-server 连接只认这个接口（`registerWebviewWindow`），它不该知道
 *     Electron 的存在，也不该自己判断该用普通通道还是 critical 通道；
 *   - 一个窗口可能有多个渲染目标（主窗口 / 悬浮宠物 / 调试窗），
 *     `isFocused` 之类的语义要按承载它的 BrowserWindow 判断。
 */
export class WebviewWindow {
  readonly id: number
  private readonly destroyedListeners = new Set<() => void>()
  private readonly focusListeners = new Set<(focused: boolean) => void>()

  constructor(
    readonly webContents: WebContents,
    private readonly chunkedMessageSender: ChunkedMessageSender,
    private readonly browserWindow: BrowserWindow | null = null
  ) {
    this.id = webContents.id
  }

  send(message: HostMessage): void {
    this.chunkedMessageSender.send(this.webContents, HOST_CHANNEL.messageForView, message)
  }

  sendCritical(message: HostMessage): void {
    this.chunkedMessageSender.sendCritical(this.webContents, HOST_CHANNEL.messageForView, message)
  }

  isDestroyed(): boolean {
    return this.webContents.isDestroyed()
  }

  isFocused(): boolean {
    return this.browserWindow?.isFocused() === true
  }

  onDestroyed(listener: () => void): Disposable {
    if (this.destroyedListeners.size === 0) {
      this.webContents.once('destroyed', this.handleDestroyed)
    }
    this.destroyedListeners.add(listener)
    return {
      dispose: () => {
        this.destroyedListeners.delete(listener)
        if (this.destroyedListeners.size === 0) {
          this.webContents.removeListener('destroyed', this.handleDestroyed)
        }
      }
    }
  }

  onFocusChanged(listener: (focused: boolean) => void): Disposable {
    const window = this.browserWindow
    if (window == null) return { dispose: () => {} }
    if (this.focusListeners.size === 0) {
      window.on('focus', this.handleFocus)
      window.on('blur', this.handleBlur)
    }
    this.focusListeners.add(listener)
    return {
      dispose: () => {
        this.focusListeners.delete(listener)
        if (this.focusListeners.size === 0) {
          window.removeListener('focus', this.handleFocus)
          window.removeListener('blur', this.handleBlur)
        }
      }
    }
  }

  private readonly handleDestroyed = (): void => {
    const listeners = Array.from(this.destroyedListeners)
    this.destroyedListeners.clear()
    for (const listener of listeners) listener()
  }

  private readonly handleFocus = (): void => this.notifyFocus(true)
  private readonly handleBlur = (): void => this.notifyFocus(false)

  private notifyFocus(focused: boolean): void {
    for (const listener of Array.from(this.focusListeners)) listener(focused)
  }
}
