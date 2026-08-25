import { RpcTarget } from 'capnweb'
import type { WebContents } from 'electron'
import type {
  TerminalCreateParams,
  TerminalEvent,
  TerminalService as TerminalContract,
  TerminalShellPreference,
  TerminalSnapshot
} from '@shared/host/appHost'
import type { TerminalManager } from '../../terminal/TerminalManager'

/**
 * 终端服务 —— Codex `tTe`。
 *
 * 一个窗口一个实例（跟着 AppHost 走），`origin` 就是那个窗口的 webContents。
 * 所有方法都把 origin 传给 manager —— 会话的归属检查在那一层做，服务这层
 * 只负责"我是谁"。
 */

/**
 * 从对端传进来的回调。
 *
 * capnweb 把函数按引用传过来，拿到的是一个 stub：可调用，另外带
 * `dup()`（延长生命周期）/`onRpcBroken()`（对端断了）/`Symbol.dispose`。
 * Codex 的 `subscribe` 就是靠这三件事管订阅的生命周期。
 */
type TerminalEventListener = ((event: TerminalEvent) => void) & {
  dup?(): TerminalEventListener
  onRpcBroken?(callback: (error: unknown) => void): void
  [Symbol.dispose]?(): void
}

export class TerminalService extends RpcTarget implements TerminalContract {
  private listener: TerminalEventListener | null = null
  private unsubscribeManager: (() => void) | null = null
  private readonly handleOriginDestroyed = (): void => {
    this.unsubscribe()
    this.manager.cleanupForOwner(this.origin.id)
  }

  constructor(
    private readonly manager: TerminalManager,
    private readonly origin: WebContents
  ) {
    super()
    this.origin.once('destroyed', this.handleOriginDestroyed)
  }

  create(params: TerminalCreateParams): Promise<string | null> {
    return this.manager.createOrAttach(this.owner(), { ...params, type: 'create' })
  }

  attach(params: TerminalCreateParams): Promise<string | null> {
    return this.manager.createOrAttach(this.owner(), { ...params, type: 'attach' })
  }

  write(sessionId: string, data: string): void {
    this.manager.write(this.owner(), sessionId, data)
  }

  resize(sessionId: string, cols: number, rows: number, repaint?: boolean): void {
    this.manager.resize(this.owner(), sessionId, cols, rows, repaint ?? false)
  }

  close(sessionId: string): void {
    this.manager.close(this.owner(), sessionId)
  }

  runAction(sessionId: string, cwd: string | null, command: string): void {
    this.manager.runAction(this.owner(), sessionId, { cwd, command })
  }

  getAvailableShells(): TerminalShellPreference[] {
    return this.manager.getAvailableShells()
  }

  getShellCwd(sessionId: string, cwd: string): string | null {
    return this.manager.getShellCwd(this.owner(), sessionId, cwd)
  }

  getThreadSnapshot(conversationId: string): TerminalSnapshot | null {
    return this.manager.getSnapshotForConversation(this.origin.id, conversationId)
  }

  /**
   * 订阅事件流。
   *
   * `dup()` 是必须的：参数 stub 的生命周期默认只到这次调用返回，
   * 不 dup 的话第一个事件推出去时对端已经把它回收了。
   */
  subscribe(listener: (event: TerminalEvent) => void): void {
    this.unsubscribe()
    const stub = listener as TerminalEventListener
    const held = stub.dup?.() ?? stub
    this.listener = held
    held.onRpcBroken?.(() => this.unsubscribe())
    this.unsubscribeManager = this.manager.subscribe(this.owner(), (event) => {
      try {
        held(event)
      } catch {
        // 对端已断；onRpcBroken 会把订阅收掉
      }
    })
  }

  unsubscribe(): void {
    this.unsubscribeManager?.()
    this.unsubscribeManager = null
    this.listener?.[Symbol.dispose]?.()
    this.listener = null
  }

  /** AppHost 销毁时调用（窗口关闭走 origin 的 destroyed 事件） */
  dispose(): void {
    this.origin.removeListener('destroyed', this.handleOriginDestroyed)
    this.unsubscribe()
  }

  private owner(): { id: number; isDestroyed(): boolean } {
    return { id: this.origin.id, isDestroyed: () => this.origin.isDestroyed() }
  }
}
