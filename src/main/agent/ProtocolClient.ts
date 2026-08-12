import { RpcPeer, type RpcTransport, type RequestHandler } from '@shared/rpc/peer'
import { M } from '@shared/protocol/methods'
import { OPT_OUT_NOTIFICATIONS } from '@shared/protocol/notifications'
import type { InitializeResponse } from '@shared/protocol/entities'

/**
 * 握手请求使用固定字符串 id。JSON-RPC 允许字符串 id，用固定值便于在日志与
 * 抓包里一眼认出握手，也避免它和业务请求共用计数器。
 */
const INITIALIZE_ID = '__workstudio_initialize__'

export interface ProtocolClientConfig {
  clientName: string
  clientTitle: string
  clientVersion: string
}

export type NotificationListener = (method: string, params: unknown) => void

/**
 * agent 协议客户端。
 *
 * 只依赖 RpcTransport，不引用 Electron —— 因此既能在主进程内直接实例化，
 * 也能整体搬进 worker 线程而不动业务代码。
 */
export class ProtocolClient {
  private readonly peer: RpcPeer
  private handshake: Promise<InitializeResponse> | null = null
  private environment: InitializeResponse | null = null

  constructor(
    transport: RpcTransport,
    private readonly config: ProtocolClientConfig,
    options: { onDiagnostic?: (msg: string, detail?: unknown) => void } = {}
  ) {
    this.peer = new RpcPeer(transport, { onDiagnostic: options.onDiagnostic })
  }

  /**
   * 执行握手。必须在任何业务请求之前完成，否则服务端会拒绝。
   *
   * 重复调用返回同一个 Promise，多个调用方可以各自 await 而不会重复握手。
   */
  initialize(): Promise<InitializeResponse> {
    if (this.handshake) return this.handshake

    this.handshake = (async () => {
      const result = await this.peer.request<InitializeResponse>(
        M.initialize,
        {
          clientInfo: {
            name: this.config.clientName,
            title: this.config.clientTitle,
            version: this.config.clientVersion
          },
          capabilities: {
            // 服务端据此开放实验方法与字段；不声明会导致部分方法直接被拒
            experimentalApi: true,
            requestAttestation: false,
            // 主动退订不消费的高频通知，显著降低进程间传输量
            optOutNotificationMethods: OPT_OUT_NOTIFICATIONS
          }
        },
        INITIALIZE_ID
      )

      // 握手完成的通知必须在 result 之后发出，顺序颠倒服务端不认
      this.peer.notify(M.initialized, {})
      this.environment = result
      return result
    })()

    // 握手失败时清掉缓存，让重连后能重试
    this.handshake.catch(() => {
      this.handshake = null
    })
    return this.handshake
  }

  /** 进程重启后重放握手 */
  resetForReconnect(): void {
    this.handshake = null
    this.environment = null
    this.peer.reopen()
  }

  /** 握手返回的运行环境信息（数据目录、平台），未握手时为 null */
  get env(): InitializeResponse | null {
    return this.environment
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    await this.initialize()
    return this.peer.request<T>(method, params)
  }

  notify(method: string, params?: unknown): void {
    this.peer.notify(method, params)
  }

  /** 订阅全部通知；转发层用它把事件送到渲染进程 */
  onNotification(listener: NotificationListener): () => void {
    return this.peer.onAnyNotification((params, method) => listener(method, params))
  }

  /**
   * 注册服务端反向请求处理器（审批、工具调用等）。
   * 未注册的反向请求会被回 MethodNotFound —— 对审批类请求而言这等同于
   * 拒绝，agent 会继续往下走而不是挂起。
   */
  onServerRequest(method: string, handler: RequestHandler): () => void {
    return this.peer.onRequest(method, handler)
  }

  close(reason?: string): void {
    this.peer.close(reason)
    this.handshake = null
    this.environment = null
  }
}
