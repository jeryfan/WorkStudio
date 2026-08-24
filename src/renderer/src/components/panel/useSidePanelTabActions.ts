import { useMemo } from 'react'
import type { AppShellTabPanelController } from '../../state/AppShellContext'
import { useAppShell } from '../../state/AppShellContext'
import { useWorkspace } from '../../state/WorkspaceContext'
import { useChatRuntime } from '../../state/ChatRuntimeContext'
import { commandKeybindingLabel } from '../../state/commands'
import { BrowserGlobeIcon, FilesFolderIcon, SideChatIcon } from '../icons'
import { createBrowserTabDescriptor } from './browserTabDescriptor'
import { createFilesTabDescriptor } from './filesTabDescriptor'
import { openSideChat } from './sideChat/openSideChat'

/**
 * 右面板新 tab 动作 —— launcher 空态(`pr`/`hr`)与 strip 尾部「+」菜单(`Or`)共用
 * 同一组,Codex 侧是同一个 actions hook(thread-app-shell-chrome 的 `In`)。
 *
 * Codex 的组装方式(顺序即非 git workspace 的显示顺序):
 *
 *   de = [
 *     ...(hasWorkspaceRoot ? [open-file] : []),   // A:非 projectless 且有 workspaceRoot
 *     ...(sideChatEnabled ? [side-chat] : []),    // j:有当前会话且非 side chat
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
 * 快捷键文本从命令注册表取(Codex `Po(yM, id)` 的等价物 commandKeybindingLabel)。
 */
export interface SidePanelTabAction {
  id: string
  title: string
  Icon: (props: { className?: string }) => React.JSX.Element
  /** 展示用快捷键文本(命令注册表首个键位的格式化串) */
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
  const { chats, currentProject, projects } = useWorkspace()
  const { activeChatId } = useChatRuntime()
  const { rightPanelOpen, bottomPanelOpen } = useAppShell()
  // Codex `A`:当前会话(路由)的 workspace 非 projectless 且有 workspaceRoot。
  // WS:会话归属的项目即其 workspace;首页无会话时退回侧栏选中的项目。
  const activeChatProjectId =
    activeChatId != null ? (chats.find((c) => c.id === activeChatId)?.projectId ?? null) : null
  const workspaceProjectId = activeChatProjectId ?? currentProject?.id ?? null
  const hasWorkspaceRoot = workspaceProjectId != null
  const workspaceRootPath =
    projects.find((p) => p.id === workspaceProjectId)?.rootPaths[0] ?? undefined
  // Codex side-chat 条件 `j = _ != null && !vt()`:有当前会话且当前不在 side chat
  // (WS 的 side chat 开在 tab 里,主路由恒为普通会话 —— vt() 恒 false)
  const canOpenSideChat = activeChatId != null
  const panelOpen = controller.panelId === 'right' ? rightPanelOpen : bottomPanelOpen

  return useMemo(() => {
    const de: SidePanelTabAction[] = [
      ...(hasWorkspaceRoot
        ? [
            {
              id: 'open-file',
              title: 'Files',
              Icon: FilesFolderIcon,
              keyboardShortcut: commandKeybindingLabel('searchFiles'),
              deferSelectionUntilDropdownClose: true,
              onSelect: () =>
                controller.openTab(
                  createFilesTabDescriptor(
                    controller,
                    '',
                    workspaceProjectId ?? undefined,
                    workspaceRootPath
                  )
                )
            } satisfies SidePanelTabAction
          ]
        : []),
      ...(canOpenSideChat
        ? [
            {
              id: 'side-chat',
              title: 'Side chat',
              Icon: SideChatIcon,
              keyboardShortcut: commandKeybindingLabel('openSideChat'),
              onSelect: () => {
                const cwd =
                  workspaceRootPath ?? chats.find((c) => c.id === activeChatId)?.cwd ?? null
                void openSideChat({
                  controller,
                  sourceChatId: activeChatId,
                  cwd,
                  panelOpen
                }).catch((error: unknown) => {
                  // Codex:toast 'Failed to open side chat';WS 暂无 toast 系统(差异标记)
                  console.error('Failed to open side chat', error)
                })
              }
            } satisfies SidePanelTabAction
          ]
        : []),
      {
        id: 'browser',
        title: 'Browser',
        Icon: BrowserGlobeIcon,
        keyboardShortcut: commandKeybindingLabel('openBrowserTab'),
        deferSelectionUntilDropdownClose: true,
        onSelect: () => controller.openTab(createBrowserTabDescriptor())
      }
      // review / timeline / terminal / MCP 工具:未实现(条件不成立,不出现 —— 与 Codex 的条件组装语义一致)
    ]
    // Codex:git workspace 下按 Rn 排序。WS 的项目都是本地 git 仓库场景,恒按 Rn 排
    // (非 git 时 Codex 保持组装顺序 open-file 在前 —— 差异点,暂无 git 检测,先恒排)。
    return [...de].sort(
      (a, b) => (GIT_SORT_ORDER[a.id] ?? de.length) - (GIT_SORT_ORDER[b.id] ?? de.length)
    )
  }, [
    controller,
    hasWorkspaceRoot,
    workspaceProjectId,
    workspaceRootPath,
    canOpenSideChat,
    activeChatId,
    chats,
    panelOpen
  ])
}
