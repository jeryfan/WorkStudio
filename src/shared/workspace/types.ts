/**
 * 项目域模型。
 *
 * 项目是一组磁盘根路径的命名集合，完全由客户端维护——agent 只认路径。
 * 因此这些类型不来自协议生成物，由本项目自己定义。
 */

export interface Project {
  id: string
  name: string
  /**
   * 项目包含的根目录，绝对路径。
   *
   * 一开始就是数组：一个项目挂多个目录（主仓 + 依赖库 + 文档）是很快会遇到的
   * 需求，而单值改数组会波及持久化格式、会话过滤参数、文件树根与输入区展示。
   */
  rootPaths: string[]
  createdAt: number
  updatedAt: number
}

/** 当前选中的项目；未归类视图是一个平级选项而不是"没有选中" */
export type ProjectSelection = { type: 'project'; projectId: string } | { type: 'unassigned' }

/** 会话与项目的归属关系。cwd 是事实，projectId 是派生结果 */
export interface ChatAssignment {
  projectId: string | null
  cwd: string
}

export interface WorkspaceSnapshot {
  projects: Project[]
  selection: ProjectSelection
  /**
   * 置顶会话 id，顺序即展示顺序。
   *
   * 置顶不在 agent 协议里——它是客户端概念，随快照一起下发，渲染层据此在
   * 本地完成分区划分，不需要为每个会话再往返一次。
   */
  pinnedChatIds: string[]
  /** 会话归属的显式指派，覆盖按 cwd 的自动推导 */
  chatAssignments: Record<string, ChatAssignment>
}

/** preload 阶段同步取回的首屏数据，用作渲染层状态初值 */
export interface BootstrapPayload {
  workspace: WorkspaceSnapshot
}

export interface CreateProjectInput {
  name?: string
  rootPaths: string[]
}

export interface RenameProjectInput {
  projectId: string
  name: string
}
