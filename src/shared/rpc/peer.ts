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
  type RpcMessage,
  type RpcRequest
} from './messages'

/**
 * 传输通道抽象。RpcPeer 不关心底下是 stdio、Electron IPC 还是 MessagePort，
 * 只要能收发已解析的报文对象即可。这是协议客户端可以在主线程与 worker
 * 之间搬家而不改业务代码的原因。
 */
export interface RpcTransport {
  send(message: RpcMessage): void
  onMessage(handler: (message: RpcMessage) => void): void
  onClose?(handler: (reason?: string) => void): void
}

/** 处理对端发起的请求；返回值作为 result 回给对端 */
export type RequestHandler = (params: unknown, method: string) => unknown | Promise<unknown>
export type NotificationHandler = (params: unknown, method: string) => void

export interface RpcPeerOptions {
  /** 未注册处理器的对端请求如何处理。默认回 MethodNotFound */
  fallbackRequestHandler?: RequestHandler
  /** 收到无法解析或无人认领的报文时调用，用于诊断 */
  onDiagnostic?: (message: string, detail?: unknown) => void
}

interface Pending {
  resolve(value: unknown): void
  reject(error: Error): void
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

/**
 * 双向 JSON-RPC 端点。
 *
 * 两个 id 空间是分开的：`pending` 存本端发出、等待对端响应的请求；
 * 对端发来的请求 id 直接原样回填，不进本端计数器。共用一个计数器会在
 * 双方恰好用到同一个数字时串台。
 */
export class RpcPeer {
  private nextId = 1
  private readonly pending = new Map<RpcId, Pending>()
  private readonly requestHandlers = new Map<string, RequestHandler>()
  private readonly notificationHandlers = new Map<string, NotificationHandler>()
  private readonly anyNotificationHandlers = new Set<NotificationHandler>()
  private closed = false

  constructor(
    private readonly transport: RpcTransport,
    private readonly options: RpcPeerOptions = {}
  ) {
    transport.onMessage((msg) => this.dispatch(msg))
    transport.onClose?.((reason) => this.close(reason))
  }

  /** 发起请求并等待响应 */
  request<T = unknown>(method: string, params?: unknown, id?: RpcId): Promise<T> {
    if (this.closed) {
      return Promise.reject(new RpcRequestError(RpcErrorCode.ConnectionClosed, 'Connection closed'))
    }
    const requestId = id ?? this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject })
      try {
        this.transport.send(makeRequest(requestId, method, params))
      } catch (err) {
        this.pending.delete(requestId)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  notify(method: string, params?: unknown): void {
    if (this.closed) return
    this.transport.send(makeNotification(method, params))
  }

  /** 注册对端请求的处理器（如审批、attestation） */
  onRequest(method: string, handler: RequestHandler): () => void {
    this.requestHandlers.set(method, handler)
    return () => this.requestHandlers.delete(method)
  }

  onNotification(method: string, handler: NotificationHandler): () => void {
    this.notificationHandlers.set(method, handler)
    return () => this.notificationHandlers.delete(method)
  }

  /** 订阅全部通知。事件转发层用这个，避免逐个方法注册 */
  onAnyNotification(handler: NotificationHandler): () => void {
    this.anyNotificationHandlers.add(handler)
    return () => this.anyNotificationHandlers.delete(handler)
  }

  /** 连接断开：所有在途请求必须落地，否则调用方永远挂着 */
  close(reason?: string): void {
    if (this.closed) return
    this.closed = true
    const err = new RpcRequestError(
      RpcErrorCode.ConnectionClosed,
      reason ? `Connection closed: ${reason}` : 'Connection closed'
    )
    for (const [, p] of this.pending) p.reject(err)
    this.pending.clear()
  }

  /** 重连后复用同一个 peer 实例 */
  reopen(): void {
    this.closed = false
  }

  get isClosed(): boolean {
    return this.closed
  }

  private dispatch(msg: RpcMessage): void {
    if (isRpcResponse(msg)) {
      const pending = this.pending.get(msg.id)
      if (!pending) {
        this.options.onDiagnostic?.('Response for unknown request id', msg.id)
        return
      }
      this.pending.delete(msg.id)
      if (isRpcErrorResponse(msg)) {
        pending.reject(new RpcRequestError(msg.error.code, msg.error.message, msg.error.data))
      } else {
        pending.resolve(msg.result)
      }
      return
    }

    if (isRpcRequest(msg)) {
      void this.handleInboundRequest(msg)
      return
    }

    if (isRpcNotification(msg)) {
      this.notificationHandlers.get(msg.method)?.(msg.params, msg.method)
      for (const h of this.anyNotificationHandlers) h(msg.params, msg.method)
      return
    }

    this.options.onDiagnostic?.('Unrecognized message', msg)
  }

  private async handleInboundRequest(msg: RpcRequest): Promise<void> {
    const handler = this.requestHandlers.get(msg.method) ?? this.options.fallbackRequestHandler
    if (!handler) {
      this.transport.send(
        makeError(msg.id, RpcErrorCode.MethodNotFound, `Method not found: ${msg.method}`)
      )
      return
    }
    try {
      const result = await handler(msg.params, msg.method)
      this.transport.send(makeSuccess(msg.id, result ?? null))
    } catch (err) {
      const code = err instanceof RpcRequestError ? err.code : RpcErrorCode.InternalError
      const message = err instanceof Error ? err.message : String(err)
      this.transport.send(makeError(msg.id, code, message))
    }
  }
}
