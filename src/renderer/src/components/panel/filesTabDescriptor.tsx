import type {
  AppShellTabDescriptorInput,
  AppShellTabPanelController,
  AppShellTabRenderProps
} from '../../state/AppShellContext'
import { fileService } from '../../services'
import { fileTabId } from '../../state/AppShellContext'
import { baseName } from '../../utils/workspacePath'
import type { AppContextMenuItem } from '../menu/AppContextMenu'
import { fileTypeIcon } from '../icons/fileTypes/fileTypeIcon'
import { FileTab } from './file/FileTab'
import { openInTarget, resolvePrimaryTarget, type OpenTarget } from './file/openTargets'

/**
 * Files tab 状态 —— Codex 的 file tab defaultState 是 `o$i = { scrollLeft: null,
 * scrollTop: null }`(路径在 **props** 里,不在 state;换文件 = 开新 tab,不是改 state)。
 */
export interface FilesTabState {
  scrollLeft: number | null
  scrollTop: number | null
}

/** renderPanel 额外收到的 props(Codex `HY` 的 `props: {cwd, path, hostId, tabId, workspaceRoot, onSelectFile, …}` 的 WS 版) */
export interface FilesTabRenderProps extends AppShellTabRenderProps<FilesTabState> {
  /** 项目内路径;'' = 未选择(tabId 即 `file:local:`,标题 "Open file") */
  path: string
  projectId: string | undefined
  /**
   * 在文件树里选中文件(Codex `onSelectFile`):打开该文件的 tab;
   * 本 tab 是空文件 tab(path === '')时顺手关掉自己(Codex:`t ?? closeTab(b)`)。
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
async function fileTabContextMenuItems(
  projectId: string | undefined,
  path: string,
  rootAbsolutePath: string | null
): Promise<AppContextMenuItem[]> {
  if (projectId == null || path === '') return []
  const targets: OpenTarget[] = await window.codexBridge.openIn.listTargets().catch(() => [])
  const absPath = rootAbsolutePath != null ? `${rootAbsolutePath}/${path}` : null
  const items: AppContextMenuItem[] = []
  if (absPath != null) {
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
      onSelect: () => void window.codexBridge.openIn.saveCopy(absPath, baseName(path))
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
      void fileService
        .readFile(projectId, path)
        .then((content) => navigator.clipboard.writeText(content))
    }
  })
  if (absPath != null) {
    items.push({
      id: 'workspace-file-reveal-path',
      label: 'Reveal in Finder',
      onSelect: () => openInTarget({ target: 'fileManager' }, absPath)
    })
  }
  return items
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
  path = '',
  projectId?: string,
  rootAbsolutePath?: string
): AppShellTabDescriptorInput<FilesTabState> {
  const title = path === '' ? 'Open file' : baseName(path)
  const Icon = fileTypeIcon(path === '' ? undefined : path)
  return {
    tabId: fileTabId(path),
    kind: 'workspaceFile:local',
    title,
    tooltip: path === '' ? 'Open file' : path,
    // Codex:`icon: s ?? createElement(MV(t), { className: 'icon-xs shrink-0' })`
    icon: <Icon className="icon-xs shrink-0" />,
    defaultState: () => ({ scrollLeft: null, scrollTop: null }),
    contextMenuItems:
      path === ''
        ? undefined
        : () => fileTabContextMenuItems(projectId, path, rootAbsolutePath ?? null),
    renderPanel: (props) => (
      <FileTab
        {...props}
        path={path}
        projectId={projectId}
        onSelectFile={(nextPath, opts) => {
          controller.openTab({
            ...createFilesTabDescriptor(controller, nextPath, projectId, rootAbsolutePath),
            // Codex:`isPreview: t != null && r?.isPreview` —— 当前 tab 有路径时按树的
            // 意图(单击 = 预览);空 tab 里选的文件直接转正
            isPreview: path !== '' && opts?.isPreview === true
          })
          if (path === '') props.onClose()
        }}
      />
    )
  }
}
