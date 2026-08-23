/**
 * 工作区数据模型 —— 渲染层与主进程的契约。
 *
 * Project 的权威定义在 @shared/workspace/types，这里只做重导出，
 * 避免同一个概念在两侧各写一份而漂移。
 */
import type {
  CreateProjectInput,
  Project,
  ProjectSelection,
  WorkspaceSnapshot
} from '@shared/workspace/types'

export type { Project, ProjectSelection, WorkspaceSnapshot, CreateProjectInput }

/**
 * 侧栏会话行。
 *
 * M3 接入真实数据后这些字段将来自 agent 的会话列表；
 * 当前只保留 UI 渲染必需的部分。
 */
export interface ChatSummary {
  id: string
  title: string
  /** 排序与相对时间展示的依据；渲染时才格式化成 "12h"，不存预格式化文案 */
  updatedAt?: number
  /** 未读（右侧蓝点） */
  unread?: boolean
  /** 置顶（进入 Pinned 分区） */
  pinned?: boolean
  /** 所属项目 id；null = 无归属，落入 Recents 分区 */
  projectId: string | null
}

export type SuggestionColor = 'blue' | 'purple' | 'green' | 'orange'

export interface Suggestion {
  id: string
  label: string
  color: SuggestionColor
}

/**
 * 项目域服务：渲染进程只依赖此抽象。
 * 变更方法统一返回最新快照，调用方直接用返回值更新状态，省去二次拉取。
 */
export interface WorkspaceService {
  getSnapshot(): Promise<WorkspaceSnapshot>
  createProject(input: CreateProjectInput): Promise<WorkspaceSnapshot>
  renameProject(projectId: string, name: string): Promise<WorkspaceSnapshot>
  removeProject(projectId: string): Promise<WorkspaceSnapshot>
  reorderProjects(projectIds: string[]): Promise<WorkspaceSnapshot>
  selectProject(selection: ProjectSelection): Promise<WorkspaceSnapshot>
  /** 项目置顶 —— 与会话置顶各自独立，都落到 Pinned 分节 */
  setProjectPinned(projectId: string, pinned: boolean): Promise<WorkspaceSnapshot>
  /** Pinned 分节的混合排序（项目与会话在同一个可排序列表里） */
  reorderPinnedItems(itemKeys: string[]): Promise<WorkspaceSnapshot>
  /** 项目内会话的手工顺序 */
  reorderProjectThreads(projectId: string, chatIds: string[]): Promise<WorkspaceSnapshot>
  /** 打开系统目录选择框；用户取消时返回空数组 */
  pickDirectories(): Promise<string[]>
}
