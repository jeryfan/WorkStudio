import { useSyncExternalStore } from 'react'

/**
 * 工作区文件树状态 —— Codex `cpo`(app-initial:415373)的移植:
 * signalFamily 按 {hostId, includeHidden, root} 分键,存
 * {expandedPaths, scrollTop, searchQuery, selectedPath},默认 `spo` =
 * {expandedPaths: [], scrollTop: 0, searchQuery: '', selectedPath: null}。
 *
 * **状态跟着 workspace root 走,不跟 tab**:同一个 workspace root 的多个 file tab
 * 共享同一棵树的状态(展开/选中/过滤词在 tab 间一致)。
 *
 * WS 按 workspaceRoot 作键(hostId 恒 local、includeHidden 恒 true)。
 */

export interface WorkspaceTreeState {
  expandedPaths: string[]
  scrollTop: number
  searchQuery: string
  selectedPath: string | null
}

const DEFAULT_STATE: WorkspaceTreeState = {
  expandedPaths: [],
  scrollTop: 0,
  searchQuery: '',
  selectedPath: null
}

const states = new Map<string, WorkspaceTreeState>()
const listeners = new Map<string, Set<() => void>>()

function key(workspaceRoot: string): string {
  return `local:true:${workspaceRoot}`
}

export function getWorkspaceTreeState(workspaceRoot: string): WorkspaceTreeState {
  return states.get(key(workspaceRoot)) ?? DEFAULT_STATE
}

export function setWorkspaceTreeState(
  workspaceRoot: string,
  next: WorkspaceTreeState | ((prev: WorkspaceTreeState) => WorkspaceTreeState)
): void {
  const k = key(workspaceRoot)
  const prev = getWorkspaceTreeState(workspaceRoot)
  const value = typeof next === 'function' ? next(prev) : next
  if (value === prev) return
  states.set(k, value)
  listeners.get(k)?.forEach((l) => l())
}

function subscribe(workspaceRoot: string, listener: () => void): () => void {
  const k = key(workspaceRoot)
  let set = listeners.get(k)
  if (!set) {
    set = new Set()
    listeners.set(k, set)
  }
  set.add(listener)
  return () => {
    set.delete(listener)
  }
}

export function useWorkspaceTreeState(workspaceRoot: string): WorkspaceTreeState {
  return useSyncExternalStore(
    (l) => subscribe(workspaceRoot, l),
    () => getWorkspaceTreeState(workspaceRoot)
  )
}

/* ---- 以下对齐 bundle 里的收敛函数(KQi/GQi/WQi),保证 referential 稳定 ---- */

/** Codex `XQi`:path 的全部祖先目录(不含自身) */
export function ancestorPaths(path: string): string[] {
  const parts = path.split('/').filter(Boolean)
  const out: string[] = []
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join('/'))
  return out
}

/** Codex `JQi`:把 path 的祖先并入 expandedPaths(顺序保持,不重复) */
function withAncestorsExpanded(expandedPaths: string[], path: string): string[] {
  let next = expandedPaths
  for (const dir of ancestorPaths(path)) {
    if (!next.includes(dir)) {
      if (next === expandedPaths) next = [...expandedPaths]
      next.push(dir)
    }
  }
  return next
}

/** Codex `KQi`:选中文件(祖先自动展开);null 不变 */
export function selectTreePath(
  prev: WorkspaceTreeState,
  selectedPath: string | null
): WorkspaceTreeState {
  if (selectedPath == null) return prev
  const expandedPaths = withAncestorsExpanded(prev.expandedPaths, selectedPath)
  if (prev.selectedPath === selectedPath && expandedPaths === prev.expandedPaths) return prev
  return { ...prev, expandedPaths, selectedPath }
}

/** Codex `GQi`:过滤词变化 */
export function setTreeSearchQuery(prev: WorkspaceTreeState, query: string): WorkspaceTreeState {
  if (prev.searchQuery === query) return prev
  return { ...prev, searchQuery: query }
}

/** Codex `WQi`:expandedPaths/scrollTop 收敛(保留 searchQuery/selectedPath) */
export function settleTreeState(
  prev: WorkspaceTreeState,
  next: Pick<WorkspaceTreeState, 'expandedPaths' | 'scrollTop'>
): WorkspaceTreeState {
  if (
    prev.scrollTop === next.scrollTop &&
    prev.expandedPaths.length === next.expandedPaths.length &&
    prev.expandedPaths.every((p, i) => p === next.expandedPaths[i])
  ) {
    return prev
  }
  return { ...prev, expandedPaths: next.expandedPaths, scrollTop: next.scrollTop }
}
