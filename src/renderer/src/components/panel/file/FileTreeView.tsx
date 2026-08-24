import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useCallback,
  type MouseEvent
} from 'react'
import { FileTree as FileTreeModel, type FileTreeDirectoryHandle } from '@pierre/trees'
import { FileTree } from '@pierre/trees/react'
import { AppContextMenu, type AppContextMenuItem } from '../../menu/AppContextMenu'
import { openInTarget, resolvePrimaryTarget, useOpenTargets } from './openTargets'
import { fileService } from '../../../services'
import { getTheme, subscribeTheme } from '../../../chat/theme/themeStore'

/**
 * FileTreeView —— Codex `N1a`(app-initial:384318)的移植:@pierre/trees 的
 * React 包装。Codex 与 WS 用同一个包(Codex bundle 里的 file-tree-container
 * 即 @pierre/trees),所以 shadow DOM、虚拟滚动、stickyFolders、
 * `--trees-item-height: 28px` 都来自包本身,不需要自绘。
 *
 * 配置(Codex `de`,逐项对齐):
 *   fileTreeSearchMode: 'hide-non-matches'(包内搜索,WS 不走它 —— search:false)
 *   stickyFolders: true
 *   search: false(过滤由外层搜索框 + 搜索列表 Yfo 负责)
 *   itemHeight: 28(Codex `Z1a`)
 *   icons: undefined(包默认 complete 彩色图标集)
 *   unsafeCSS: Codex 的 token 覆盖块(见下,逐行照搬)
 *
 * 右键菜单(Codex `b1a`,surface='workspace'):Open in <首选> / Open with ▸ /
 * separator / Copy path / Copy file contents / Reveal in Finder。
 * (Codex 还有 Add to chat —— 依赖 composer 附件管线,WS 没有,省略。)
 *
 * 状态回流:onSelectionChange(选中)+ onExpandedPathsChange(展开)+
 * onStateChange({expandedPaths, scrollTop, selectedPath},供 tab state 持久化)。
 */

/** Codex `Z1a` —— 树行高 */
const DEFAULT_ITEM_HEIGHT = 28
/** Codex `Q1a` —— 滚动恢复的 rAF 重试预算 */
const SCROLL_RESTORE_MAX_FRAMES = 20

/* Codex unsafeCSS 引用的 git 状态图标(data URI;`D1a`/`k1a`/`j1a`) */
const GIT_ICON_ADDED = `data:image/svg+xml,${encodeURIComponent(
  `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 6.41797C10.367 6.41815 10.6649 6.71599 10.665 7.08301V9.33496H12.916C13.2832 9.33496 13.5809 9.63287 13.5811 10C13.5809 10.3671 13.2832 10.665 12.916 10.665H10.665V12.916C10.665 13.2832 10.3671 13.5809 10 13.5811C9.63284 13.5809 9.33496 13.2832 9.33496 12.916V10.665H7.08301C6.71596 10.6649 6.41815 10.367 6.41797 10C6.41813 9.63295 6.71595 9.33509 7.08301 9.33496H9.33496V7.08301C9.33513 6.71596 9.63295 6.4181 10 6.41797Z" fill="currentColor" /><path d="M12.666 2.66797C13.3549 2.66797 13.9121 2.66735 14.3623 2.7041C14.8202 2.74151 15.2268 2.82084 15.6035 3.0127C16.1989 3.31608 16.6829 3.80115 16.9863 4.39649C17.1781 4.77304 17.2575 5.17902 17.2949 5.63672C17.3317 6.08689 17.3311 6.64406 17.3311 7.33301V12.666C17.3311 13.3549 17.3317 13.9121 17.2949 14.3623C17.2575 14.8203 17.1782 15.2268 16.9863 15.6035C16.6829 16.1988 16.1988 16.6829 15.6035 16.9863C15.2268 17.1783 14.8203 17.2575 14.3623 17.2949C13.9121 17.3317 13.3549 17.3311 12.666 17.3311H7.33301C6.64403 17.3311 6.08691 17.3317 5.63672 17.2949C5.17899 17.2575 4.77306 17.1781 4.39649 16.9863C3.80114 16.6829 3.31609 16.1989 3.0127 15.6035C2.82085 15.2269 2.74151 14.8202 2.7041 14.3623C2.66736 13.9122 2.66797 13.3548 2.66797 12.666V7.33301C2.66797 6.64406 2.66732 6.08689 2.7041 5.63672C2.74152 5.17904 2.82093 4.77302 3.0127 4.39649C3.31613 3.80104 3.80103 3.31611 4.39649 3.0127C4.77304 2.82092 5.17902 2.74152 5.63672 2.7041C6.08691 2.66732 6.64403 2.66797 7.33301 2.66797H12.666ZM7.33301 3.99805C6.6221 3.99805 6.12859 3.99894 5.74512 4.03027C5.36955 4.06098 5.15798 4.11775 5 4.19824C4.65484 4.37414 4.37416 4.65485 4.19824 5C4.11775 5.15797 4.06098 5.36959 4.03027 5.74512C3.99894 6.12858 3.99805 6.62214 3.99805 7.33301V12.666C3.99805 13.3767 3.99898 13.8705 4.03027 14.2539C4.06094 14.6292 4.11788 14.8411 4.19824 14.999C4.37412 15.3442 4.65487 15.6258 5 15.8018C5.15795 15.8822 5.36972 15.939 5.74512 15.9697C6.12859 16.0011 6.6221 16.001 7.33301 16.001H12.666C13.3767 16.001 13.8705 16.001 14.2539 15.9697C14.6292 15.9391 14.8411 15.8821 14.999 15.8018C15.3443 15.6258 15.6258 15.3443 15.8018 14.999C15.8821 14.8411 15.9391 14.6292 15.9697 14.2539C16.001 13.8705 16.001 13.3767 16.001 12.666V7.33301C16.001 6.62213 16.0011 6.12858 15.9697 5.74512C15.939 5.36976 15.8822 5.15795 15.8018 5C14.8411 4.11787 14.6292 4.06094 14.2549 4.03027C13.8705 3.99898 13.3767 3.99805 12.667 3.99805H7.33301Z" fill="currentColor" /></svg>`
)}`
const GIT_ICON_DELETED = `data:image/svg+xml,${encodeURIComponent(
  `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.916 9.33496C13.2833 9.33496 13.5811 9.63273 13.5811 10C13.5811 10.3673 13.2833 10.665 12.916 10.665H7.08301C6.71585 10.6649 6.41797 10.3672 6.41797 10C6.41797 9.63281 6.71585 9.33509 7.08301 9.33496H12.916Z" fill="currentColor" /><path d="M12.666 2.66797C13.3549 2.66797 13.9121 2.66735 14.3623 2.7041C14.8202 2.74151 15.2268 2.82084 15.6035 3.0127C16.1989 3.31608 16.6829 3.80115 16.9863 4.39649C17.1781 4.77304 17.2575 5.17902 17.2949 5.63672C17.3317 6.08689 17.3311 6.64406 17.3311 7.33301V12.666C17.3311 13.3549 17.3317 13.9121 17.2949 14.3623C17.2575 14.8203 17.1782 15.2268 16.9863 15.6035C16.6829 16.1988 16.1988 16.6829 15.6035 16.9863C15.2268 17.1783 14.8203 17.2575 14.3623 17.2949C13.9121 17.3317 13.3549 17.3311 12.666 17.3311H7.33301C6.64403 17.3311 6.08691 17.3317 5.63672 17.2949C5.17899 17.2575 4.77306 17.1781 4.39649 16.9863C3.80114 16.6829 3.31609 16.1989 3.0127 15.6035C2.82085 15.2269 2.74151 14.8202 2.7041 14.3623C2.66736 13.9122 2.66797 13.3548 2.66797 12.666V7.33301C2.66797 6.64406 2.66732 6.08689 2.7041 5.63672C2.74152 5.17904 2.82093 4.77302 3.0127 4.39649C3.31613 3.80104 3.80103 3.31611 4.39649 3.0127C4.77304 2.82092 5.17902 2.74152 5.63672 2.7041C6.08691 2.66732 6.64403 2.66797 7.33301 2.66797H12.666ZM7.33301 3.99805C6.6221 3.99805 6.12859 3.99894 5.74512 4.03027C5.36955 4.06098 5.15798 4.11775 5 4.19824C4.65484 4.37414 4.37416 4.65485 4.19824 5C4.11775 5.15797 4.06098 5.36959 4.03027 5.74512C3.99894 6.12858 3.99805 6.62214 3.99805 7.33301V12.666C3.99805 13.3767 3.99898 13.8705 4.03027 14.2539C4.06094 14.6292 4.11788 14.8411 4.19824 14.999C4.37412 15.3442 4.65487 15.6258 5 15.8018C5.15795 15.8822 5.36972 15.939 5.74512 15.9697C6.12859 16.0011 6.6221 16.001 7.33301 16.001H12.666C13.3767 16.001 13.8705 16.001 14.2539 15.9697C14.6292 15.9391 14.8411 15.8821 14.999 15.8018C15.3443 15.6258 15.6258 15.3443 15.8018 14.999C15.8821 14.8411 15.9391 14.6292 15.9697 14.2539C16.001 13.8705 16.001 13.3767 16.001 12.666V7.33301C16.001 6.62213 16.0011 6.12858 15.9697 5.74512C15.939 5.36976 15.8822 5.15795 15.8018 5C14.8411 4.11787 14.6292 4.06094 14.2549 4.03027C13.871 3.99898 13.3767 3.99805 12.667 3.99805H7.33301Z" fill="currentColor" /></svg>`
)}`
const GIT_ICON_MODIFIED = `data:image/svg+xml,${encodeURIComponent(
  `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 8.33301C10.9205 8.33301 11.667 9.07953 11.667 10C11.667 10.9205 10.9205 11.667 10 11.667C9.07961 11.6669 8.334 10.9204 8.33399 10C8.33399 9.07958 9.0796 8.3331 10 8.33301Z" fill="currentColor" /><path d="M12.667 2.66797C13.3558 2.66797 13.9132 2.66734 14.3633 2.7041C14.8211 2.74154 14.2279 2.82079 15.6045 3.0127C16.1998 3.31614 16.6839 3.8011 16.9873 4.39649C17.1791 4.77306 17.2585 5.17899 17.2959 5.63672C17.3327 6.08689 17.332 6.64406 17.332 7.33301V12.666C17.332 13.3548 17.3326 13.9122 17.2959 14.3623C17.2585 14.8201 17.1791 15.2269 16.9873 15.6035C16.684 16.1987 16.1996 16.6829 15.6045 16.9863C15.2279 17.1782 14.8211 17.2575 14.3633 17.2949C13.9132 17.3317 13.3558 17.3311 12.667 17.3311H7.33399C6.64513 17.3311 6.08786 17.3317 5.6377 17.2949C5.17997 17.2575 4.77403 17.1781 4.39746 16.9863C3.80197 16.6829 3.31712 16.199 3.01367 15.6035C2.82172 15.2268 2.7425 14.8203 2.70508 14.3623C2.66833 13.9121 2.66895 13.3549 2.66895 12.666V7.33301C2.66895 6.64406 2.6683 6.08689 2.70508 5.63672C2.7425 5.17907 2.82191 4.77301 3.01367 4.39649C3.31713 3.80115 3.80208 3.31606 4.39746 3.0127C4.77393 2.82108 5.18011 2.7415 5.6377 2.7041C6.08785 2.66736 6.64515 2.66797 7.33399 2.66797H12.667ZM7.33399 3.99805C6.62326 3.99805 6.12954 3.99898 5.74609 4.03027C5.37079 4.06094 5.15893 4.11787 5.00098 4.19824C4.65588 4.37409 4.37516 4.65496 4.19922 5C4.11874 5.15796 4.06196 5.36963 4.03125 5.74512C3.99992 6.12858 3.99902 6.62213 3.99902 7.33301V12.666C3.99902 13.3767 3.99996 13.8705 4.03125 14.2539C4.06193 14.6295 4.11878 14.841 4.19922 14.999C4.37515 15.3443 4.6557 15.6258 5.00098 15.8018C5.15894 15.8821 5.37074 15.9391 5.74609 15.9697C6.12955 16.001 6.62323 16.001 7.33399 16.001H12.667C13.3776 16.001 13.8715 16.001 14.2549 15.9697C14.6299 15.939 14.8421 15.8821 15 15.8018C15.345 15.6258 15.6269 15.3441 15.8027 14.999C15.883 14.8411 15.9401 14.6289 15.9707 14.2539C16.002 13.8705 16.002 13.3767 16.002 12.666V7.33301C16.002 6.62213 16.002 6.12858 15.9707 5.74512C15.94 5.36972 15.8832 5.15795 15.8027 5C15.6269 4.65483 15.3451 4.37417 15 4.19824C14.8421 4.11782 14.6302 4.06097 14.2549 4.03027C13.871 3.99897 13.3776 3.99805 12.667 3.99805H7.33399Z" fill="currentColor" /></svg>`
)}`

/** Codex N1a 的 unsafeCSS(逐行照搬;`${H}` = 表面色) */
function buildUnsafeCSS(surface: 'main' | 'dropdown', extra?: string): string {
  const bg =
    surface === 'dropdown'
      ? 'var(--color-token-dropdown-background)'
      : 'var(--color-token-main-surface-primary)'
  return `
      :host {
        --trees-bg-override: ${bg};
        --trees-bg-muted-override: var(--color-token-list-hover-background);
        --trees-border-color-override: var(--color-token-border);
        --trees-fg-override: var(--color-token-foreground);
        --trees-font-size-override: 13px;
        --trees-focus-ring-color-override: var(--color-token-list-focus-outline);
        --trees-git-added-color-override: var(--color-token-git-decoration-added-resource-foreground);
        --trees-git-deleted-color-override: var(--color-token-git-decoration-deleted-resource-foreground);
        --trees-git-ignored-color-override: var(--color-token-git-decoration-ignored-resource-foreground);
        --trees-git-lane-width-override: 20px;
        --trees-git-modified-color-override: var(--color-token-git-decoration-modified-resource-foreground);
        --trees-git-renamed-color-override: var(--color-token-git-decoration-renamed-resource-foreground);
        --trees-git-untracked-color-override: var(--color-token-git-decoration-untracked-resource-foreground);
        --trees-item-padding-x-override: 6px;
        --trees-item-margin-x-override: 0px;
        --trees-level-gap-override: 0px;
        --trees-padding-inline-override: 0px;
        --trees-scrollbar-gutter-override: 0px;
        --trees-scrollbar-gutter-measured: 0px;
        --trees-selected-bg-override: var(--color-token-list-active-selection-background);
        --trees-selected-fg-override: var(--color-token-list-active-selection-foreground);
        --trees-item-row-gap-override: 10px;
      }

      [data-file-tree-sticky-overlay-content='true'],
      [data-file-tree-sticky-row='true'] {
        background-color: ${bg};
      }

      [data-file-tree-virtualized-scroll='true'] {
        scrollbar-gutter: auto;
      }

      [role="treeitem"] {
        cursor: var(--cursor-interaction) !important;
      }

      [role="treeitem"] * {
        cursor: var(--cursor-interaction) !important;
      }

      [data-item-type='file']:has([data-item-section='content']:empty) {
        display: none;
      }

      [data-item-git-status] > [data-item-section='content'] {
        color: inherit;
      }

      [data-item-git-status='added'] > [data-item-section='git'] > span,
      [data-item-git-status='deleted'] > [data-item-section='git'] > span,
      [data-item-git-status='modified'] > [data-item-section='git'] > span {
        font-size: 0;
      }

      [data-item-git-status='added'] > [data-item-section='git'] > span::before,
      [data-item-git-status='deleted'] > [data-item-section='git'] > span::before,
      [data-item-git-status='modified'] > [data-item-section='git'] > span::before {
        width: 20px;
        height: 20px;
        background-color: currentColor;
        content: '';
        mask: var(--base-file-tree-git-status-icon) center / contain no-repeat;
      }

      [data-item-git-status='added'] > [data-item-section='git'] > span::before {
        --base-file-tree-git-status-icon: url("${GIT_ICON_ADDED}");
      }

      [data-item-git-status='deleted'] > [data-item-section='git'] > span::before {
        --base-file-tree-git-status-icon: url("${GIT_ICON_DELETED}");
      }

      [data-item-git-status='modified'] > [data-item-section='git'] > span::before {
        --base-file-tree-git-status-icon: url("${GIT_ICON_MODIFIED}");
      }

      /* Filter out @pierre/truncate's subpixel one-line overflow false positives. */
      @container measure (height <= calc(1lh + 1px)) {
        [data-truncate-marker] {
          opacity: 0;
        }
      }

      ${extra ?? ''}
    `
}

/* ---- Codex 的模型辅助函数(H1a/U1a/W1a/G1a/K1a/q1a) ---- */

type Model = FileTreeModel

/** Codex `G1a`:shadow 里的滚动容器 */
function scrollElementOf(model: Model): HTMLElement | null {
  return (
    model
      .getFileTreeContainer()
      ?.shadowRoot?.querySelector(`[data-file-tree-virtualized-scroll='true']`) ?? null
  )
}

/** Codex `H1a`:从模型读当前展开的目录(paths 里以 `/` 结尾的项) */
function readExpandedPaths(model: Model, paths: readonly string[]): string[] {
  const expanded: string[] = []
  for (const p of paths) {
    if (!p.endsWith('/')) continue
    const dir = p.slice(0, -1)
    const item = model.getItem(dir)
    if (item != null && item.isDirectory() && (item as FileTreeDirectoryHandle).isExpanded())
      expanded.push(dir)
  }
  return expanded
}

/** Codex `U1a`:同步单选 */
function syncSelection(model: Model, selectedPath: string | null | undefined): void {
  const selected = model.getSelectedPaths()
  if (selectedPath == null) {
    for (const p of selected) model.getItem(p)?.deselect()
    return
  }
  if (!(selected.length === 1 && selected[0] === selectedPath)) {
    for (const p of selected) model.getItem(p)?.deselect()
    model.getItem(selectedPath)?.select()
  }
}

/** 右键点击的文件路径(Codex `T1a`,经 composedPath 穿 shadow) */
function pathFromContextMenuEvent(e: MouseEvent): string | null {
  for (const t of e.nativeEvent.composedPath()) {
    if (!(t instanceof Element) || t.getAttribute('data-item-type') !== 'file') continue
    const p = t.getAttribute('data-item-path')
    if (p) return p
  }
  return null
}

/** 双击打开的文件路径(Codex `Qfo`:目录以 `/` 结尾,排除) */
function filePathFromDoubleClick(e: MouseEvent): string | null {
  const p = pathFromContextMenuEvent(e)
  return p == null || p.endsWith('/') ? null : p
}

export interface FileTreeViewProps {
  /** 扁平路径(目录以 `/` 结尾);也可传 {displayPath, path}(搜索结果) */
  paths: readonly (string | { displayPath: string; path: string })[]
  /** 项目 id(右键菜单的 Copy file contents 读文件需要) */
  projectId: string
  /** 项目根绝对路径(右键菜单的 open in / copy path 需要) */
  rootAbsolutePath?: string | null
  selectedPath?: string | null
  initialExpandedPaths?: readonly string[]
  initialScrollTop?: number
  revealSelectedPath?: boolean
  revealSelectedPathScrollOffset?: 'top' | 'center' | 'nearest'
  /** 变化时整体 reset(Codex `resetKey`,搜索态用它) */
  resetKey?: string
  flattenEmptyDirectories?: boolean
  itemHeight?: number
  surface?: 'main' | 'dropdown'
  onSelectionChange?: (selectedPaths: readonly string[]) => void
  onExpandedPathsChange?: (expandedPaths: string[]) => void
  onDoubleClickFile?: (path: string) => void
  onStateChange?: (state: {
    expandedPaths: string[]
    scrollTop: number
    selectedPath: string | null
  }) => void
}

export function FileTreeView({
  paths,
  projectId,
  rootAbsolutePath = null,
  selectedPath = null,
  initialExpandedPaths,
  initialScrollTop = 0,
  revealSelectedPath = false,
  revealSelectedPathScrollOffset = 'nearest',
  resetKey,
  flattenEmptyDirectories = false,
  itemHeight = DEFAULT_ITEM_HEIGHT,
  surface = 'main',
  onSelectionChange,
  onExpandedPathsChange,
  onDoubleClickFile,
  onStateChange
}: FileTreeViewProps): React.JSX.Element {
  // Codex N1a:paths 统一成字符串(displayPath 优先)
  const treePaths = useMemo(
    () => paths.map((p) => (typeof p === 'string' ? p : p.displayPath)),
    [paths]
  )

  const { targets } = useOpenTargets()

  /*
   * 状态回流 refs(Codex N1a 的 G/te/ne):expandedPaths/scrollTop/selectedPath
   * 都在 ref 里跟随,onStateChange 时一次性读出。
   */
  const expandedRef = useRef<string[]>([...(initialExpandedPaths ?? [])])
  const scrollTopRef = useRef(initialScrollTop)
  const selectedRef = useRef<string | null>(selectedPath ?? null)
  // 记录已生效的 reveal 请求,避免重复滚动(Codex ee ref)
  const revealedRef = useRef<{ path: string; scrollOffset: string } | null>(null)
  const pathsRef = useRef(treePaths)

  const emitStateChange = useRef(() => {})

  // refs 在提交后同步(Codex 在渲染期写 —— React Compiler 容忍,WS lint 要求提交后)
  useEffect(() => {
    pathsRef.current = treePaths
    emitStateChange.current = (): void => {
      onStateChange?.({
        expandedPaths: expandedRef.current,
        scrollTop: scrollTopRef.current,
        selectedPath: selectedRef.current
      })
    }
  })

  /* Codex `j` = bK(yK()) —— colorScheme 跟随主题(shadow DOM 的滚动条配色要) */
  const colorScheme = useSyncExternalStore(subscribeTheme, getTheme)

  // 选中回流 —— Codex 用 `jh`(useEffectEvent)包装,模型回调永远读最新 prop;
  // WS 手写同义的 latest-ref 模式(模型只建一次,回调引用必须稳定且不过期)。
  const onSelectionChangeRef = useRef(onSelectionChange)
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange
  })
  const handleSelectionChange = useCallback((selected: readonly string[]) => {
    selectedRef.current = selected[0] ?? null
    onSelectionChangeRef.current?.(selected)
    emitStateChange.current()
  }, [])

  /*
   * Codex `g1a`(384133):模型只建一次(useState 初始化);
   * effect setup 时先清掉挂起的 cleanUp 定时器,cleanup 时延迟 1ms cleanUp ——
   * StrictMode 重放的 cleanup→setup 会取消掉误杀的 cleanUp,模型存活;
   * 真卸载时 1ms 后模型才被销毁。顺序不要改(setup 清、cleanup 排)。
   */
  /* eslint-disable react-hooks/refs -- Codex `g1a` 原型就是 useState 里建模型,
     回调里的 ref 访问发生在包事件调用时,不是渲染期;初始化器的引用读取无法过这条规则 */
  const [model] = useState(
    () =>
      new FileTreeModel({
        paths: treePaths,
        fileTreeSearchMode: 'hide-non-matches',
        flattenEmptyDirectories,
        initialExpandedPaths,
        initialSelectedPaths: selectedPath != null ? [selectedPath] : undefined,
        itemHeight,
        search: false,
        stickyFolders: true,
        unsafeCSS: buildUnsafeCSS(surface),
        onSelectionChange: handleSelectionChange
      })
  )
  /* eslint-enable react-hooks/refs */
  // Codex g1a 的 `n.current = {timeout, model}`;lint 要求 ref 初始值不引用 state,懒建
  const cleanupRef = useRef<{ timeout: ReturnType<typeof setTimeout> | null } | null>(null)
  useEffect(() => {
    const entry = (cleanupRef.current ??= { timeout: null })
    if (entry.timeout != null) {
      clearTimeout(entry.timeout)
      entry.timeout = null
    }
    return () => {
      entry.timeout = setTimeout(() => model.cleanUp(), 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Codex:paths/resetKey 变化 → resetPaths(带快照去重) */
  const resetSnapshotRef = useRef<{
    model: Model
    resetKey: string | undefined
    treePaths: string[]
    initialExpandedPaths: string[]
  } | null>(null)
  useEffect(() => {
    const prev = resetSnapshotRef.current
    const samePaths =
      prev != null &&
      prev.treePaths.length === treePaths.length &&
      prev.treePaths.every((p, i) => p === treePaths[i])
    const sameExpanded =
      prev != null &&
      prev.initialExpandedPaths.length === (initialExpandedPaths?.length ?? 0) &&
      prev.initialExpandedPaths.every((p, i) => p === initialExpandedPaths?.[i])
    if (
      prev != null &&
      prev.model === model &&
      prev.resetKey === resetKey &&
      samePaths &&
      sameExpanded
    ) {
      return
    }
    const modelChanged = prev?.model !== model || prev?.resetKey !== resetKey
    resetSnapshotRef.current = {
      model,
      resetKey,
      treePaths: [...treePaths],
      initialExpandedPaths: [...(initialExpandedPaths ?? [])]
    }
    expandedRef.current = [...(initialExpandedPaths ?? [])]
    model.resetPaths(treePaths, { initialExpandedPaths })
    // 模型换/reset 后,若已选路径不存在则清掉 reveal 记录(Codex:ee.current = null)
    const revealed = revealedRef.current?.path
    if (modelChanged || (revealed != null && model.getItem(revealed) == null)) {
      revealedRef.current = null
    }
  }, [model, resetKey, treePaths, initialExpandedPaths])

  /* Codex:initialScrollTop 恢复(rAF 重试,直到滚动容器出现) */
  useEffect(() => {
    let raf: number | null = null
    let attempts = 0
    const tick = (): void => {
      raf = null
      const el = scrollElementOf(model)
      if (el == null) {
        if (attempts++ < SCROLL_RESTORE_MAX_FRAMES) raf = requestAnimationFrame(tick)
        return
      }
      el.scrollTop = Math.max(0, initialScrollTop)
    }
    if (initialScrollTop > 0 && !(revealSelectedPath && selectedPath != null)) {
      scrollTopRef.current = initialScrollTop
      tick()
    } else {
      scrollTopRef.current = 0
    }
    return () => {
      if (raf != null) cancelAnimationFrame(raf)
    }
  }, [model, initialScrollTop, revealSelectedPath, selectedPath])

  /* Codex:选中同步 + reveal 滚动 */
  useEffect(() => {
    selectedRef.current = selectedPath ?? null
    syncSelection(model, selectedPath)
    if (!revealSelectedPath || selectedPath == null) {
      revealedRef.current = null
      return
    }
    if (
      revealedRef.current?.path === selectedPath &&
      revealedRef.current.scrollOffset === revealSelectedPathScrollOffset
    ) {
      return
    }
    if (model.getItem(selectedPath) == null) return
    model.scrollToPath(selectedPath, { offset: revealSelectedPathScrollOffset })
    revealedRef.current = { path: selectedPath, scrollOffset: revealSelectedPathScrollOffset }
  }, [model, resetKey, revealSelectedPath, revealSelectedPathScrollOffset, selectedPath, treePaths])

  /* Codex:模型订阅 → expandedPaths 回流 */
  useEffect(() => {
    return model.subscribe(() => {
      scrollTopRef.current = scrollElementOf(model)?.scrollTop ?? scrollTopRef.current
      const expanded = readExpandedPaths(model, pathsRef.current)
      expandedRef.current = expanded
      onExpandedPathsChange?.(expanded)
      emitStateChange.current()
    })
  }, [model, onExpandedPathsChange])

  /* Codex:滚动容器挂 scroll 监听 → scrollTop 回流 */
  useEffect(() => {
    let raf: number | null = null
    let attempts = 0
    let remove: (() => void) | null = null
    const tick = (): void => {
      raf = null
      const el = scrollElementOf(model)
      if (el == null) {
        if (attempts++ < SCROLL_RESTORE_MAX_FRAMES) raf = requestAnimationFrame(tick)
        return
      }
      const onScroll = (): void => {
        scrollTopRef.current = el.scrollTop
        emitStateChange.current()
      }
      el.addEventListener('scroll', onScroll, { passive: true })
      remove = () => el.removeEventListener('scroll', onScroll)
    }
    tick()
    return () => {
      if (raf != null) cancelAnimationFrame(raf)
      remove?.()
    }
  }, [model])

  /* 右键点中的文件(上下文菜单的目标;Codex U ref + V1a) */
  const contextPathRef = useRef<string | null>(null)
  const buildContextItems = (): AppContextMenuItem[] => {
    const clicked = contextPathRef.current
    if (clicked == null) return []
    const absPath = rootAbsolutePath != null ? `${rootAbsolutePath}/${clicked}` : null
    const primary = resolvePrimaryTarget(targets)
    const items: AppContextMenuItem[] = []
    // Codex `jXi`:Open in <primary> + Open with ▸(子菜单含全部可见目标)
    if (primary != null && absPath != null) {
      items.push({
        id: 'open-in-primary',
        label: `Open in ${primary.label}`,
        iconFile: primary.iconFile,
        onSelect: () => openInTarget(primary, absPath, { persistPreferred: false })
      })
      items.push({
        id: 'open-in-targets',
        label: 'Open with',
        submenu: targets.map((t) => ({
          id: `open-in-target-${t.target}`,
          label: t.label,
          iconFile: t.iconFile,
          onSelect: () => openInTarget(t, absPath, { persistPreferred: false })
        }))
      })
      items.push({ id: 'open-in-separator', type: 'separator' })
    }
    items.push({
      id: 'copy-path',
      label: 'Copy path',
      onSelect: () => void navigator.clipboard.writeText(clicked)
    })
    items.push({
      id: 'copy-contents',
      label: 'Copy file contents',
      onSelect: () => {
        void fileService
          .readFile(projectId, clicked)
          .then((content) => navigator.clipboard.writeText(content))
      }
    })
    if (absPath != null) {
      items.push({
        id: 'reveal-path',
        label: 'Reveal in Finder',
        onSelect: () => openInTarget({ target: 'fileManager' }, absPath)
      })
    }
    return items
  }

  return (
    <AppContextMenu awaitBeforeOpen={false} getItems={buildContextItems}>
      <FileTree
        model={model}
        data-tab-preview-pin-exempt="true"
        onContextMenu={(e: MouseEvent) => {
          contextPathRef.current = pathFromContextMenuEvent(e)
        }}
        onDoubleClick={(e: MouseEvent) => {
          const p = filePathFromDoubleClick(e)
          if (p != null) onDoubleClickFile?.(p)
        }}
        style={{
          backgroundColor: 'var(--color-token-main-surface-primary)',
          color: 'var(--color-token-foreground)',
          colorScheme,
          width: '100%'
        }}
      />
    </AppContextMenu>
  )
}
