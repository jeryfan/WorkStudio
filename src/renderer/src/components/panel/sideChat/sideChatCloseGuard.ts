import { useSyncExternalStore } from 'react'

/**
 * Side chat 关闭守卫 —— Codex `ke`/`W`/`G`(local-conversation-side-chat chunk):
 * - 有关闭确认:side chat 有过轮次(le(conversationId) > 0)且未勾选
 *   "Don't ask again"(持久化 `skip-side-chat-close-confirmation`,Codex `G`)
 * - 守卫命中的 closeTab 被否决,弹确认框(Codex 经全局 dialog 打开器 `v`);
 *   确认后清掉该 tab 的 onBeforeClose 再关(Codex:updateTab onBeforeClose:void 0)
 */

const SKIP_KEY = 'skip-side-chat-close-confirmation'

export function isSkipCloseConfirmation(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === 'true'
  } catch {
    return false
  }
}

export function setSkipCloseConfirmation(skip: boolean): void {
  try {
    localStorage.setItem(SKIP_KEY, String(skip))
  } catch {
    /* 静默 */
  }
}

/* ---------- 会话活跃度(le 的 WS 版:有过轮次才需要确认) ---------- */

const activity = new Map<string, number>()

export function markSideChatTurn(conversationId: string): void {
  activity.set(conversationId, (activity.get(conversationId) ?? 0) + 1)
}

export function sideChatTurnCount(conversationId: string): number {
  return activity.get(conversationId) ?? 0
}

/* ---------- 确认弹窗状态(全局单例;Codex 同一时间只有一个确认) ---------- */

interface CloseConfirmationState {
  /** 待确认的 tab 列表(Codex `W` —— 确认后批量关) */
  pending: { close(): void }[]
}

let dialogState: CloseConfirmationState | null = null
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

/** 请求确认(弹窗);确认/取消走回调 */
export function requestSideChatCloseConfirmation(pending: { close(): void }[]): void {
  dialogState = { pending }
  emit()
}

export function resolveSideChatCloseConfirmation(confirmed: boolean, dontAskAgain: boolean): void {
  if (dontAskAgain) setSkipCloseConfirmation(true)
  const pending = dialogState?.pending ?? []
  dialogState = null
  emit()
  if (confirmed) for (const p of pending) p.close()
}

export function useSideChatCloseConfirmation(): CloseConfirmationState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => dialogState
  )
}
