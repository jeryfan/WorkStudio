import { RpcPeer, type RpcTransport } from '@shared/rpc/peer'
import type { RpcMessage } from '@shared/rpc/messages'
import { LOCAL } from '@shared/protocol/local'
import type { AgentRuntimeStatus } from '@shared/rpc/channels'

/**
 * 渲染层的 RPC 端点。
 *
 * 与主进程之间是同一套 JSON-RPC 语义：调用方不需要知道某个方法是主进程
 * 本地实现的还是转发给 agent 的。
 */
class BridgeTransport implements RpcTransport {
  send(message: RpcMessage): void {
    window.rpcBridge.send(message)
  }
  onMessage(handler: (message: RpcMessage) => void): void {
    window.rpcBridge.subscribe(handler)
  }
}

const peer = new RpcPeer(new BridgeTransport(), {
  onDiagnostic: (msg, detail) => console.warn('[rpc]', msg, detail ?? '')
})

export const rpc = {
  request: <T = unknown>(method: string, params?: unknown): Promise<T> =>
    peer.request<T>(method, params),

  notify: (method: string, params?: unknown): void => peer.notify(method, params),

  /** 订阅单个通知 */
  on: (method: string, handler: (params: unknown) => void): (() => void) =>
    peer.onNotification(method, handler),

  /** 订阅全部通知；会话事件流用它，避免逐个方法注册 */
  onAny: (handler: (method: string, params: unknown) => void): (() => void) =>
    peer.onAnyNotification((params, method) => handler(method, params)),

  /**
   * 注册服务端反向请求处理器（审批、工具提问）。
   * 返回值即应答内容；抛错则回错误响应。未注册的反向请求会被自动回
   * MethodNotFound，agent 会继续往下走而不是挂起。
   */
  onServerRequest: (
    method: string,
    handler: (params: unknown) => unknown | Promise<unknown>
  ): (() => void) => peer.onRequest(method, (params) => handler(params))
}

/** agent 运行时状态：启动期用于区分"还在起"与"起不来" */
export function getAgentStatus(): Promise<AgentRuntimeStatus> {
  return rpc.request<AgentRuntimeStatus>(LOCAL.agentStatus)
}

export function onAgentStatusChanged(handler: (status: AgentRuntimeStatus) => void): () => void {
  return rpc.on('app/agent/statusChanged', (params) => handler(params as AgentRuntimeStatus))
}
