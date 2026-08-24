import { useEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { useAppShell, FILE_TREE_MIN_WIDTH } from '../../../state/AppShellContext'
import { ResizeHandle } from '../../layout/ResizeHandle'
import { usePanelResize } from '../../../utils/usePanelResize'
import { fileService } from '../../../services'
import { useWorkspace } from '../../../state/WorkspaceContext'
import { SearchIcon, CloseIcon } from '../../icons'
import { FileTreeView } from './FileTreeView'
import {
  getWorkspaceTreeState,
  selectTreePath,
  setTreeSearchQuery,
  settleTreeState,
  setWorkspaceTreeState,
  useWorkspaceTreeState,
  ancestorPaths
} from './treeState'
import { useDirectoryEntries } from './directoryEntries'

/**
 * 工作区文件树面板 —— Codex `hyo`/`gyo`/`qfo` 的合并移植
 * (app-initial:421266 hyo 外壳 + gyo root 选择 + 414674 qfo 状态机)。
 *
 * 层级:
 *   motion.div.relative.flex.h-full.shrink-0.border-l[style maxWidth:60%](hyo)
 *   ├ ResizeHandle(edge=left)
 *   └ div.flex.min-h-0.min-w-0.flex-1.flex-col(gyo)
 *     ├ (多 root 时的 root 选择器 —— WS 项目单 root,不渲染)
 *     └ qfo:keyed by root
 *       ├ div.shrink-0.px-2.pt-2.pb-px > FileTreeSearchInput(Bfo)
 *       └ div.min-h-0.flex-1
 *         ├ 有搜索词 → FileTreeSearchResults(Yfo:扁平结果树)
 *         └ 无 → FileTreeView(Jfo:目录树;loading/empty/error 三态)
 *
 * 开合:全局 fileTreeOpen(Codex `dD`,持久化),宽度 fileTreeWidth(Codex `CWn`,
 * 内存 250);拖拽 <100 收起;开合动画 = UPr 同款弹簧(0.5s bounce 0.1)。
 */

/** Codex `opo` —— 树状态回流(滚动/展开)的防抖 */
const STATE_SETTLE_MS = 100

export function WorkspaceTreePane({
  projectId,
  activeFilePath,
  onSelectFile
}: {
  projectId: string
  /** 当前打开的文件(相对项目根);树会选中并 reveal 它 */
  activeFilePath: string | null
  onSelectFile(path: string, opts?: { isPreview?: boolean }): void
}): React.JSX.Element | null {
  const { fileTreeOpen, fileTreeWidth, setFileTreeWidth } = useAppShell()
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // 容器宽只在事件里读(drag),渲染期用窗口宽兑底 —— 别在渲染路径上读 ref
  const containerWidth = (): number =>
    wrapperRef.current?.parentElement?.getBoundingClientRect().width ?? window.innerWidth
  // Codex hyo `u`:clamp 进 [200, max(200, 容器*0.6)]
  const clampWidth = (desired: number, container: number): number => {
    const max = Math.max(FILE_TREE_MIN_WIDTH, container * 0.6)
    return Math.min(Math.max(desired, FILE_TREE_MIN_WIDTH), max)
  }
  // 渲染期的当前宽(纯计算)
  const displayWidth = clampWidth(fileTreeWidth, window.innerWidth)

  const reducedMotion = useReducedMotion() === true
  /** Codex UPr:开合 progress(0..1),width = clamp01(progress) × 宽度 */
  const progress = useMotionValue(fileTreeOpen ? 1 : 0)
  const animatedWidth = useTransform(progress, (p) => Math.max(0, Math.min(1, p)) * displayWidth)
  const [, forceRender] = useState(0)

  useEffect(() => {
    const controls = reducedMotion
      ? null
      : animate(progress, fileTreeOpen ? 1 : 0, { type: 'spring', duration: 0.5, bounce: 0.1 })
    if (reducedMotion) progress.set(fileTreeOpen ? 1 : 0)
    const stop = progress.on('animationComplete', () => forceRender((x) => x + 1))
    const stopChange = progress.on('change', (v) => {
      if (!fileTreeOpen && v <= 0) forceRender((x) => x + 1)
    })
    return () => {
      controls?.stop()
      stop()
      stopChange()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileTreeOpen, reducedMotion])

  const resize = usePanelResize({
    edge: 'left',
    size: displayWidth,
    onResize: (desired) => setFileTreeWidth(desired, containerWidth())
  })

  const isMounted = fileTreeOpen || progress.get() > 0
  if (!isMounted) return null

  return (
    <motion.div
      ref={wrapperRef}
      className="relative flex h-full shrink-0 border-l border-token-border-default"
      style={{ maxWidth: '60%', opacity: progress, width: animatedWidth }}
    >
      <ResizeHandle
        edge="left"
        ariaLabel="Resize file tree"
        currentSize={displayWidth}
        minimumSize={FILE_TREE_MIN_WIDTH}
        isResizing={resize.isResizing}
        onPointerDown={resize.onPointerDown}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <WorkspaceTreeRoot
          key={projectId}
          projectId={projectId}
          activeFilePath={activeFilePath}
          onSelectFile={onSelectFile}
        />
      </div>
    </motion.div>
  )
}

/* ==================== qfo:单 root 的树(搜索 + 状态机) ==================== */

function WorkspaceTreeRoot({
  projectId,
  activeFilePath,
  onSelectFile
}: {
  projectId: string
  activeFilePath: string | null
  onSelectFile(path: string, opts?: { isPreview?: boolean }): void
}): React.JSX.Element {
  const state = useWorkspaceTreeState(projectId)
  const { paths, isLoading, isEmpty, error } = useDirectoryEntries(projectId, state.expandedPaths)
  const { projects } = useWorkspace()
  const rootAbsolutePath = projects.find((p) => p.id === projectId)?.rootPaths[0] ?? null

  /*
   * Codex qfo 的 `ge` effect:activeFilePath 变化时,树选中它并把祖先展开
   * (写回共享树状态);`revealSelectedPath` 仅在文件已加载进 paths 时成立。
   * 注意:写回发生在 setWorkspaceTreeState → 订阅通知 → 本组件重渲染,
   * 而本 effect 又依赖 activeFilePath…不会循环(selectTreePath 收敛后返回同引用,
   * setWorkspaceTreeState 直接跳过)。但 debounced 的滚动回流也可能交叉触发,
   * 所以这里对"state 已达标"做幂等短路。
   */
  const revealTarget =
    activeFilePath != null && paths.includes(activeFilePath) ? activeFilePath : null
  useEffect(() => {
    if (activeFilePath == null) return
    const current = getWorkspaceTreeState(projectId)
    if (selectTreePath(current, activeFilePath) === current) return // 已达标,不再写
    setWorkspaceTreeState(projectId, (prev) => selectTreePath(prev, activeFilePath))
  }, [projectId, activeFilePath])

  // Codex `fe`/`pe`:onStateChange 防抖 100ms 后 WQi 收敛写回
  const pendingRef = useRef<{ expandedPaths: string[]; scrollTop: number } | null>(null)
  const settleTimerRef = useRef<number | null>(null)
  const onTreeStateChange = (next: {
    expandedPaths: string[]
    scrollTop: number
    selectedPath: string | null
  }): void => {
    pendingRef.current = next
    if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null
      const pending = pendingRef.current
      if (pending != null) {
        pendingRef.current = null
        setWorkspaceTreeState(projectId, (prev) => settleTreeState(prev, pending))
      }
    }, STATE_SETTLE_MS)
  }
  useEffect(
    () => () => {
      if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
    },
    []
  )

  // Codex:`K` —— onSelectFile(单 root,路径即项目相对路径)
  const openFile = (path: string, opts?: { isPreview?: boolean }): void => {
    onSelectFile(path, opts)
  }

  const query = state.searchQuery
  const searching = query.trim().length > 0

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="shrink-0 px-2 pt-2 pb-px">
        <FileTreeSearchInput
          autoFocus={activeFilePath == null}
          inputId="workspace-directory-tree-search"
          searchQuery={query}
          onQueryChange={(q) =>
            setWorkspaceTreeState(projectId, (prev) => setTreeSearchQuery(prev, q))
          }
        />
      </div>
      <div className="min-h-0 flex-1">
        {searching ? (
          <FileTreeSearchResults
            projectId={projectId}
            rootAbsolutePath={rootAbsolutePath}
            query={query}
            onSelectFile={(p) => openFile(p, { isPreview: true })}
            onOpenFile={(p) => openFile(p, { isPreview: false })}
          />
        ) : (
          <DirectoryTree
            projectId={projectId}
            rootAbsolutePath={rootAbsolutePath}
            paths={paths}
            isLoading={isLoading}
            isEmpty={isEmpty}
            error={error}
            initialExpandedPaths={state.expandedPaths}
            initialScrollTop={state.scrollTop}
            selectedPath={state.selectedPath}
            revealSelectedPath={revealTarget != null}
            onSelectFile={(p) => openFile(p, { isPreview: true })}
            onOpenFile={(p) => openFile(p, { isPreview: false })}
            onExpandedPathsChange={(expandedPaths) => {
              // 展开/收起即时进 ref + 防抖写回(与滚动同一条 onStateChange 通道)
              pendingRef.current = {
                expandedPaths,
                scrollTop: getWorkspaceTreeState(projectId).scrollTop
              }
            }}
            onStateChange={onTreeStateChange}
          />
        )}
      </div>
    </div>
  )
}

/* ==================== Bfo:过滤输入框 ==================== */

function FileTreeSearchInput({
  autoFocus = false,
  inputId = 'file-tree-search',
  searchQuery,
  onQueryChange
}: {
  autoFocus?: boolean
  inputId?: string
  searchQuery: string
  onQueryChange(query: string): void
}): React.JSX.Element {
  return (
    <div className="relative flex h-token-button-composer w-full items-center gap-1.5 rounded-lg border border-token-border bg-token-bg-fog text-base leading-[18px]">
      <label className="sr-only" htmlFor={inputId}>
        Filter files
      </label>
      <SearchIcon className="icon-xs ms-2 shrink-0 text-token-input-placeholder-foreground" />
      <input
        autoFocus={autoFocus}
        id={inputId}
        className="w-full appearance-none border-none bg-transparent py-0 ps-0 pe-1.5 text-token-foreground ring-0 outline-none select-text placeholder:text-token-input-placeholder-foreground focus:border-none focus:ring-0 focus:outline-none [&::placeholder]:select-none"
        type="text"
        value={searchQuery}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Filter files…"
      />
      {searchQuery.length > 0 && (
        <button
          type="button"
          aria-label="Clear file filter"
          onClick={() => onQueryChange('')}
          className="text-token-input-placeholder-foreground hover:text-token-foreground"
        >
          <CloseIcon className="icon-2xs" />
        </button>
      )}
    </div>
  )
}

/* ==================== Jfo:目录树(三态 + FileTreeView) ==================== */

/** 三态消息的公共容器(Codex `epo`) */
function TreeStatusMessage({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="px-2 py-2 text-start text-base text-token-description-foreground">
      {children}
    </div>
  )
}

function DirectoryTree({
  projectId,
  rootAbsolutePath,
  paths,
  isLoading,
  isEmpty,
  error,
  initialExpandedPaths,
  initialScrollTop,
  selectedPath,
  revealSelectedPath,
  onSelectFile,
  onOpenFile,
  onExpandedPathsChange,
  onStateChange
}: {
  projectId: string
  rootAbsolutePath: string | null
  paths: string[]
  isLoading: boolean
  isEmpty: boolean
  error: Error | null
  initialExpandedPaths: string[]
  initialScrollTop: number
  selectedPath: string | null
  revealSelectedPath: boolean
  onSelectFile(path: string): void
  onOpenFile(path: string): void
  onExpandedPathsChange(expanded: string[]): void
  onStateChange: FileTreeViewProps['onStateChange']
}): React.JSX.Element {
  if (error != null) {
    return <div className="px-3 py-2 text-xs text-token-error-foreground">{error.message}</div>
  }
  if (isLoading) {
    return <TreeStatusMessage>Loading directory entries…</TreeStatusMessage>
  }
  if (isEmpty) {
    return <TreeStatusMessage>No files in this folder</TreeStatusMessage>
  }
  return (
    <div className="h-full min-h-0 w-full px-2">
      <FileTreeView
        projectId={projectId}
        rootAbsolutePath={rootAbsolutePath}
        paths={paths}
        selectedPath={selectedPath}
        initialExpandedPaths={initialExpandedPaths}
        initialScrollTop={initialScrollTop}
        revealSelectedPath={revealSelectedPath}
        onSelectionChange={(selected) => {
          // Codex `te`:取第一个非目录路径 → isPreview
          const file = selected.find((p) => !p.endsWith('/'))
          if (file != null) onSelectFile(file)
        }}
        onDoubleClickFile={onOpenFile}
        onExpandedPathsChange={onExpandedPathsChange}
        onStateChange={onStateChange}
      />
    </div>
  )
}

type FileTreeViewProps = React.ComponentProps<typeof FileTreeView>

/* ==================== Yfo:搜索结果(扁平树) ==================== */

function FileTreeSearchResults({
  projectId,
  rootAbsolutePath,
  query,
  onSelectFile,
  onOpenFile
}: {
  projectId: string
  rootAbsolutePath: string | null
  query: string
  onSelectFile(path: string): void
  onOpenFile(path: string): void
}): React.JSX.Element {
  const trimmed = query.trim()
  const [files, setFiles] = useState<string[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  // Codex:旧结果保留到新结果回来(`YQi` —— 同 query 的旧数据继续展示)
  const [lastGood, setLastGood] = useState<{ query: string; files: string[] } | null>(null)

  useEffect(() => {
    if (trimmed === '') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 查询清空时同步清结果(外部系统同步)
      setFiles(null)
      return
    }
    let cancelled = false

    setIsLoading(true)
    fileService
      .searchFiles(projectId, trimmed)
      .then((result) => {
        if (cancelled) return
        setLastGood({ query: trimmed, files: result })
        setFiles(result)
      })
      .catch(() => {
        if (!cancelled) setFiles([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, trimmed])

  const effective = files ?? (lastGood?.query === trimmed ? lastGood.files : null)

  if (effective == null || (isLoading && effective.length === 0)) {
    return <TreeStatusMessage>Searching files…</TreeStatusMessage>
  }
  if (effective.length === 0) {
    return <TreeStatusMessage>No matching files</TreeStatusMessage>
  }

  // Codex `Gfo`/`tpo`:结果去重后全量展开祖先目录
  const displayPaths = [...new Set(effective)]
  const expandedPaths = displayPaths.flatMap((p) => ancestorPaths(p))

  return (
    <div className="h-full min-h-0 w-full px-2">
      <FileTreeView
        projectId={projectId}
        rootAbsolutePath={rootAbsolutePath}
        paths={displayPaths}
        flattenEmptyDirectories
        initialExpandedPaths={expandedPaths}
        resetKey={trimmed}
        onSelectionChange={(selected) => {
          const file = selected.find((p) => !p.endsWith('/'))
          if (file != null) onSelectFile(file)
        }}
        onDoubleClickFile={onOpenFile}
      />
    </div>
  )
}
