/**
 * 渲染进程 ↔ 主进程的 RPC 通道名。
 *
 * 渲染层只用这一组通道收发 JSON-RPC 报文，不为每个功能新开 ipcMain.handle。
 * 新增方法不需要动 preload 与通道定义。
 */
export const RPC_CHANNEL = {
  /** 渲染 → 主：请求、通知、以及对反向请求的应答 */
  fromView: 'workstudio:rpc:from-view',
  /** 主 → 渲染：响应、通知、反向请求 */
  toView: 'workstudio:rpc:to-view',
  /** 首屏同步快照（sendSync），仅用于消除首帧闪烁 */
  bootstrap: 'workstudio:bootstrap'
} as const

/** agent 运行时不可用时，渲染层据此展示明确的错误而不是空白界面 */
export interface AgentRuntimeStatus {
  state: 'starting' | 'ready' | 'failed'
  version?: string
  error?: string
  hint?: string
}
