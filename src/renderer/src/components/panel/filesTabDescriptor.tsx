import type {
  AppShellTabDescriptorInput,
  AppShellTabPanelController,
  AppShellTabRenderProps
} from '../../state/AppShellContext'
import { fileTabId } from '../../state/AppShellContext'
import { baseName } from '../../utils/workspacePath'
import { FileGlyph } from './file/FileGlyph'
import { FileTab } from './file/FileTab'

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

/**
 * Files tab 描述符工厂 —— 对齐 Codex `HY`(app-initial:427097):
 *
 * - tabId:`file:local:<path>`(空 path 即 `file:local:`,实测;`cCo`)。
 * - kind:`workspaceFile:local`(`s$i + hostId`,hostId 恒 'local')——
 *   决定 activeTabReactKey 的基底,同 kind 的 file tab 之间切换不重挂载面板。
 * - title:无 path → "Open file"(`review.fileSource.browser.tabTitle`);
 *   有 path → 文件名(Codex `Zp(t)`)。
 * - tooltip:有 path 时是显示路径(Codex `t$i`);无 path 时是 "Open file"。
 * - icon:按文件名取 glyph(Codex `MV(path)`,className `icon-xs shrink-0`)。
 * - isPreview 由调用方给:launcher/「+」打开的不是预览;会话文件引用(InlineAnchor)
 *   打开的是预览(Codex HY 的 isPreview 入参语义)。
 *
 * controller 在创建时捕获(Codex 的 onSelectFile 闭包同理),openTab/closeTab
 * 都是稳定引用,无过期闭包问题。
 */
export function createFilesTabDescriptor(
  controller: AppShellTabPanelController,
  path = '',
  projectId?: string
): AppShellTabDescriptorInput<FilesTabState> {
  const title = path === '' ? 'Open file' : baseName(path)
  return {
    tabId: fileTabId(path),
    kind: 'workspaceFile:local',
    title,
    tooltip: path === '' ? 'Open file' : path,
    icon: <FileGlyph name={title} />,
    defaultState: () => ({ scrollLeft: null, scrollTop: null }),
    renderPanel: (props) => (
      <FileTab
        {...props}
        path={path}
        projectId={projectId}
        onSelectFile={(nextPath, opts) => {
          controller.openTab({
            ...createFilesTabDescriptor(controller, nextPath, projectId),
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
