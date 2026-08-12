import type { BrowserWindow, IpcMain, IpcMainEvent } from 'electron'
import {
  RpcErrorCode,
  isRpcNotification,
  isRpcRequest,
  isRpcResponse,
  isRpcErrorResponse,
  makeError,
  makeNotification,
  makeRequest,
  makeSuccess,
  type RpcId,
  type RpcMessage
} from '@shared/rpc/messages'
import { RPC_CHANNEL, type AgentRuntimeStatus } from '@shared/rpc/channels'
import { SUBSCRIBED_NOTIFICATIONS } from '@shared/protocol/notifications'
import { isLocalMethod } from '@shared/protocol/local'
import { SERVER_REQUEST } from '@shared/protocol/methods'
import { RpcRequestError } from '@shared/rpc/peer'
import type { ProtocolClient } from './ProtocolClient'

export type LocalHandler = (params: unknown, method: string) => unknown | Promise<unknown>

interface ForwardedRequest {
  resolve(value: unknown): void
  reject(error: Error): void
  timer: NodeJS.Timeout
}

/**
 * 服务端反向请求在渲染层的应答时限。
 * 审批要等用户操作，给足时间；超时按"未决"失败处理，agent 会收到错误而不是
 * 无限等待。
 */
const SERVER_REQUEST_TIMEOUT_MS = 10 * 60 * 1000

/**
 * 渲染进程 RPC 的统一路由。
 *
 * 渲染层只认一套 JSON-RPC 语义，不需要知道某个方法是主进程本地实现的、
 * 还是转发给 agent 的。将来把某组能力换个位置实现（例如 fs 改由远端提供），
 * 只改这里的路由表，UI 与服务层不动。
 */
export class RpcRouter {
  private readonly localHandlers = new Map<string, LocalHandler>()
  private readonly forwarded = new Map<RpcId, ForwardedRequest>()
  private readonly windows = new Set<BrowserWindow>()
  private agentStatus: AgentRuntimeStatus = { state: 'starting' }
  private disposers: Array<() => void> = []

  constructor(
    private readonly client: ProtocolClient,
    private readonly ipcMain: IpcMain
  ) {}

  /** 注册本地方法实现（项目注册表等） */
  registerLocal(method: string, handler: LocalHandler): void {
    this.localHandlers.set(method, handler)
  }

  attachWindow(win: BrowserWindow): void {
    this.windows.add(win)
    win.once('closed', () => this.windows.delete(win))
  }

  setAgentStatus(status: AgentRuntimeStatus): void {
    this.agentStatus = status
    this.broadcast(makeNotification('app/agent/statusChanged', status))
  }

  getAgentStatus(): AgentRuntimeStatus {
    return this.agentStatus
  }

  start(): void {
    this.ipcMain.on(RPC_CHANNEL.fromView, (event, raw: unknown) => {
      void this.handleFromView(event, raw)
    })

    // agent 通知 → 广播给所有窗口。退订清单已在握手时下发，这里的过滤是
    // 第二道防线：协议升级后新增的通知在策略表里表态之前不会泄漏到渲染层。
    this.disposers.push(
      this.client.onNotification((method, params) => {
        if (!SUBSCRIBED_NOTIFICATIONS.has(method)) return
        this.broadcast(makeNotification(method, params))
      })
    )

    // agent 反向请求 → 转给渲染层应答
    for (const method of Object.values(SERVER_REQUEST)) {
      this.disposers.push(
        this.client.onServerRequest(method, (params) => this.forwardToView(method, params))
      )
    }
  }

  dispose(): void {
    for (const d of this.disposers) d()
    this.disposers = []
    for (const [, pending] of this.forwarded) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Router disposed'))
    }
    this.forwarded.clear()
  }

  private async handleFromView(event: IpcMainEvent, raw: unknown): Promise<void> {
    const msg = raw as RpcMessage

    // 渲染层对反向请求的应答
    if (isRpcResponse(msg)) {
      const pending = this.forwarded.get(msg.id)
      if (!pending) return
      this.forwarded.delete(msg.id)
      clearTimeout(pending.timer)
      if (isRpcErrorResponse(msg)) {
        pending.reject(new RpcRequestError(msg.error.code, msg.error.message, msg.error.data))
      } else {
        pending.resolve(msg.result)
      }
      return
    }

    if (isRpcNotification(msg)) {
      if (!isLocalMethod(msg.method)) this.client.notify(msg.method, msg.params)
      return
    }

    if (!isRpcRequest(msg)) return

    const reply = (out: RpcMessage): void => {
      if (!event.sender.isDestroyed()) event.sender.send(RPC_CHANNEL.toView, out)
    }

    try {
      const result = isLocalMethod(msg.method)
        ? await this.invokeLocal(msg.method, msg.params)
        : await this.client.request(msg.method, msg.params)
      reply(makeSuccess(msg.id, result ?? null))
    } catch (err) {
      const code = err instanceof RpcRequestError ? err.code : RpcErrorCode.InternalError
      const message = err instanceof Error ? err.message : String(err)
      reply(makeError(msg.id, code, message))
    }
  }

  private async invokeLocal(method: string, params: unknown): Promise<unknown> {
    const handler = this.localHandlers.get(method)
    if (!handler) {
      throw new RpcRequestError(RpcErrorCode.MethodNotFound, `Method not found: ${method}`)
    }
    return handler(params, method)
  }

  /**
   * 把 agent 的反向请求转给渲染层，等待用户决策。
   *
   * 没有窗口可应答时立即失败而不是挂起——挂起会让 agent 永远停在那一步，
   * 表现为"任务卡住不动"，很难排查。
   */
  private forwardToView(method: string, params: unknown): Promise<unknown> {
    const target = this.primaryWindow()
    if (!target) {
      return Promise.reject(
        new RpcRequestError(RpcErrorCode.ServerError, 'No window available to handle the request')
      )
    }

    const id: RpcId = `srv:${method}:${randomSuffix()}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.forwarded.delete(id)
        reject(new RpcRequestError(RpcErrorCode.ServerError, `Request timed out: ${method}`))
      }, SERVER_REQUEST_TIMEOUT_MS)

      this.forwarded.set(id, { resolve, reject, timer })
      target.webContents.send(RPC_CHANNEL.toView, makeRequest(id, method, params))
    })
  }

  private primaryWindow(): BrowserWindow | null {
    for (const win of this.windows) {
      if (!win.isDestroyed()) return win
    }
    return null
  }

  private broadcast(message: RpcMessage): void {
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.webContents.send(RPC_CHANNEL.toView, message)
    }
  }
}

let counter = 0
function randomSuffix(): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER
  return `${Date.now().toString(36)}-${counter}`
}
