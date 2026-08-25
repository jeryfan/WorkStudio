/**
 * worker 总线的报文形状 —— Codex `P9`(worker-bus-message-handler) 与 worker 侧
 * 逐字取证得到。三种类型，一个都不能改名：渲染层、主进程、worker 三方都按
 * 这张表分发。
 *
 *   宿主/渲染层 → worker   `{type:'worker-request', workerId, request}`
 *                          `{type:'worker-request-cancel', workerId, id}`
 *   worker → 宿主/渲染层   `{type:'worker-response', workerId, response}`
 *                          `{type:<事件类型>, workerId, event}`
 *
 * `response.method` 必须回填请求里的 method：Codex 在收到回复时会比对
 * `pending.method !== response.method` 并直接 reject —— 这道检查能挡住"回错了
 * 一个请求的结果"这类最难查的错误。
 */

export type WorkerId = 'git'

export interface WorkerRequest {
  id: string
  method: string
  params?: unknown
  /** Codex 用它算排队时间（worker 忙的时候这个差值就是排队延迟） */
  enqueuedAtMs: number
}

export type WorkerResult =
  { type: 'ok'; value: unknown } | { type: 'error'; error: { message: string } }

export interface WorkerResponse {
  id: string
  method: string
  result: WorkerResult
}

export interface WorkerRequestMessage {
  type: 'worker-request'
  workerId: WorkerId
  request: WorkerRequest
}

export interface WorkerRequestCancelMessage {
  type: 'worker-request-cancel'
  workerId: WorkerId
  id: string
}

export interface WorkerResponseMessage {
  type: 'worker-response'
  workerId: WorkerId
  response: WorkerResponse
}

export interface WorkerEventMessage {
  type: 'worker-event'
  workerId: WorkerId
  event: { type: string } & Record<string, unknown>
}

/** 进 worker 的 */
export type WorkerInboundMessage = WorkerRequestMessage | WorkerRequestCancelMessage
/** 出 worker 的 */
export type WorkerOutboundMessage = WorkerResponseMessage | WorkerEventMessage

export function isWorkerRequestMessage(value: unknown): value is WorkerRequestMessage {
  const message = value as WorkerRequestMessage | null
  return message?.type === 'worker-request' && typeof message.request?.id === 'string'
}

export function isWorkerRequestCancelMessage(value: unknown): value is WorkerRequestCancelMessage {
  const message = value as WorkerRequestCancelMessage | null
  return message?.type === 'worker-request-cancel' && typeof message.id === 'string'
}
