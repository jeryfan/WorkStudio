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
  /**
   * 置顶项目 id，顺序即展示顺序。
   *
   * Codex 的 Pinned 分节**同时装项目和会话**（项目排在前、会话排在后），
   * 两者各自独立置顶，且**都是从原分区移走**（置顶是移动，不是复制）：
   *   - 置顶项目从 Projects 移走
   *   - 置顶会话从 Recents / 所属项目下移走
   * 整节在两者都为空时**不渲染**（不是渲染成空节）。
   */
  pinnedProjectIds: string[]
  /**
   * Pinned 分节的**混合顺序** —— 项目与会话在同一个数组里。
   *
   * Codex 的侧栏状态里存的就是一个混合的 `itemKeys`(schema 实测:
   * `codex:project:<uuid>` / `codex:thread:local:<uuid>` / `codex:thread:remote:<id>`),
   * 所以 Pinned 里项目行与会话行是**同一个可排序列表的兄弟**,可以互相穿插。
   * 分成 pinnedProjectIds + pinnedChatIds 两个数组时做不到这一点 ——
   * 渲染只能"项目全在前、会话全在后"。
   *
   * 那两个数组仍然保留:它们回答「是否置顶」,这个数组只回答「排第几」。
   * 缺失或不完整时由两者派生(项目在前、会话在后),所以旧状态文件能直接用。
   */
  pinnedItemKeys: string[]
  /**
   * 项目内会话的手工顺序,`projectId → 会话 id 列表`。
   *
   * 只记被拖过的:不在表里的会话按 updatedAt 排在手工项之后 ——
   * 全量记录的话新会话会莫名出现在列表末尾。
   */
  projectThreadOrder: Record<string, string[]>
  /** 会话归属的显式指派，覆盖按 cwd 的自动推导 */
  chatAssignments: Record<string, ChatAssignment>
}

/** Pinned 混合列表的 item key —— 与 Codex 的 schema 同形 */
export const PROJECT_ITEM_KEY_PREFIX = 'codex:project:'
export const THREAD_ITEM_KEY_PREFIX = 'codex:thread:local:'

export function projectItemKey(projectId: string): string {
  return `${PROJECT_ITEM_KEY_PREFIX}${projectId}`
}

export function threadItemKey(chatId: string): string {
  return `${THREAD_ITEM_KEY_PREFIX}${chatId}`
}

export function parseItemKey(
  key: string
): { kind: 'project'; projectId: string } | { kind: 'thread'; chatId: string } | null {
  if (key.startsWith(PROJECT_ITEM_KEY_PREFIX)) {
    return { kind: 'project', projectId: key.slice(PROJECT_ITEM_KEY_PREFIX.length) }
  }
  if (key.startsWith(THREAD_ITEM_KEY_PREFIX)) {
    return { kind: 'thread', chatId: key.slice(THREAD_ITEM_KEY_PREFIX.length) }
  }
  return null
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
