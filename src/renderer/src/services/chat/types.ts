/**
 * 会话域模型。
 *
 * 权限策略枚举供 Composer 的权限 pill 使用，选择结果随 turn/start 的每轮
 * 覆盖项下发。Entry 等会话运行时模型在 M4 接入时加入本文件。
 */
import type { AskForApproval } from '@shared/protocol/generated/v2/AskForApproval'
import type { SandboxMode } from '@shared/protocol/generated/v2/SandboxMode'
import type { ChatStatus } from '@shared/protocol/entities'
import type { WorkspaceSnapshot } from '@shared/workspace/types'

/**
 * 侧栏会话行。
 *
 * 由协议的 Thread 投影而来，只保留侧栏渲染与分区划分需要的字段；
 * 正文（turns/entries）不在列表接口里返回。
 */
export interface ChatSummary {
  id: string
  /** 用户命名优先，否则取首条用户消息 */
  title: string
  /** 工作目录，是项目归属的事实来源 */
  cwd: string
  /** null = 无归属，落入 Recents 分区 */
  projectId: string | null
  pinned: boolean
  status: ChatStatus
  /** 毫秒时间戳。排序依据，渲染时才格式化成相对时间 */
  updatedAt: number
  createdAt: number
  gitBranch?: string
}

export interface ListChatsOptions {
  /** 按工作目录精确过滤，可传多个（多根项目） */
  cwd?: string[]
  limit?: number
  cursor?: string | null
  archived?: boolean
  /** true = 扫描回滚文件修复元数据（慢但准），默认走 sqlite 快路径 */
  precise?: boolean
}

export interface ChatPage {
  chats: ChatSummary[]
  nextCursor: string | null
  /** 反向翻页游标；顶部新增项无法只靠 nextCursor 增量补齐 */
  backwardsCursor: string | null
}

export interface ChatService {
  listChats(snapshot: WorkspaceSnapshot, options?: ListChatsOptions): Promise<ChatPage>
  setPinned(chatId: string, pinned: boolean): Promise<WorkspaceSnapshot>
  assignToProject(chatId: string, projectId: string | null, cwd: string): Promise<WorkspaceSnapshot>
  rename(chatId: string, name: string): Promise<void>
  archive(chatId: string): Promise<void>
  unarchive(chatId: string): Promise<void>
  remove(chatId: string): Promise<WorkspaceSnapshot>
}

/** 权限 pill 的一个可选策略 */
export interface AccessPolicy {
  id: 'ask' | 'auto' | 'full'
  label: string
  description: string
  /** 协议审批策略（AskForApproval） */
  approval: AskForApproval
  /** 协议沙箱模式（SandboxMode） */
  sandbox: SandboxMode
  /** true = 危险档，UI 用警示色（chat.html 的 warn 样式） */
  warn: boolean
}

/** 可选策略列表，顺序即权限弹层里的行顺序（chat.html popAccess） */
export const ACCESS_POLICIES: AccessPolicy[] = [
  {
    id: 'ask',
    label: 'Ask for approval',
    description: 'Always ask to edit external files and use the internet',
    approval: 'on-request',
    sandbox: 'workspace-write',
    warn: false
  },
  {
    /* Codex 权限菜单的中间档("agent 模式"):工作区内自动,危险/越界动作才问 */
    id: 'auto',
    label: 'Approve for me',
    description: 'Only ask for actions detected as potentially unsafe',
    approval: 'never',
    sandbox: 'workspace-write',
    warn: false
  },
  {
    id: 'full',
    label: 'Full access',
    description: 'Unrestricted access to the internet and any file on your computer',
    approval: 'never',
    sandbox: 'danger-full-access',
    warn: true
  }
]
