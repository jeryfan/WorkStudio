import { useMemo, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { FileTreeView } from './FileTreeView'
import { useDirectoryEntries } from './directoryEntries'

/**
 * 面包屑段的下拉文件树 —— Codex `c0a`(触发)+ `l0a`(内容)的移植
 * (app-initial:385210/385330;实测:点击面包屑任意段弹出 384×320 的 Popover,
 * 内含同一个 file-tree-container)。
 *
 * - 触发:`LXa`(Popover.Trigger asChild)> button,类 = 段文本 +
 *   `cursor-interaction outline-none hover:text-token-text-primary
 *   focus-visible:ring-1 focus-visible:ring-token-focus-border`
 * - 弹层:`oK`(Popover.Content)h-80 w-96(size=large)、opaque、sideOffset=1
 * - 内容:目录 directoryPath 的一层树(FileTreeView surface='dropdown');
 *   shouldExpandActivePath(非末段)时把 activePath 对应的子目录预展开;
 *   选中文件 → onSelectFile(path, {isPreview: true}) 并关闭弹层
 * - 三态:Couldn't load folder contents / Loading… / This folder is empty
 */

interface BreadcrumbSegmentDropdownProps {
  /** 段文本(项目名 / 目录名 / 文件名) */
  label: string
  labelClassName: string
  /** 该段对应的完整项目相对路径(末段是文件时为文件路径) */
  activePath: string | null
  /** 下拉列出的目录(null = 项目根) */
  directoryPath: string | null
  /** Codex:非末段才预展开 activePath 指向的子目录 */
  shouldExpandActivePath: boolean
  projectId: string
  rootAbsolutePath: string | null
  onSelectFile(path: string, opts?: { isPreview?: boolean }): void
}

export function BreadcrumbSegmentDropdown({
  label,
  labelClassName,
  activePath,
  directoryPath,
  shouldExpandActivePath,
  projectId,
  rootAbsolutePath,
  onSelectFile
}: BreadcrumbSegmentDropdownProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`${labelClassName} cursor-interaction outline-none hover:text-token-text-primary focus-visible:ring-1 focus-visible:ring-token-focus-border`}
        >
          {label}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={1}
          className="text-token-foreground ring-token-border z-50 flex origin-[var(--radix-popover-content-transform-origin)] flex-col overflow-y-auto rounded-xl shadow-lg ring-[0.5px] outline-hidden bg-token-dropdown-background h-80 w-96"
        >
          <BreadcrumbDirectoryTree
            activePath={activePath}
            directoryPath={directoryPath}
            shouldExpandActivePath={shouldExpandActivePath}
            projectId={projectId}
            rootAbsolutePath={rootAbsolutePath}
            onSelectFile={(path, opts) => {
              setOpen(false)
              onSelectFile(path, opts)
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Codex `l0a`:目录的一层树(下拉内) */
function BreadcrumbDirectoryTree({
  activePath,
  directoryPath,
  shouldExpandActivePath,
  projectId,
  rootAbsolutePath,
  onSelectFile
}: Omit<BreadcrumbSegmentDropdownProps, 'label' | 'labelClassName'>): React.JSX.Element {
  const baseDir = directoryPath ?? ''
  // Codex:`l` = activePath 去掉 directoryPath 前缀(下拉树内的相对路径)
  const activeRel = useMemo(() => {
    if (activePath == null) return null
    return baseDir === '' ? activePath : activePath.slice(baseDir.length + 1)
  }, [activePath, baseDir])

  // Codex:`u` —— 非末段时预展开 activePath(它在下拉树里是目录)
  const [expandedPaths, setExpandedPaths] = useState<string[]>(() =>
    shouldExpandActivePath && activeRel != null ? [activeRel] : []
  )

  // 聚合:baseDir + 各展开目录(展开目录在树内是相对的,取数时拼回项目根)
  const { paths, isLoading, error } = useDirectoryEntries(
    projectId,
    expandedPaths.map((p) => (baseDir === '' ? p : `${baseDir}/${p}`)),
    baseDir
  )

  if (error != null) {
    return (
      <div role="alert" className="px-[var(--padding-row-x)] text-sm text-token-error-foreground">
        Couldn&apos;t load folder contents
      </div>
    )
  }
  if (isLoading) {
    return (
      <div role="status" className="px-[var(--padding-row-x)] text-sm">
        Loading…
      </div>
    )
  }

  // Codex `C`:树路径相对 baseDir(u0a),只保留 baseDir 内部条目
  const treePaths = paths
    .filter((p) => (baseDir === '' ? true : p.startsWith(`${baseDir}/`)))
    .map((p) => (baseDir === '' ? p : p.slice(baseDir.length + 1)))

  if (treePaths.length === 0) {
    return <div className="px-[var(--padding-row-x)] text-sm">This folder is empty</div>
  }

  return (
    <div className="h-full min-h-0 w-full">
      <FileTreeView
        projectId={projectId}
        rootAbsolutePath={rootAbsolutePath}
        paths={treePaths}
        surface="dropdown"
        selectedPath={activeRel}
        initialExpandedPaths={expandedPaths}
        revealSelectedPath
        revealSelectedPathScrollOffset="center"
        onExpandedPathsChange={(next) =>
          setExpandedPaths((prev) =>
            prev.length === next.length && prev.every((p, i) => p === next[i]) ? prev : next
          )
        }
        onSelectionChange={(selected) => {
          // Codex `b`:取第一个文件,拼回项目相对路径后 isPreview 打开
          const file = selected.find((p) => !p.endsWith('/'))
          if (file == null) return
          const relPath = baseDir === '' ? file : `${baseDir}/${file}`
          onSelectFile(relPath, { isPreview: true })
        }}
      />
    </div>
  )
}
