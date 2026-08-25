import {
  isRpcErrorResponse,
  makeError,
  makeSuccess,
  RpcErrorCode,
  type RpcId,
  type RpcRequest
} from '@shared/rpc/messages'
import {
  LOCAL_HOST_ID,
  REQUEST_CONCURRENCY,
  requestPriorityFor,
  type AppServerRequestPriority,
  type HostId
} from '@shared/host/messages'
import { postMessageFromView, subscribeHostMessage } from './hostMessages'

/**
 * app-server 客户端（渲染层侧）。
 *
 * 取证：Codex 渲染层不直接连 app-server，而是把 JSON-RPC 报文装进宿主消息
 * 信封发出去（`mcp-request`），响应/通知/反向请求分别以 `mcp-response`、
 * `mcp-notification`、`mcp-request` 回来，每条都带 `hostId`。
 *
 * 请求排队是 Codex 实测的设计（`Ren`/`Ken`/`Jen`/`Yen`）：按方法名分三档
 * 并限制并发 —— critical 16 / interactive 64 / background 128。
 * 为什么渲染层要限流：一进会话就会并发打出 model/list、skills/list、
 * config/read 等一大批背景请求，它们和 `turn/start` 抢同一条 stdio 管道；
 * 不分档的话用户敲下回车的那一刻要排在十几个列表查询后面。
 */

export type NotificationListener = (params: unknown, method: string) => void
export type ServerRequestHandler = (params: unknown) => unknown | Promise<unknown>

export interface AppServerConnectionState {
  state: 'starting' | 'ready' | 'failed'
  version?: string
  error?: string
  hint?: string
}

interface PendingRequest {
  method: string
  resolve(value: unknown): void
  reject(error: Error): void
}

interface QueuedRequest {
  request: RpcRequest
  priority: AppServerRequestPriority
}

export class RpcRequestError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown
  ) {
    super(message)
    this.name = 'RpcRequestError'
  }
}

class AppServerClient {
  private nextId = 1
  private readonly pending = new Map<RpcId, PendingRequest>()
  private readonly queues: Record<AppServerRequestPriority, QueuedRequest[]> = {
    critical: [],
    interactive: [],
    background: []
  }
  private readonly inFlight: Record<AppServerRequestPriority, number> = {
    critical: 0,
    interactive: 0,
    background: 0
  }
  private readonly priorityById = new Map<RpcId, AppServerRequestPriority>()
  private readonly notificationListeners = new Map<string, Set<NotificationListener>>()
  private readonly anyNotificationListeners = new Set<NotificationListener>()
  private readonly serverRequestHandlers = new Map<string, ServerRequestHandler>()
  private readonly connectionListeners = new Set<(state: AppServerConnectionState) => void>()
  private connectionState: AppServerConnectionState = { state: 'starting' }
  private started = false

  constructor(private readonly hostId: HostId = LOCAL_HOST_ID) {}

  private start(): void {
    if (this.started) return
    this.started = true

    subscribeHostMessage('mcp-response', (message) => {
      if (message.hostId !== this.hostId) return
      const response = message.message
      const pending = this.pending.get(response.id)
      this.settleSlot(response.id)
      if (pending == null) return
      this.pending.delete(response.id)
      if (isRpcErrorResponse(response)) {
        pending.reject(
          new RpcRequestError(response.error.code, response.error.message, response.error.data)
        )
        return
      }
      pending.resolve(response.result)
    })

    subscribeHostMessage('mcp-notification', (message) => {
      if (message.hostId !== this.hostId) return
      for (const listener of this.notificationListeners.get(message.method) ?? []) {
        listener(message.params, message.method)
      }
      for (const listener of this.anyNotificationListeners) {
        listener(message.params, message.method)
      }
    })

    // 服务端反向请求（审批、工具提问）
    subscribeHostMessage('mcp-request', (message) => {
      if (message.hostId !== this.hostId) return
      void this.handleServerRequest(message.request)
    })

    subscribeHostMessage('codex-app-server-connection-state', (message) => {
      if (message.hostId !== this.hostId) return
      const { state, version, error, hint } = message
      this.connectionState = { state, version, error, hint }
      for (const listener of this.connectionListeners) listener(this.connectionState)
    })

    subscribeHostMessage('codex-app-server-fatal-error', (message) => {
      if (message.hostId !== this.hostId) return
      this.connectionState = { state: 'failed', error: message.errorMessage }
      for (const listener of this.connectionListeners) listener(this.connectionState)
    })
  }

  request<T = unknown>(
    method: string,
    params?: unknown,
    options?: { priority?: AppServerRequestPriority }
  ): Promise<T> {
    this.start()
    const id: RpcId = this.nextId++
    const request: RpcRequest = { jsonrpc: '2.0', id, method, params }
    const priority = requestPriorityFor(method, options?.priority)
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        method,
        resolve: (value) => resolve(value as T),
        reject
      })
      this.queues[priority].push({ request, priority })
      this.pump()
    })
  }

  /**
   * 放弃一个仍在排队的请求。
   * Codex 有 `mcp-request-abandon`：会话切走后那批列表查询没人要了，
   * 继续排着只会挤占后面真正需要的请求。
   */
  abandon(id: RpcId): void {
    for (const priority of Object.keys(this.queues) as AppServerRequestPriority[]) {
      const index = this.queues[priority].findIndex((item) => item.request.id === id)
      if (index >= 0) {
        this.queues[priority].splice(index, 1)
        this.pending.delete(id)
        return
      }
    }
    if (!this.pending.has(id)) return
    this.pending.delete(id)
    postMessageFromView({ type: 'mcp-request-abandon', hostId: this.hostId, id })
  }

  private pump(): void {
    for (const priority of ['critical', 'interactive', 'background'] as const) {
      const limit = REQUEST_CONCURRENCY[priority]
      while (this.inFlight[priority] < limit && this.queues[priority].length > 0) {
        const item = this.queues[priority].shift() as QueuedRequest
        this.inFlight[priority] += 1
        this.priorityById.set(item.request.id, priority)
        postMessageFromView({
          type: 'mcp-request',
          hostId: this.hostId,
          request: item.request,
          priority
        })
      }
    }
  }

  private settleSlot(id: RpcId): void {
    const priority = this.priorityById.get(id)
    if (priority == null) return
    this.priorityById.delete(id)
    this.inFlight[priority] = Math.max(0, this.inFlight[priority] - 1)
    this.pump()
  }

  private async handleServerRequest(request: RpcRequest): Promise<void> {
    const handler = this.serverRequestHandlers.get(request.method)
    if (handler == null) {
      /*
       * 未注册的反向请求要**明确回错**而不是不回。
       * 对审批类请求来说"不回"等于让 agent 永远停在那一步，
       * 表现为任务卡住；回 MethodNotFound 至少让它继续往下走。
       */
      postMessageFromView({
        type: 'mcp-response',
        hostId: this.hostId,
        message: makeError(
          request.id,
          RpcErrorCode.MethodNotFound,
          `No handler for ${request.method}`
        )
      })
      return
    }
    try {
      const result = await handler(request.params)
      postMessageFromView({
        type: 'mcp-response',
        hostId: this.hostId,
        message: makeSuccess(request.id, result ?? null)
      })
    } catch (error) {
      postMessageFromView({
        type: 'mcp-response',
        hostId: this.hostId,
        message: makeError(
          request.id,
          RpcErrorCode.InternalError,
          error instanceof Error ? error.message : String(error)
        )
      })
    }
  }

  onNotification(method: string, listener: (params: unknown) => void): () => void {
    this.start()
    const listeners = this.notificationListeners.get(method) ?? new Set<NotificationListener>()
    this.notificationListeners.set(method, listeners)
    const wrapped: NotificationListener = (params) => listener(params)
    listeners.add(wrapped)
    return () => {
      listeners.delete(wrapped)
      if (listeners.size === 0) this.notificationListeners.delete(method)
    }
  }

  onAnyNotification(listener: NotificationListener): () => void {
    this.start()
    this.anyNotificationListeners.add(listener)
    return () => {
      this.anyNotificationListeners.delete(listener)
    }
  }

  onServerRequest(method: string, handler: ServerRequestHandler): () => void {
    this.start()
    this.serverRequestHandlers.set(method, handler)
    return () => {
      if (this.serverRequestHandlers.get(method) === handler) {
        this.serverRequestHandlers.delete(method)
      }
    }
  }

  getConnectionState(): AppServerConnectionState {
    this.start()
    return this.connectionState
  }

  onConnectionStateChanged(listener: (state: AppServerConnectionState) => void): () => void {
    this.start()
    this.connectionListeners.add(listener)
    return () => {
      this.connectionListeners.delete(listener)
    }
  }
}

export const appServer = new AppServerClient()

/*
 * 开发期把客户端挂到 window 上：协议请求是整条管线的主干（宿主信封 → 分块
 * 流式 → app-server），在 DevTools/CDP 里能直接打一发请求，排查时省掉一整轮
 * 「改代码加日志再重启」。
 */
if (import.meta.env.DEV) {
  ;(window as unknown as { __appServer?: unknown }).__appServer = appServer
}
