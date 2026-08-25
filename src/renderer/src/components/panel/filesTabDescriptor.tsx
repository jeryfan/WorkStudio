import type {
  AppShellTabDescriptorInput,
  AppShellTabPanelController,
  AppShellTabRenderProps
} from '../../state/AppShellContext'
import { fileService } from '../../services'
import { fileTabId } from '../../state/AppShellContext'
import { baseName, fileDisplayPath } from '../../utils/workspacePath'
import type { AppContextMenuItem } from '../menu/AppContextMenu'
import { fileTypeIcon } from '../icons/fileTypes/fileTypeIcon'
import { FileTab } from './file/FileTab'
import {
  listOpenTargets,
  openInTarget,
  resolvePrimaryTarget,
  type OpenTarget
} from './file/openTargets'
import { hostServices } from '../../host/appHost'
import { reviewFileSourceOf, type ReviewFileSource } from '../../services/file/openFilesWatcher'

/**
 * Files tab 状态 —— Codex 的 file tab defaultState 是 `o$i = { scrollLeft: null,
 * scrollTop: null }`(路径在 **props** 里,不在 state;换文件 = 开新 tab,不是改 state)。
 */
export interface FilesTabState {
  scrollLeft: number | null
  scrollTop: number | null
}

/**
 * renderPanel 额外收到的 props —— Codex `HY` 的
 * `props: {cwd, path, hostId, tabId, workspaceRoot, onSelectFile, initialLine, initialEndLine}`
 * (WS 单 host,不带 hostId/tabId)。
 */
export interface FilesTabRenderProps extends AppShellTabRenderProps<FilesTabState> {
  /** **绝对路径**;null = 未选择(tabId 即 `file:local:`,标题 "Open file") */
  path: string | null
  /** Codex `HY` 的 `cwd` prop(会话工作目录)—— 面包屑/显示路径的基准之一 */
  cwd: string | null
  /** Codex `HY` 的 `workspaceRoot` prop —— 绝对路径 */
  workspaceRoot: string
  /** Codex `HY` 的 `initialLine`/`initialEndLine` props:打开后要露出的行 */
  initialLine?: number
  initialEndLine?: number
  /**
   * 在文件树里选中文件(Codex `onSelectFile`):**绝对路径**,打开该文件的 tab;
   * 本 tab 是空文件 tab(path == null)时顺手关掉自己(Codex:`t ?? closeTab(b)`)。
   */
  onSelectFile(path: string, opts?: { isPreview?: boolean }): void
}

/*
 * 文件 tab 的右键菜单项 —— Codex `KXi`(app-initial:307031)的移植:
 * [Open in <首选>] + [Open with ▸ 目标子菜单] + separator +
 * [Save as…](宿主 saveCopy)+ Copy path + Copy file contents + Reveal in Finder。
 * (Codex 另有的 View file/View in browser 项是聊天里文件引用用的,tab 自身不带。)
 *
 * Codex 侧是异步项(先 fetchQuery 取 open targets),WS 同样是 Promise。
 */
async function fileTabContextMenuItems(path: string): Promise<AppContextMenuItem[]> {
  const targets: OpenTarget[] = await listOpenTargets()
  // Codex `KXi` 的 `l` 就是 tab 的 path(绝对路径),Copy path 复制的也是它
  const absPath = path
  const items: AppContextMenuItem[] = []
  {
    const primary = resolvePrimaryTarget(targets)
    if (primary != null) {
      items.push({
        id: 'workspace-file-open-primary',
        label: `Open in ${primary.label}`,
        iconFile: primary.iconFile,
        onSelect: () => openInTarget(primary, absPath, { persistPreferred: false })
      })
      items.push({
        id: 'workspace-file-open-targets',
        label: 'Open with',
        submenu: targets.map((t) => ({
          id: `workspace-file-open-target-${t.target}`,
          label: t.label,
          iconFile: t.iconFile,
          onSelect: () => openInTarget(t, absPath, { persistPreferred: false })
        }))
      })
      items.push({ id: 'workspace-file-open-target-separator', type: 'separator' })
    }
    items.push({
      id: 'workspace-file-save-as',
      label: 'Save as…',
      onSelect: () => void hostServices?.workspaceFiles.saveCopy(absPath, baseName(path))
    })
  }
  items.push({
    id: 'workspace-file-copy-path',
    label: 'Copy path',
    onSelect: () => void navigator.clipboard.writeText(path)
  })
  items.push({
    id: 'workspace-file-copy-contents',
    label: 'Copy file contents',
    onSelect: () => {
      void fileService.readFile(path).then((content) => navigator.clipboard.writeText(content))
    }
  })
  items.push({
    id: 'workspace-file-reveal-path',
    label: 'Reveal in Finder',
    onSelect: () => openInTarget({ target: 'fileManager' }, absPath)
  })
  return items
}

/**
 * tab → review file source(Codex `u$i`)。
 *
 * Codex 读的是描述符的 `props.path`/`props.hostId`;WS 的描述符没有 props 袋子
 * (路径在闭包里),但 tabId 就是 `fileTabId(path)` = `file:<hostId>:<绝对路径>`,
 * 同一份信息 —— 解析它即可,格式的唯一来源仍是 `fileTabId`。
 *
 * Codex 的 `refreshMode` 只有 artifact 类型是 manual,其余 auto;WS 没有 artifact tab。
 */
export function reviewFileSourceFromTab(tab: { kind?: string; tabId: string }): ReviewFileSource[] {
  if (tab.kind !== 'workspaceFile:local') return []
  const path = tab.tabId.slice('file:local:'.length)
  return path === '' ? [] : [reviewFileSourceOf(path)]
}

/**
 * 打开文件 tab —— Codex `HY` 的副作用部分(描述符之外的那些):
 *
 * - `t == null && S == null && $Un(e, !0, {animate:!1})`:**新开空文件 tab 时强制
 *   展开文件树**(树的开合是全局持久化值,上次收起过就不会自己回来,否则点 Files
 *   得到的是一个连树都没有的空面板 —— 实测撞到过);
 * - `f && x.resetTabState(e, b)`(`f = line != null || endLine != null`):带行号
 *   再打开同一个文件 tab 要重挂载,否则露出行不会重新生效。
 *
 * 打开中文件的 `fs/watch` 登记不在这里,由 `OpenFileTabsSync` 从 tab 列表派生
 * (Codex 是在 `HY`/`onClose` 里 imperative 调 `v$i`)。
 */
export function openFilesTab(
  controller: AppShellTabPanelController,
  {
    path,
    cwd,
    workspaceRoot,
    line,
    endLine,
    isPreview,
    setFileTreeOpen
  }: {
    path: string | null
    cwd: string | null
    workspaceRoot: string
    line?: number
    endLine?: number
    isPreview?: boolean
    /** 只有开空文件 tab 的调用点需要(它才会强制展开树) */
    setFileTreeOpen?: (open: boolean) => void
  }
): void {
  const descriptor = createFilesTabDescriptor(controller, {
    path,
    cwd,
    workspaceRoot,
    line,
    endLine
  })
  const tabId = fileTabId(path ?? '')
  const existing = controller.tabs.some((tab) => tab.tabId === tabId)
  controller.openTab(isPreview == null ? descriptor : { ...descriptor, isPreview })
  /*
   * Codex `HY`:`f = resetTabState = line != null || endLine != null`,
   * `f && x.resetTabState(e, b)` —— 同一个文件 tab 已开着时,带行号再打开要重挂载,
   * 否则 revealLine 不会重新生效(滚动位置也按 resetState 收敛)。
   */
  if (line != null || endLine != null) controller.resetTabState(tabId)
  if (path == null && !existing) setFileTreeOpen?.(true)
}

/**
 * Files tab 描述符工厂 —— 对齐 Codex `HY`(app-initial:427097):
 *
 * - tabId:`file:local:<path>`(空 path 即 `file:local:`,实测;`cCo`)。
 * - kind:`workspaceFile:local`(`s$i + hostId`,hostId 恒 'local')——
 *   决定 activeTabReactKey 的基底,同 kind 的 file tab 之间切换不重挂载面板。
 * - title:无 path → "Open file"(`review.fileSource.browser.tabTitle`);
 *   有 path → 文件名(Codex `Zp(t)`)。
 * - tooltip:有 path 时是显示路径(Codex `t$i`);无 path 时是 "Open file"。
 * - icon:按文件名取 Codex `MV` 图标(className `icon-xs shrink-0`)。
 * - contextMenuItems:有 path 时是 KXi 组(异步);无 path 时无(Codex:
 *   `t == null ? void 0 : (e) => YXi(...)`)。
 * - isPreview 由调用方给:launcher/「+」打开的不是预览;会话文件引用(InlineAnchor)
 *   打开的是预览(Codex HY 的 isPreview 入参语义)。
 *
 * controller 在创建时捕获(Codex 的 onSelectFile 闭包同理),openTab/closeTab
 * 都是稳定引用,无过期闭包问题。
 */
export function createFilesTabDescriptor(
  controller: AppShellTabPanelController,
  {
    path,
    cwd,
    workspaceRoot,
    line,
    endLine
  }: {
    /** **绝对**文件路径;null = 空文件 tab(Codex `HY` 的 `t == null` 分支) */
    path: string | null
    /** 会话工作目录(Codex `C = y$i(scope)`) */
    cwd: string | null
    /** workspace root 绝对路径(Codex `HY` 的 workspaceRoot 入参) */
    workspaceRoot: string
    /** Codex `HY` 的 `line`/`endLine` 入参(`src/a.ts:12` 这类引用带过来) */
    line?: number
    endLine?: number
  }
): AppShellTabDescriptorInput<FilesTabState> {
  // Codex:`w = 'Open file'`;`title: t == null ? w : (g ?? Zp(t))`
  const title = path == null ? 'Open file' : baseName(path)
  const Icon = fileTypeIcon(path ?? undefined)
  return {
    // Codex `cCo(path, hostId)`:`file:${hostId}:${path ?? ''}`
    tabId: fileTabId(path ?? ''),
    kind: 'workspaceFile:local',
    title,
    // Codex:`E = t == null ? w : t$i({cwd, path, workspaceRoot})`
    tooltip: path == null ? 'Open file' : fileDisplayPath({ cwd, path, workspaceRoot }),
    // Codex:`icon: s ?? createElement(MV(t), { className: 'icon-xs shrink-0' })`
    icon: <Icon className="icon-xs shrink-0" />,
    defaultState: () => ({ scrollLeft: null, scrollTop: null }),
    contextMenuItems: path == null ? undefined : () => fileTabContextMenuItems(path),
    renderPanel: (props) => (
      <FileTab
        {...props}
        path={path}
        cwd={cwd}
        workspaceRoot={workspaceRoot}
        initialLine={line}
        initialEndLine={endLine}
        onSelectFile={(nextPath, opts) => {
          // Codex 的 onSelectFile 就是再调一次 HY
          openFilesTab(controller, {
            path: nextPath,
            cwd,
            workspaceRoot,
            // Codex:`isPreview: t != null && r?.isPreview` —— 当前 tab 有路径时按树的
            // 意图(单击 = 预览);空 tab 里选的文件直接转正
            isPreview: path != null && opts?.isPreview === true
          })
          if (path == null) props.onClose()
        }}
      />
    )
  }
}
