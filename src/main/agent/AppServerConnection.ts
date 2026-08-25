import {
  RpcErrorCode,
  isRpcErrorResponse,
  makeError,
  makeSuccess,
  type RpcId,
  type RpcRequest,
  type RpcResponse
} from '@shared/rpc/messages'
import { LOCAL_HOST_ID, type HostId, type HostMessage } from '@shared/host/messages'
import { CRITICAL_REQUEST_METHODS } from '@shared/host/messages'
import { SUBSCRIBED_NOTIFICATIONS } from '@shared/protocol/notifications'
import { SERVER_REQUEST } from '@shared/protocol/methods'
import { RpcRequestError } from '@shared/rpc/peer'
import type { WebviewWindow } from '../host/WebviewWindow'
import type { ProtocolClient } from './ProtocolClient'

/**
 * app-server 连接在宿主侧的门面。
 *
 * 取证：Codex 的 `AppServerConnection`（`src-Cz_uUmVl.js`）。三条与本项目原实现
 * 不同、但必须照搬的设计：
 *
 * 1. **协议报文骑在宿主消息信封上**，不另开 IPC 通道：
 *      渲染 → 宿主：`mcp-request` / `mcp-response` / `mcp-request-abandon`
 *      宿主 → 渲染：`mcp-request`（服务端反向请求）/ `mcp-response` / `mcp-notification`
 *    这样它天然获得分块流式与 critical 通道 —— `thread/read` 的巨大结果不会
 *    一次性反序列化卡住渲染进程。
 *
 * 2. **每条消息都带 hostId**。Codex 同时连本地 + ssh/wsl/remote-control 多个
 *    app-server，渲染层靠 hostId 区分。本项目当前只有本地一条，但字段保留：
 *    否则将来加远端就得改所有消息形状。
 *
 * 3. **连接状态是快照 + 增量**。新窗口注册时立刻收到一份 `isSnapshot: true`
 *    的状态，不需要自己发起一次"查询状态"请求。
 */

export interface AgentConnectionState {
  state: 'starting' | 'ready' | 'failed'
  version?: string
  error?: string
  hint?: string
}

interface PendingServerRequest {
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

export interface AppServerConnectionHooks {
  /**
   * thread/start 时要合并进 `params.config` 的配置覆盖。
   *
   * Codex 的桌面端就是这么做的（`BrowserUseThreadConfig`）：渲染层只管发
   * `thread/start`，宿主在转发时把 code-mode 沙箱需要的环境变量与工具说明
   * 以 `shell_environment_policy.set.<VAR>` 这类扁平点号键塞进 config。
   * 放在宿主侧的理由是这些值只有宿主知道（版本、build flavor、可用后端）。
   */
  threadStartConfig?(): Record<string, unknown>
  /**
   * turn/started 时的准备（Codex 的 `ensureBackendForSession`）。
   *
   * 挂在 turn/started 而不是 thread/start：thread/start 返回前还没有 threadId，
   * 而 browser_use 的后端是**按会话**起的，没有 id 就没法起。
   */
  turnStarted?(conversationId: string): Promise<void>
  /** turn/completed 时的回收（Codex `dispatchTurnEnded`） */
  turnEnded?(conversationId: string, turnId: string): Promise<void>
}

export class AppServerConnection {
  private readonly targets = new Set<WebviewWindow>()
  private readonly pendingServerRequests = new Map<RpcId, PendingServerRequest>()
  /** 渲染层已放弃的请求 id：结果回来后直接丢弃 */
  private readonly abandoned = new Set<string>()
  private connectionState: AgentConnectionState = { state: 'starting' }
  private readonly connectionStateListeners = new Set<(state: AgentConnectionState) => void>()
  private disposers: Array<() => void> = []
  private serverRequestSeq = 0

  constructor(
    private readonly client: ProtocolClient,
    readonly hostId: HostId = LOCAL_HOST_ID,
    private hooks: AppServerConnectionHooks = {}
  ) {}

  setHooks(hooks: AppServerConnectionHooks): void {
    this.hooks = hooks
  }

  start(): void {
    /*
     * 通知 → 广播。退订清单已在握手时下发给服务端，这里的过滤是第二道防线：
     * 协议升级后新增的通知在策略表里表态之前不会泄漏到渲染层。
     */
    this.disposers.push(
      this.client.onNotification((method, params) => {
        if (!SUBSCRIBED_NOTIFICATIONS.has(method)) return
        // 先让宿主自己处理（回收 browser_use 接管态），再广播给渲染层
        if (method === 'turn/started') this.handleTurnStarted(params)
        if (method === 'turn/completed') this.handleTurnCompleted(params)
        this.broadcast({ type: 'mcp-notification', hostId: this.hostId, method, params })
      })
    )

    // 反向请求 → 转给渲染层应答
    for (const method of Object.values(SERVER_REQUEST)) {
      this.disposers.push(
        this.client.onServerRequest(method, (params) => this.forwardServerRequest(method, params))
      )
    }
  }

  dispose(): void {
    for (const dispose of this.disposers) dispose()
    this.disposers = []
    for (const [, pending] of this.pendingServerRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Connection disposed'))
    }
    this.pendingServerRequests.clear()
  }

  // ── 渲染目标注册 ────────────────────────────────────────────────
  registerWebviewWindow(target: WebviewWindow): void {
    this.targets.add(target)
    const subscription = target.onDestroyed(() => {
      subscription.dispose()
      this.targets.delete(target)
    })
    this.sendConnectionStateSnapshot(target)
  }

  private sendConnectionStateSnapshot(target: WebviewWindow): void {
    target.send({
      type: 'codex-app-server-connection-state',
      hostId: this.hostId,
      isSnapshot: true,
      ...this.connectionState
    })
  }

  setConnectionState(state: AgentConnectionState): void {
    this.connectionState = state
    this.broadcast({ type: 'codex-app-server-connection-state', hostId: this.hostId, ...state })
    for (const listener of this.connectionStateListeners) listener(state)
  }

  /**
   * 宿主内部订阅连接状态。
   *
   * 与广播给渲染层的那份是同一个信号源，方向不同：这条是给主进程自己用的
   * （设置 store 要在连接 ready 之后才能读写 config）。agent 重启会再来一次
   * `ready`，订阅者按"重新对齐"处理，不能假设只触发一次。
   */
  onConnectionStateChanged(listener: (state: AgentConnectionState) => void): () => void {
    this.connectionStateListeners.add(listener)
    return () => {
      this.connectionStateListeners.delete(listener)
    }
  }

  getConnectionState(): AgentConnectionState {
    return this.connectionState
  }

  reportFatalError(errorMessage: string): void {
    this.broadcast({ type: 'codex-app-server-fatal-error', hostId: this.hostId, errorMessage })
  }

  // ── 渲染层 → app-server ─────────────────────────────────────────
  /**
   * 主进程用自己的 id 重新发起请求，只把结果按渲染层的 id 送回去。
   * 好处是多个窗口的 id 空间彼此隔离，渲染层可以随便用自增数字。
   */
  async handleClientRequest(target: WebviewWindow, request: RpcRequest): Promise<void> {
    const abandonKey = this.abandonKey(target, request.id)
    let response: RpcResponse
    try {
      const params =
        request.method === 'thread/start'
          ? this.augmentThreadStartParams(request.params)
          : request.params
      const result = await this.client.request(request.method, params)
      response = makeSuccess(request.id, result ?? null)
    } catch (error) {
      const code = error instanceof RpcRequestError ? error.code : RpcErrorCode.InternalError
      const message = error instanceof Error ? error.message : String(error)
      response = makeError(request.id, code, message)
    }
    if (this.abandoned.delete(abandonKey)) return
    if (target.isDestroyed()) return
    const message: HostMessage = {
      type: 'mcp-response',
      hostId: this.hostId,
      message: response,
      requestMethod: request.method,
      receivedAtMs: Date.now()
    }
    // 关键路径上的响应不排在几 MB 的历史读取后面
    if (CRITICAL_REQUEST_METHODS.has(request.method)) target.sendCritical(message)
    else target.send(message)
  }

  /**
   * 给 thread/start 补上宿主侧的配置覆盖。
   *
   * 只加不覆盖渲染层已给的键：渲染层可能为了调试显式设过同名配置，
   * 悄悄改掉它会让"我明明设了却没生效"变成一个查不出来的问题。
   */
  private augmentThreadStartParams(params: unknown): unknown {
    const extra = this.hooks.threadStartConfig?.()
    if (extra == null || Object.keys(extra).length === 0) return params
    const base = (params ?? {}) as Record<string, unknown>
    const config = (base.config ?? {}) as Record<string, unknown>
    const merged: Record<string, unknown> = { ...extra }
    for (const [key, value] of Object.entries(config)) merged[key] = value
    return { ...base, config: merged }
  }

  private handleTurnStarted(params: unknown): void {
    const conversationId = (params as { threadId?: string } | null)?.threadId
    if (typeof conversationId !== 'string') return
    void this.hooks.turnStarted?.(conversationId).catch((error: unknown) => {
      console.warn('[agent] turnStarted hook failed', error)
    })
  }

  private handleTurnCompleted(params: unknown): void {
    const payload = params as { threadId?: string; turn?: { id?: string } } | null
    const conversationId = payload?.threadId
    const turnId = payload?.turn?.id
    if (typeof conversationId !== 'string' || typeof turnId !== 'string') return
    void this.hooks.turnEnded?.(conversationId, turnId).catch((error: unknown) => {
      console.warn('[agent] turnEnded hook failed', error)
    })
  }

  /** 渲染层对反向请求的应答 */
  handleClientResponse(response: RpcResponse): void {
    const pending = this.pendingServerRequests.get(response.id)
    if (!pending) return
    this.pendingServerRequests.delete(response.id)
    clearTimeout(pending.timer)
    if (isRpcErrorResponse(response)) {
      pending.reject(
        new RpcRequestError(response.error.code, response.error.message, response.error.data)
      )
      return
    }
    pending.resolve(response.result)
  }

  abandonRequest(target: WebviewWindow, id: RpcId): void {
    this.abandoned.add(this.abandonKey(target, id))
  }

  notify(method: string, params?: unknown): void {
    this.client.notify(method, params)
  }

  private abandonKey(target: WebviewWindow, id: RpcId): string {
    return `${target.id}:${String(id)}`
  }

  // ── app-server → 渲染层 ─────────────────────────────────────────
  /**
   * 反向请求广播给所有渲染目标，先应答的赢。
   *
   * 没有目标可应答时立即失败而不是挂起：挂起会让 agent 永远停在那一步，
   * 表现为"任务卡住不动"，很难排查。
   */
  private forwardServerRequest(method: string, params: unknown): Promise<unknown> {
    const targets = Array.from(this.targets).filter((target) => !target.isDestroyed())
    if (targets.length === 0) {
      return Promise.reject(
        new RpcRequestError(RpcErrorCode.ServerError, 'No window available to handle the request')
      )
    }

    const id: RpcId = `srv:${method}:${Date.now().toString(36)}-${++this.serverRequestSeq}`
    const request: RpcRequest = { jsonrpc: '2.0', id, method, params }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingServerRequests.delete(id)
        reject(new RpcRequestError(RpcErrorCode.ServerError, `Request timed out: ${method}`))
      }, SERVER_REQUEST_TIMEOUT_MS)
      this.pendingServerRequests.set(id, { resolve, reject, timer })
      for (const target of targets) {
        target.sendCritical({ type: 'mcp-request', hostId: this.hostId, request })
      }
    })
  }

  private broadcast(message: HostMessage): void {
    for (const target of this.targets) {
      if (!target.isDestroyed()) target.send(message)
    }
  }
}
