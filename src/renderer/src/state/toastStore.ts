import { useSyncExternalStore } from 'react'

/**
 * toast —— Codex 的 `yv` 服务（`scope.get(yv).danger(message)`）的最小移植。
 *
 * Codex 的 toast 是一个 scope 级服务，按 level（danger / info / custom）推一条
 * 消息进列表，由挂在 body 的 portal 层渲染（那一层的结构已在
 * `components/overlay/AppPortals.tsx` 里按实测复刻：`fixed top-2 z-[55]`）。
 *
 * 本项目只需要 danger 一档 —— 目前唯一的调用点是 side chat 打开失败
 * （Codex `threadHeader.openSideChatError`：`Failed to open side chat`）。
 *
 * 自动消失时长 **不确定**：Codex 的 toast 服务里没找到明确的 timeout 常量
 * （消失由 `yv` 内部驱动，取证不到具体毫秒数）。这里取 6s，并保留手动关闭 ——
 * 理由是错误类消息要留够阅读时间，比"猜一个短值把错误一闪而过"更安全。
 */

export interface ToastMessage {
  id: string
  level: 'danger'
  text: string
}

const AUTO_DISMISS_MS = 6000

let toasts: ToastMessage[] = []
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of Array.from(listeners)) l()
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): ToastMessage[] {
  return toasts
}

export function useToasts(): ToastMessage[] {
  return useSyncExternalStore(subscribeToasts, getSnapshot)
}

export function dismissToast(id: string): void {
  const next = toasts.filter((t) => t.id !== id)
  if (next.length === toasts.length) return
  toasts = next
  emit()
}

/** Codex `scope.get(yv).danger(text)` */
export function dangerToast(text: string): void {
  const id = crypto.randomUUID()
  toasts = [...toasts, { id, level: 'danger', text }]
  emit()
  window.setTimeout(() => dismissToast(id), AUTO_DISMISS_MS)
}
