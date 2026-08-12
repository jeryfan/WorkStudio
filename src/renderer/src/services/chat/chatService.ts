import { rpc } from '../../rpc/client'
import { M } from '@shared/protocol/methods'
import { LOCAL } from '@shared/protocol/local'
import type { Chat, ChatListResponse } from '@shared/protocol/entities'
import type { WorkspaceSnapshot } from '@shared/workspace/types'
import { findProjectForCwd } from '@shared/workspace/resolve'
import type { ChatSummary, ChatService, ListChatsOptions, ChatPage } from './types'

/**
 * 协议 Thread → 本项目 ChatSummary。
 *
 * 时间戳统一转毫秒：协议给的是秒，而 JS 的 Date 与相对时间工具都用毫秒，
 * 混用会得到 1970 年附近的结果。
 */
function toSummary(chat: Chat, snapshot: WorkspaceSnapshot): ChatSummary {
  const assignment = snapshot.chatAssignments[chat.id]
  const projectId =
    assignment && (assignment.projectId === null || projectExists(snapshot, assignment.projectId))
      ? assignment.projectId
      : (findProjectForCwd(snapshot.projects, chat.cwd)?.id ?? null)

  return {
    id: chat.id,
    // name 是用户显式命名；没有则用首条用户消息作为标题
    title: chat.name?.trim() || chat.preview.trim() || 'New chat',
    cwd: chat.cwd,
    projectId,
    pinned: snapshot.pinnedChatIds.includes(chat.id),
    status: chat.status,
    // recencyAt 与 updatedAt 分离：后台元数据回填会动 updatedAt，
    // 但不该让会话在侧栏跳到顶部
    updatedAt: (chat.recencyAt ?? chat.updatedAt) * 1000,
    createdAt: chat.createdAt * 1000,
    gitBranch: chat.gitInfo?.branch ?? undefined
  }
}

function projectExists(snapshot: WorkspaceSnapshot, projectId: string): boolean {
  return snapshot.projects.some((p) => p.id === projectId)
}

export class RpcChatService implements ChatService {
  /**
   * 拉取会话列表。
   *
   * 不传 cwd 时取全量最近列表，由渲染层按 cwd 就地划分到各分区——侧栏三个分区
   * 是一次划分而不是三次查询，一次取回避免 N+1，也保证同一会话不会因为分页
   * 边界在两个分区里同时出现。
   */
  async listChats(snapshot: WorkspaceSnapshot, options: ListChatsOptions = {}): Promise<ChatPage> {
    const res = await rpc.request<ChatListResponse>(M.chatList, {
      limit: options.limit ?? 200,
      cursor: options.cursor ?? null,
      sortKey: 'recency_at',
      sortDirection: 'desc',
      archived: options.archived ?? false,
      // 空数组 = 不限供应商。省略该字段会被服务端收窄到当前配置的 provider，
      // 用别的供应商跑过的历史会话就会在侧栏里静默消失。
      modelProviders: [],
      ...(options.cwd ? { cwd: options.cwd } : {}),
      // 首屏走 sqlite 快路径；扫 JSONL 修复元数据慢得多，留给后台
      useStateDbOnly: options.precise !== true
    })

    return {
      chats: res.data.map((c) => toSummary(c, snapshot)),
      nextCursor: res.nextCursor,
      backwardsCursor: res.backwardsCursor
    }
  }

  setPinned(chatId: string, pinned: boolean): Promise<WorkspaceSnapshot> {
    return rpc.request<WorkspaceSnapshot>(LOCAL.chatSetPinned, { chatId, pinned })
  }

  assignToProject(
    chatId: string,
    projectId: string | null,
    cwd: string
  ): Promise<WorkspaceSnapshot> {
    return rpc.request<WorkspaceSnapshot>(LOCAL.chatAssign, { chatId, projectId, cwd })
  }

  async rename(chatId: string, name: string): Promise<void> {
    await rpc.request(M.chatSetName, { threadId: chatId, name })
  }

  async archive(chatId: string): Promise<void> {
    await rpc.request(M.chatArchive, { threadId: chatId })
  }

  async unarchive(chatId: string): Promise<void> {
    await rpc.request(M.chatUnarchive, { threadId: chatId })
  }

  /** 删除会话，并清掉本地为它保存的置顶/归属状态 */
  async remove(chatId: string): Promise<WorkspaceSnapshot> {
    await rpc.request(M.chatDelete, { threadId: chatId })
    return rpc.request<WorkspaceSnapshot>(LOCAL.chatForget, { chatId })
  }
}
