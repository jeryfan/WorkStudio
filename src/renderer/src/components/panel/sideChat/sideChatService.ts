import { rpc } from '../../../rpc/client'
import { M } from '@shared/protocol/methods'
import { SIDE_CHAT_INSTRUCTIONS } from './sideChatInstructions'
import type { ThreadForkResponse } from '@shared/protocol/generated/v2/ThreadForkResponse'
import type { Chat } from '@shared/protocol/entities'

/**
 * Side chat 的会话管线 —— Codex `local-conversation-side-chat` chunk:
 * - fork:`fork-conversation-from-latest`(WS 协议 `thread/fork`,
 *   ThreadForkParams 含 developerInstructions + ephemeral,语义同 Codex 的
 *   sideConversation:true / ephemeral 组合)
 * - 关闭即弃:Codex 关 tab 时 `discard-conversation-from-cache`;
 *   WS 用 `thread/delete`(ephemeral 会话本无持久化诉求)
 */

/** fork 当前会话为一条 ephemeral side chat;返回新会话(响应自带历史 turns) */
export async function forkSideChatConversation(
  sourceThreadId: string,
  cwd: string | null
): Promise<Chat> {
  const res = await rpc.request<ThreadForkResponse>(M.chatFork, {
    threadId: sourceThreadId,
    cwd,
    developerInstructions: SIDE_CHAT_INSTRUCTIONS,
    ephemeral: true
  })
  return res.thread as Chat
}

/** 关闭 side chat tab 时丢弃会话(best-effort) */
export async function discardSideChatConversation(threadId: string): Promise<void> {
  try {
    await rpc.request(M.chatUnsubscribe, { threadId })
  } catch {
    /* 已断开也算弃置 */
  }
  try {
    await rpc.request(M.chatDelete, { threadId })
  } catch {
    /* 丢弃失败不回弹 —— Codex 同样只记 warning */
  }
}
