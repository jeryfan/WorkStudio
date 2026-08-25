import type { WorkerId, WorkerOutboundMessage } from '@shared/host/worker'

/**
 * worker 总线的渲染层客户端。
 *
 * 取证：Codex 的渲染层通过 preload 的 `sendWorkerMessageFromView` /
 * `subscribeToWorkerMessages` 与 worker 通话，报文形状见 `@shared/host/worker`。
 *
 * 这里只做三件事：发请求、按 id 认领回复、超时/中断时把 pending 收掉。
 * 不做重试 —— git 的写操作（checkout）不是幂等的，自动重试会切两次分支。
 */

type Pending = { method: string; resolve(value: unknown): void; reject(error: Error): void }

const pendingByWorker = new Map<WorkerId, Map<string, Pending>>()
const subscribed = new Set<WorkerId>()

function pendingFor(workerId: WorkerId): Map<string, Pending> {
  const existing = pendingByWorker.get(workerId)
  if (existing != null) return existing
  const created = new Map<string, Pending>()
  pendingByWorker.set(workerId, created)
  return created
}

/**
 * 第一次用到某个 worker 时挂订阅。
 *
 * 挂在这里而不是模块顶层：订阅会在主进程侧注册 IPC 监听，没人用 git 的时候
 * 不该有这条链路存在。
 */
function ensureSubscribed(workerId: WorkerId): void {
  if (subscribed.has(workerId)) return
  const bridge = window.electronBridge
  if (bridge?.subscribeToWorkerMessages == null) return
  subscribed.add(workerId)
  bridge.subscribeToWorkerMessages(workerId, (raw: unknown) => {
    const message = raw as WorkerOutboundMessage | null
    if (message?.type !== 'worker-response') return
    const pending = pendingFor(workerId)
    const entry = pending.get(message.response.id)
    if (entry == null) return
    pending.delete(message.response.id)
    if (message.response.result.type === 'ok') {
      entry.resolve(message.response.result.value)
      return
    }
    entry.reject(new Error(message.response.result.error.message))
  })
}

let nextId = 0

/** 发一条请求给 worker，等它的 `worker-response` */
export function requestWorker<T>(workerId: WorkerId, method: string, params?: unknown): Promise<T> {
  const bridge = window.electronBridge
  if (bridge?.sendWorkerMessageFromView == null) {
    return Promise.reject(new Error('Worker bus is unavailable outside the Electron host'))
  }
  ensureSubscribed(workerId)
  const id = `view-${++nextId}`
  const pending = pendingFor(workerId)
  const promise = new Promise<T>((resolve, reject) => {
    pending.set(id, { method, resolve: resolve as (value: unknown) => void, reject })
  })
  void bridge
    .sendWorkerMessageFromView(workerId, {
      type: 'worker-request',
      workerId,
      request: { id, method, params, enqueuedAtMs: Date.now() }
    })
    .catch((error: unknown) => {
      pending.delete(id)
      throw error instanceof Error ? error : new Error(String(error))
    })
  return promise
}
