import { useEffect, useState } from 'react'
import { postMessageFromView, subscribeHostMessage } from './hostMessages'

/**
 * shared object 的渲染层视图。
 *
 * 取证：首屏值来自 `electronBridge.getSharedObjectSnapshotValue(key)`（preload 阶段
 * 已经用 sendSync 取好，读它是**同步**的），之后由 `shared-object-updated` 推送。
 * 写入走 `shared-object-set`，preload 会顺手更新本地镜像，所以写完立刻读得到。
 *
 * 同步可读这一点是关键：它让"折叠状态/主题偏好"这类值不需要 loading 态，
 * 首帧就是最终值。
 */
export function getSharedObject<T>(key: string): T | undefined {
  return window.electronBridge?.getSharedObjectSnapshotValue(key) as T | undefined
}

export function setSharedObject(key: string, value: unknown): void {
  postMessageFromView({ type: 'shared-object-set', key, value })
}

export function subscribeSharedObject<T>(
  key: string,
  handler: (value: T | undefined) => void
): () => void {
  return subscribeHostMessage('shared-object-updated', (message) => {
    if (message.key === key) handler(message.value as T | undefined)
  })
}

export function useSharedObject<T>(key: string): [T | undefined, (value: T) => void] {
  const [value, setValue] = useState<T | undefined>(() => getSharedObject<T>(key))
  useEffect(() => subscribeSharedObject<T>(key, setValue), [key])
  return [value, (next: T) => setSharedObject(key, next)]
}
