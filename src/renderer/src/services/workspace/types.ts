/**
 * 工作区数据模型 —— 与后端/主进程 IPC 交互的契约层。
 * 所有列表数据都通过这些类型流动，UI 组件不直接依赖 mock。
 */

export interface TaskItem {
  id: string
  title: string
  /** 相对时间展示文案，如 "12h" / "1w"（后续由创建时间计算） */
  timeAgo?: string
  /** 未读（右侧蓝点） */
  unread?: boolean
  /** 置顶（进入 Pinned 分区） */
  pinned?: boolean
  /** 所属项目 id */
  projectId: string
}

export interface Project {
  id: string
  name: string
  /** 默认是否展开任务列表（原型中 gams 默认收起） */
  defaultExpanded?: boolean
  tasks: TaskItem[]
}

export type SuggestionColor = 'blue' | 'purple' | 'green' | 'orange'

export interface Suggestion {
  id: string
  label: string
  color: SuggestionColor
}

/** 侧栏 + 首页所需的全部数据一次取回 */
export interface WorkspaceData {
  projects: Project[]
  pinnedTasks: TaskItem[]
  currentProjectId: string
  suggestions: Suggestion[]
}

/**
 * 工作区服务接口：渲染进程只依赖此抽象。
 * 当前由 MockWorkspaceService 实现；接入真实数据时
 * 换成基于 Electron IPC / HTTP 的实现即可，UI 层零改动。
 */
export interface WorkspaceService {
  getWorkspaceData(): Promise<WorkspaceData>
  createProject(input: { name: string }): Promise<Project>
}
