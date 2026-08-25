import type { HostMessage } from '@shared/host/messages'

/**
 * shared object 仓库。
 *
 * 取证：Codex 的 `sharedObjectRepository`，配 `get-shared-object-snapshot`（sendSync
 * 首屏快照）、`shared-object-set`（渲染层写）、`shared-object-updated`（主进程推）。
 *
 * 它解决的是"一小坨需要跨窗口一致、且首帧就要有的状态"：主题偏好、侧栏折叠、
 * chronicle 配置这类。为它们各自定义一条 IPC 消息不划算 —— 一个 key/value 仓库
 * 加一条推送就够，而且新增 key 不需要动任何管线代码。
 *
 * 注意它**不是**通用状态库：值必须小且可结构化克隆，因为每次变更都会广播。
 */
export class SharedObjectRepository {
  private readonly values = new Map<string, unknown>()
  private readonly subscribers = new Set<(key: string) => void>()

  get(key: string): unknown {
    return this.values.get(key)
  }

  getSnapshot(): Record<string, unknown> {
    return Object.fromEntries(this.values)
  }

  set(key: string, value: unknown): void {
    if (value === undefined) {
      if (!this.values.delete(key)) return
    } else {
      // 同值不广播：渲染层的受控组件会把当前值写回来，不去重就会自激
      if (this.values.has(key) && shallowEqual(this.values.get(key), value)) return
      this.values.set(key, value)
    }
    for (const subscriber of this.subscribers) subscriber(key)
  }

  addSubscriber(subscriber: (key: string) => void): () => void {
    this.subscribers.add(subscriber)
    return () => {
      this.subscribers.delete(subscriber)
    }
  }

  updateMessage(key: string): HostMessage {
    return { type: 'shared-object-updated', key, value: this.values.get(key) }
  }
}

/** 只比一层：值本身要求是小对象，深比较的成本反而超过多广播一次 */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a == null || b == null) return false
  const aKeys = Object.keys(a as Record<string, unknown>)
  const bKeys = Object.keys(b as Record<string, unknown>)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every(
    (key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key]
  )
}
