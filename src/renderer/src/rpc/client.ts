import { appServer, type AppServerConnectionState } from '../host/appServer'
import type { AppServerRequestPriority } from '@shared/host/messages'

/**
 * 渲染层的 app-server 入口。
 *
 * 传输层已经换成宿主消息信封（`mcp-request` / `mcp-response` / `mcp-notification`，
 * 见 `host/appServer.ts`），与 Codex 一致；这里保留 `rpc` 这个门面是因为业务代码
 * 只关心"发一个协议请求"，不关心它骑在哪条通道上。
 */
export const rpc = {
  request: <T = unknown>(
    method: string,
    params?: unknown,
    options?: { priority?: AppServerRequestPriority }
  ): Promise<T> => appServer.request<T>(method, params, options),

  /** 订阅单个通知 */
  on: (method: string, handler: (params: unknown) => void): (() => void) =>
    appServer.onNotification(method, handler),

  /** 订阅全部通知；会话事件流用它，避免逐个方法注册 */
  onAny: (handler: (method: string, params: unknown) => void): (() => void) =>
    appServer.onAnyNotification((params, method) => handler(method, params)),

  /**
   * 注册服务端反向请求处理器（审批、工具提问）。
   * 返回值即应答内容；抛错则回错误响应。未注册的反向请求会被自动回
   * MethodNotFound，agent 会继续往下走而不是挂起。
   */
  onServerRequest: (
    method: string,
    handler: (params: unknown) => unknown | Promise<unknown>
  ): (() => void) => appServer.onServerRequest(method, handler)
}

/** agent 连接状态：启动期用于区分"还在起"与"起不来" */
export function getConnectionState(): AppServerConnectionState {
  return appServer.getConnectionState()
}

export function onConnectionStateChanged(
  handler: (state: AppServerConnectionState) => void
): () => void {
  return appServer.onConnectionStateChanged(handler)
}
