import { useMemo } from 'react'
import type { AppShellTabPanelController } from '../../state/AppShellContext'
import { useWorkspace } from '../../state/WorkspaceContext'
import { useChatRuntime } from '../../state/ChatRuntimeContext'
import { BrowserGlobeIcon, FilesFolderIcon } from '../icons'
import { createBrowserTabDescriptor } from './browserTabDescriptor'
import { createFilesTabDescriptor } from './filesTabDescriptor'

/**
 * 右面板新 tab 动作 —— launcher 空态(`pr`/`hr`)与 strip 尾部「+」菜单(`Or`)共用
 * 同一组,Codex 侧是同一个 actions hook(thread-app-shell-chrome 的 `In`)。
 *
 * Codex 的组装方式(顺序即非 git workspace 的显示顺序):
 *
 *   de = [
 *     ...(hasWorkspaceRoot ? [open-file] : []),   // A:非 projectless 且有 workspaceRoot
 *     ...(sideChatEnabled ? [side-chat] : []),    // j:需要第二条会话管线 —— 未实现
 *     ...(browserSidebarEnabled ? [browser] : []),// M:WS 恒 true
 *     ...(isGit && !hasDiffTab ? [review] : []),  // N:需要 git diff 数据源 —— 未实现
 *     ...(timelineEnabled ? [timeline] : []),     // P:未实现
 *     ...(target === 'right' ? mcpApps : []),     // MCP 工具:未实现
 *     ...(terminalCapable ? [terminal] : []),     // F:需要 PTY/host 终端 —— 未实现
 *   ].filter((a) => codexAccessAllowed || !a.requiresCodexAccess)
 *
 *   actions = isGit ? sortBy(Rn) : de   // Rn = { review:0, terminal:1, browser:2, 'open-file':3 }
 *
 * 每项的形状:{ id, Icon, keyboardShortcut, onSelect, requiresCodexAccess, title,
 * deferSelectionUntilDropdownClose? }。open-file 与 browser 带 defer 标记
 * (菜单先关再执行,onCloseAutoFocus 时才跑 onSelect —— Codex 要开文件选择器,菜单不能挡)。
 *
 * 命令 id 证据(i18n):thread.sidePanel.openReviewTab / openBrowserTab / openFile /
 * openSideChat;快捷键实测:Review ⌃⇧G / Browser ⌘T / Files ⌘P / Side chat ⌥⌘S。
 */
export interface SidePanelTabAction {
  id: string
  title: string
  Icon: (props: { className?: string }) => React.JSX.Element
  /** 展示用快捷键文本(Codex 从 command registry 取;WS 还没有 command registry,先写字面量) */
  keyboardShortcut?: string
  /** Codex `deferSelectionUntilDropdownClose`:菜单关完再执行 */
  deferSelectionUntilDropdownClose?: boolean
  onSelect(): void
}

/** Codex `Rn` —— git workspace 下的排序权值 */
const GIT_SORT_ORDER: Record<string, number> = {
  review: 0,
  terminal: 1,
  browser: 2,
  'open-file': 3
}

export function useSidePanelTabActions(
  controller: AppShellTabPanelController
): SidePanelTabAction[] {
  const { chats, currentProject } = useWorkspace()
  const { activeChatId } = useChatRuntime()
  // Codex `A`:当前会话(路由)的 workspace 非 projectless 且有 workspaceRoot。
  // WS:会话归属的项目即其 workspace;首页无会话时退回侧栏选中的项目。
  const activeChatProjectId =
    activeChatId != null ? (chats.find((c) => c.id === activeChatId)?.projectId ?? null) : null
  const workspaceProjectId = activeChatProjectId ?? currentProject?.id ?? null
  const hasWorkspaceRoot = workspaceProjectId != null
  return useMemo(() => {
    const de: SidePanelTabAction[] = [
      ...(hasWorkspaceRoot
        ? [
            {
              id: 'open-file',
              title: 'Files',
              Icon: FilesFolderIcon,
              keyboardShortcut: '⌘P',
              deferSelectionUntilDropdownClose: true,
              onSelect: () =>
                controller.openTab(
                  createFilesTabDescriptor(controller, '', workspaceProjectId ?? undefined)
                )
            } satisfies SidePanelTabAction
          ]
        : []),
      // side-chat:未实现(条件不成立,不出现 —— 与 Codex 的条件组装语义一致)
      {
        id: 'browser',
        title: 'Browser',
        Icon: BrowserGlobeIcon,
        keyboardShortcut: '⌘T',
        deferSelectionUntilDropdownClose: true,
        onSelect: () => controller.openTab(createBrowserTabDescriptor())
      }
      // review / timeline / terminal / MCP 工具:未实现(同上)
    ]
    // Codex:git workspace 下按 Rn 排序。WS 的项目都是本地 git 仓库场景,恒按 Rn 排
    // (非 git 时 Codex 保持组装顺序 open-file 在前 —— 差异点,暂无 git 检测,先恒排)。
    return [...de].sort(
      (a, b) => (GIT_SORT_ORDER[a.id] ?? de.length) - (GIT_SORT_ORDER[b.id] ?? de.length)
    )
  }, [controller, hasWorkspaceRoot, workspaceProjectId])
}
