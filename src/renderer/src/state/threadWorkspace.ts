import { useMemo } from 'react'
import { canonicalRoot } from '@shared/workspace/resolve'
import { useWorkspace } from './WorkspaceContext'
import { useChatRuntime } from './ChatRuntimeContext'

/**
 * 会话的工作区推导 —— Codex 侧是 store 里的一组派生 atom,本文件是 React 移植:
 *
 * | 本文件字段 | Codex atom / 函数 | 取证位置 |
 * |---|---|---|
 * | `kind`('none'/'plain'/'git') | `KWi` → `VWi({codexHome, cwd, gitMetadata, hostId})` | app-initial |
 * | `cwd` | `fB`(当前 cwd)/ `Ck[threadId]` | app-initial |
 * | `workspaceKind`('project'/'projectless') | `Rk` ← `getThreadWorkspaceKind` | app-initial:4654893 |
 * | `workspaceRoots` | `DB` ← `JWi` → `DWi(...)` | app-initial:8912323 / 8914490 |
 * | `workspaceBrowserRoot` | `Wrr` ← `getThreadWorkspaceBrowserRoot` → `O_n(cwd)` | app-initial |
 *
 * 右面板的 Files 动作就是靠这两个值门控的(thread-app-shell-chrome 的 actions
 * hook `In`):`A = workspaceKind !== 'projectless' && workspaceRoots[0] != null`;
 * 动作排序则看 `kind === 'git'`。**不是**看会话有没有被归到某个项目 ——
 * 那是之前 WS 的实现,与 Codex 不符。
 *
 * 运行时实测(2026-08-25,Codex 127.0.0.1:8214):
 * - 项目内会话 → launcher `Review / Terminal / Browser / Files / Side chat`(按 `Rn` 排)
 * - Recents 的 projectless 会话(cwd = `~/Documents/Codex/<日期>/<名字>`)
 *   → `Side chat / Browser / Terminal`,**无 Files 且不排序**
 *
 * 未移植的分支(WS 没有对应数据源,不猜):
 * - `DWi` 里 repository / worktree 的路径改写(需要 origins + repositories 数据)
 * - `getThreadWorkspaceKind` 的 projectless 注册表与 fork 继承(`DMn` 沿 forkedFromId 找父线程)
 * - `VWi` 的 `isCodexWorktree`(需要 codexHome)
 * - `runtimeWorkspaceRoots`(WS 不下发,退回 `[cwd]` —— 与 `DWi` 的 `a` 分支同义)
 */

/**
 * Codex `N_n`:projectless 会话的输出目录形态
 * `.../Documents/Codex/<YYYY-MM-DD>/<slug>` 或 `.../Documents/Codex/<YYYY-MM-DD-slug>`,
 * 捕获组 1 是 `.../Documents/Codex` 本身(即 workspaceBrowserRoot)。逐字照搬。
 */
const PROJECTLESS_OUTPUT_DIRECTORY =
  /^(.*(?:^|[\\/])Documents[\\/]+Codex)[\\/]+(?:\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*|\d{4}-\d{2}-\d{2}[\\/]+[a-z0-9][a-z0-9-]*)[\\/]*$/

/** Codex `O_n`:cwd 命中草稿目录形态时返回 `.../Documents/Codex`,否则 null */
export function projectlessOutputRoot(cwd: string | null | undefined): string | null {
  return cwd?.trim().match(PROJECTLESS_OUTPUT_DIRECTORY)?.[1] ?? null
}

/** Codex `VWi` 的 kind:无 cwd = none,有 cwd 无 git 元数据 = plain,有 git = git */
export type WorkspaceCwdKind = 'none' | 'plain' | 'git'

/** Codex `Rk` 的值域(bundle `bAe = Il(['project','projectless'])`) */
export type WorkspaceKind = 'project' | 'projectless'

export interface ThreadWorkspace {
  /** Codex `f.kind` —— 动作排序的门控(git 才按 `Rn` 排) */
  kind: WorkspaceCwdKind
  /** Codex `f.cwd` —— 会话的工作目录;首页退回侧栏选中项目的首个根 */
  cwd: string | null
  /** Codex `b` —— projectless 会话没有 Files/Review */
  workspaceKind: WorkspaceKind
  /** Codex `V(pe)` —— 有项目归属用项目根,否则退回 `[cwd]` */
  workspaceRoots: string[]
  /** Codex `Wrr` —— 仅 projectless 会话有值(`.../Documents/Codex`) */
  workspaceBrowserRoot: string | null
}

/**
 * 当前路由会话的工作区。
 *
 * Codex 的 `In` 里 `_ = routeKind === 'local-thread' ? conversationId : null`,
 * 首页(`_ == null`)时 projectRoots 取**侧栏选中项目**的根、cwd 取全局 cwd atom;
 * WS 的等价物就是 activeChatId 与 currentProject。
 */
export function useThreadWorkspace(): ThreadWorkspace {
  const { chats, currentProject, projects } = useWorkspace()
  const { activeChatId } = useChatRuntime()

  return useMemo(() => {
    const chat = activeChatId == null ? null : (chats.find((c) => c.id === activeChatId) ?? null)

    // Codex `JWi` 的 `i`(projectRoots):会话有项目归属用它的根;
    // 无会话(首页)用侧栏选中项目的根;会话无归属则为空数组。
    const project =
      chat != null
        ? (projects.find((p) => p.id === chat.projectId) ?? null)
        : (currentProject ?? null)
    const projectRoots = chat != null && chat.projectId == null ? [] : (project?.rootPaths ?? [])

    // Codex `JWi` 的 `a`:会话 cwd(退回全局 cwd);首页没有会话时用项目根
    const cwd = chat?.cwd ?? project?.rootPaths[0] ?? null

    // Codex `DWi`:`a = runtimeWorkspaceRoots ?? (cwd == null ? [] : [cwd])`、
    // `o = projectRoots.length > 0 ? projectRoots : a`
    const fallbackRoots = cwd == null ? [] : [cwd]
    const workspaceRoots = (projectRoots.length > 0 ? projectRoots : fallbackRoots).map(
      canonicalRoot
    )

    // Codex `getThreadWorkspaceKind`:命中草稿目录 → projectless,否则默认 project
    const workspaceBrowserRoot = projectlessOutputRoot(cwd)
    const workspaceKind: WorkspaceKind = workspaceBrowserRoot != null ? 'projectless' : 'project'

    /*
     * Codex `VWi` 的 kind 由 cwd + git 元数据决定。WS 没有 git 查询服务,
     * 用协议 Thread 自带的 `gitInfo.branch`(投影成 ChatSummary.gitBranch)当
     * git 元数据 —— 近似:Codex 是对当前 cwd 实时查 git(还 watchForGitInit),
     * WS 只有会话创建时刻的快照,且首页无会话时拿不到(记为 plain)。
     */
    const kind: WorkspaceCwdKind = cwd == null ? 'none' : chat?.gitBranch != null ? 'git' : 'plain'

    return { kind, cwd, workspaceKind, workspaceRoots, workspaceBrowserRoot }
  }, [activeChatId, chats, currentProject, projects])
}
