/**
 * 会话域模型。
 *
 * 权限策略枚举供 Composer 的权限 pill 使用，选择结果随 turn/start 的每轮
 * 覆盖项下发。Entry 等会话运行时模型在 M4 接入时加入本文件。
 */
import type { AgentMode } from '../../state/permissionSelection'
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

/** 权限菜单的一行（Codex 的 permissions dropdown item，标签取自实测 DOM） */
export interface AgentModeRow {
  /** 档位。第一行是动态的 —— 有项目 `auto`、无项目 `granular`（Codex `Oti`） */
  mode: AgentMode
  label: string
  description: string
  /** true = 危险档，UI 用警示色（Codex `OUs` 那组 warning class） */
  warn: boolean
}

/**
 * 菜单的三行（实测 DOM `dom-permissions-picker.html` 只有这三行：
 * read-only 与 custom 要 requirements/config 才会出现，本项目不构造）。
 *
 * 第一行的档位由调用方按"有没有项目"决定，所以这里只给标签，不写死 mode。
 */
export const ACCESS_ROW_LABELS = {
  default: {
    label: 'Ask for approval',
    description: 'Always ask to edit external files and use the internet'
  },
  guardian: {
    label: 'Approve for me',
    description: 'Only ask for actions detected as potentially unsafe'
  },
  full: {
    label: 'Full access',
    description: 'Unrestricted access to the internet and any file on your computer'
  }
} as const

/**
 * pill 上的短标签（Codex 的 trigger 分支 `Ie` / `full-access` / `guardian-approvals` / 其他）：
 * auto / granular / read-only 都显示 "Ask for approval"。
 */
export function agentModeLabel(mode: AgentMode): string {
  switch (mode) {
    case 'full-access':
      return ACCESS_ROW_LABELS.full.label
    case 'guardian-approvals':
      return ACCESS_ROW_LABELS.guardian.label
    case 'custom':
      return 'Custom'
    default:
      return ACCESS_ROW_LABELS.default.label
  }
}
