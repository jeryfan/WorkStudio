/**
 * JSON-RPC 2.0 报文类型与类型守卫。
 *
 * 协议是双向的：两端都可以发起请求。因此"请求"与"响应"没有方向性，
 * 判断一条报文该走哪条处理路径只看结构：
 *   有 method 有 id  → 请求（需要应答）
 *   有 method 无 id  → 通知（不应答）
 *   无 method 有 id  → 响应（result 或 error 二选一）
 */

export const JSONRPC_VERSION = '2.0'

/** 规范允许 string | number；握手用固定字符串 id 便于日志定位 */
export type RpcId = string | number

export interface RpcRequest {
  jsonrpc: typeof JSONRPC_VERSION
  id: RpcId
  method: string
  params?: unknown
}

export interface RpcNotification {
  jsonrpc: typeof JSONRPC_VERSION
  /**
   * 通知没有 id。显式声明为 undefined 而不是省略：省略时 RpcRequest 在结构上
   * 可赋值给 RpcNotification，类型守卫的取反分支会把两者一起排除掉。
   */
  id?: undefined
  method: string
  params?: unknown
}

export interface RpcError {
  code: number
  message: string
  data?: unknown
}

export interface RpcSuccessResponse {
  jsonrpc: typeof JSONRPC_VERSION
  id: RpcId
  result: unknown
}

export interface RpcErrorResponse {
  jsonrpc: typeof JSONRPC_VERSION
  id: RpcId
  error: RpcError
}

export type RpcResponse = RpcSuccessResponse | RpcErrorResponse
export type RpcMessage = RpcRequest | RpcNotification | RpcResponse

/** 规范保留段 */
export const RpcErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  /** -32000 起为实现自定义段 */
  ServerError: -32000,
  /** 对端断开导致在途请求无法完成 */
  ConnectionClosed: -32001,
  /** 本端主动放弃等待 */
  RequestCancelled: -32002
} as const

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * 对端可能发来任意内容，所有守卫都必须能安全处理非法输入。
 * 这里不校验 jsonrpc 字段值——上游实现省略该字段的情况是存在的，
 * 严格校验会直接断连；按结构判别更稳。
 */
export function isRpcRequest(msg: unknown): msg is RpcRequest {
  return isObject(msg) && typeof msg.method === 'string' && isValidId(msg.id)
}

export function isRpcNotification(msg: unknown): msg is RpcNotification {
  return isObject(msg) && typeof msg.method === 'string' && msg.id === undefined
}

export function isRpcResponse(msg: unknown): msg is RpcResponse {
  if (!isObject(msg) || msg.method !== undefined || !isValidId(msg.id)) return false
  return 'result' in msg || isRpcErrorShape(msg.error)
}

export function isRpcErrorResponse(msg: RpcResponse): msg is RpcErrorResponse {
  return isRpcErrorShape((msg as RpcErrorResponse).error)
}

function isValidId(id: unknown): id is RpcId {
  return typeof id === 'string' || typeof id === 'number'
}

function isRpcErrorShape(err: unknown): err is RpcError {
  return isObject(err) && typeof err.code === 'number' && typeof err.message === 'string'
}

export function makeRequest(id: RpcId, method: string, params?: unknown): RpcRequest {
  return { jsonrpc: JSONRPC_VERSION, id, method, ...(params === undefined ? {} : { params }) }
}

export function makeNotification(method: string, params?: unknown): RpcNotification {
  return { jsonrpc: JSONRPC_VERSION, method, ...(params === undefined ? {} : { params }) }
}

export function makeSuccess(id: RpcId, result: unknown): RpcSuccessResponse {
  return { jsonrpc: JSONRPC_VERSION, id, result }
}

export function makeError(
  id: RpcId,
  code: number,
  message: string,
  data?: unknown
): RpcErrorResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) }
  }
}
