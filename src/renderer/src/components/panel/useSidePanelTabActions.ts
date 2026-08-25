import { useMemo } from 'react'
import type { AppShellTabPanelController } from '../../state/AppShellContext'
import { useAppShell } from '../../state/AppShellContext'
import { useChatRuntime } from '../../state/ChatRuntimeContext'
import { useThreadWorkspace } from '../../state/threadWorkspace'
import { commandKeybindingLabel } from '../../state/commands'
import { BrowserGlobeIcon, FilesFolderIcon, SideChatIcon } from '../icons'
import { createBrowserTabDescriptor } from './browserTabDescriptor'
import { openFilesTab } from './filesTabDescriptor'
import { openSideChat } from './sideChat/openSideChat'

/**
 * 右面板新 tab 动作 —— launcher 空态(`pr`/`hr`)与 strip 尾部「+」菜单(`Or`)共用
 * 同一组,Codex 侧是同一个 actions hook(thread-app-shell-chrome 的 `In`)。
 *
 * Codex 的组装方式(顺序即非 git workspace 的显示顺序):
 *
 *   de = [
 *     ...(A ? [open-file] : []),                  // A = workspaceKind !== 'projectless' && workspaceRoots[0] != null
 *     ...(sideChatEnabled ? [side-chat] : []),    // j:有当前会话且非 side chat
 *     ...(browserSidebarEnabled ? [browser] : []),// M:WS 恒 true
 *     ...(isGit && !hasDiffTab ? [review] : []),  // N:需要 git diff 数据源 —— 未实现
 *     ...(timelineEnabled ? [timeline] : []),     // P:未实现
 *     ...(target === 'right' ? mcpApps : []),     // MCP 工具:未实现
 *     ...(terminalCapable ? [terminal] : []),     // F:需要 PTY/host 终端 —— 未实现
 *   ].filter((a) => codexAccessAllowed || !a.requiresCodexAccess)
 *
 *   actions = f.kind === 'git' ? sortBy(Rn) : de   // Rn = { review:0, terminal:1, browser:2, 'open-file':3 }
 *
 * 排序**只在 git 工作区生效**:实测 Codex 的 projectless 会话(cwd 是
 * `~/Documents/Codex/<日期>/<名字>`)launcher 就是组装顺序 `Side chat / Browser /
 * Terminal`,项目内会话才是 `Review / Terminal / Browser / Files / Side chat`。
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
  const { activeChatId } = useChatRuntime()
  const { rightPanelOpen, bottomPanelOpen, setFileTreeOpen } = useAppShell()
  /*
   * Codex `In` 里的三个来源:
   *   f = V(je)      → 会话工作区({kind, cwd})
   *   b = W(he, _)   → workspaceKind('project' | 'projectless')
   *   p = V(pe)[0]   → workspaceRoots[0]
   * 见 state/threadWorkspace.ts。
   */
  const { kind, cwd, workspaceKind, workspaceRoots } = useThreadWorkspace()
  const workspaceRoot = workspaceRoots[0] ?? null
  // Codex `A = b !== 'projectless' && p != null`
  const canOpenFile = workspaceKind !== 'projectless' && workspaceRoot != null
  // Codex side-chat 条件 `j = _ != null && !vt()`:有当前会话且当前不在 side chat
  // (WS 的 side chat 开在 tab 里,主路由恒为普通会话 —— vt() 恒 false)
  const canOpenSideChat = activeChatId != null
  const panelOpen = controller.panelId === 'right' ? rightPanelOpen : bottomPanelOpen

  return useMemo(() => {
    const de: SidePanelTabAction[] = [
      ...(canOpenFile && workspaceRoot != null
        ? [
            {
              id: 'open-file',
              title: 'Files',
              Icon: FilesFolderIcon,
              keyboardShortcut: commandKeybindingLabel('searchFiles'),
              deferSelectionUntilDropdownClose: true,
              // Codex `se`:`C(scope, null, {hostId, target, workspaceRoot: p})` —— path 为 null
              onSelect: () =>
                openFilesTab(controller, { path: null, cwd, workspaceRoot, setFileTreeOpen })
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
              // Codex `B`:`{sourceConversationId: _, cwd: f.cwd, hostId, collaborationMode, target}`
              // —— cwd 是**会话工作区的 cwd**,不是项目根
              onSelect: () => {
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
    // Codex `f.kind === 'git' ? [...de].sort(Rn) : de` —— 非 git 工作区保持组装顺序
    if (kind !== 'git') return de
    return [...de].sort(
      (a, b) => (GIT_SORT_ORDER[a.id] ?? de.length) - (GIT_SORT_ORDER[b.id] ?? de.length)
    )
  }, [
    controller,
    canOpenFile,
    workspaceRoot,
    canOpenSideChat,
    activeChatId,
    cwd,
    kind,
    panelOpen,
    setFileTreeOpen
  ])
}
