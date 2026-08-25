import { useCallback, useEffect } from 'react'
import { useAppShell, type AppShellTabPanelController } from '../../state/AppShellContext'
import { initCommandBridge, useCommandHandler } from '../../state/commands'
import { useThreadWorkspace } from '../../state/threadWorkspace'
import { useChatRuntime } from '../../state/ChatRuntimeContext'
import { createBrowserTabDescriptor } from '../panel/browserTabDescriptor'
import { openFilesTab } from '../panel/filesTabDescriptor'
import { openSideChat } from '../panel/sideChat/openSideChat'
import { setBrowserConversationId } from '../../host/browserScope'

/**
 * 命令处理器接线 —— Codex 里命令的 handler 由各组件用 `TM` 注册、
 * 宿主消息由 `_m` 订阅。WS 集中在这里挂(面板域),语义逐项对齐:
 *
 * | command id | 键位 | 行为 |
 * |---|---|---|
 * | openBrowserTab | ⌘T | 右面板开 Browser tab |
 * | toggleBrowserPanel | ⌘⇧B | 见下(推断,标不确定) |
 * | searchFiles | ⌘P | 右面板开 Files tab(空壳) |
 * | toggleSidePanel | ⌘⌥B | 右面板开合 |
 * | toggleMaximizeSidePanel | — | Expand/Restore panel |
 * | toggleFileTreePanel | ⌘⇧E | 文件树开合(全局) |
 * | toggleBottomPanel | ⌘J | 底部面板开合 |
 * | nextTab / previousTab | ⌃Tab/⌘⇧]/⌘⌥→ 等 | 焦点面板的相邻 tab 切换 |
 * | closeTab | ⌘W | 焦点面板关 active tab(预览 tab 兜底) |
 * | openSideChat | ⌘⌥S | 见 side chat(挂上后启用) |
 * | toggleSidebar | ⌘B | 左侧栏开合 |
 */
export function AppCommands(): null {
  const {
    rightPanelController,
    bottomPanelController,
    toggleRightPanel,
    toggleRightPanelFullWidth,
    toggleBottomPanel,
    toggleFileTree,
    setFileTreeOpen,
    toggleSidebar,
    rightPanelOpen,
    bottomPanelOpen
  } = useAppShell()
  // Codex 的命令 handler 与 launcher 读同一份会话工作区(见 state/threadWorkspace.ts)
  const { cwd, workspaceKind, workspaceRoots } = useThreadWorkspace()
  const workspaceRoot = workspaceRoots[0] ?? null
  const { activeChatId } = useChatRuntime()

  // 桥只初始化一次
  useEffect(() => {
    initCommandBridge()
  }, [])

  /*
   * 内置浏览器的会话作用域。
   *
   * 浏览器 tab 在 Codex 里是挂在会话上的（路由键 `(conversationId, browserTabId)`），
   * browser_use 也按 conversationId 找页。这里把当前会话 id 同步给宿主客户端，
   * 没有活动会话时退回 'app'（首页也能开浏览器 tab）。
   */
  useEffect(() => {
    setBrowserConversationId(activeChatId ?? 'app')
  }, [activeChatId])

  /* ---------- 面板开合 ---------- */

  useCommandHandler(
    'toggleSidebar',
    useCallback(() => {
      toggleSidebar()
    }, [toggleSidebar])
  )
  useCommandHandler(
    'toggleSidePanel',
    useCallback(() => {
      toggleRightPanel()
    }, [toggleRightPanel])
  )
  useCommandHandler(
    'toggleMaximizeSidePanel',
    useCallback(() => {
      toggleRightPanelFullWidth()
    }, [toggleRightPanelFullWidth])
  )
  useCommandHandler(
    'toggleBottomPanel',
    useCallback(() => {
      toggleBottomPanel()
    }, [toggleBottomPanel])
  )
  useCommandHandler(
    'toggleFileTreePanel',
    useCallback(() => {
      toggleFileTree()
    }, [toggleFileTree])
  )

  /* ---------- 开 tab ---------- */

  useCommandHandler(
    'openBrowserTab',
    useCallback(() => {
      rightPanelController.openTab(createBrowserTabDescriptor())
    }, [rightPanelController])
  )
  /*
   * toggleBrowserPanel(Codex 宿主消息 `toggle-browser-panel`;推断语义,不确定):
   * 右面板已开且 active 是 browser tab → 关面板;否则开一个 browser tab。
   */
  useCommandHandler(
    'toggleBrowserPanel',
    useCallback(() => {
      const active = rightPanelController.activeTab
      const activeIsBrowser =
        active != null && !active.tabId.startsWith('file:') && active.kind == null
      if (rightPanelOpen && activeIsBrowser) toggleRightPanel()
      else rightPanelController.openTab(createBrowserTabDescriptor())
    }, [rightPanelController, rightPanelOpen, toggleRightPanel])
  )
  useCommandHandler(
    'searchFiles',
    useCallback(() => {
      // Codex `se`:workspaceRoot 来自 workspaceRoots[0](projectless 会话没有该动作)
      if (workspaceKind === 'projectless' || workspaceRoot == null) return false
      openFilesTab(rightPanelController, { path: null, cwd, workspaceRoot, setFileTreeOpen })
      return true
    }, [rightPanelController, workspaceKind, workspaceRoot, cwd, setFileTreeOpen])
  )

  /* ---------- tab 切换 / 关闭 ---------- */

  /** 焦点所在的面板(data-app-shell-focus-area;Codex 的宿主消息带 panelId,这里等价推导) */
  const focusedController = useCallback((): AppShellTabPanelController => {
    const area = document.activeElement?.closest('[data-app-shell-focus-area]')
    if (area?.getAttribute('data-app-shell-focus-area') === 'bottom-panel')
      return bottomPanelController
    return rightPanelController
  }, [rightPanelController, bottomPanelController])

  const activateAdjacent = useCallback(
    (direction: 1 | -1) => {
      const controller = focusedController()
      const { tabs, activeTabId } = controller
      if (tabs.length < 2) return
      const index = tabs.findIndex((t) => t.tabId === activeTabId)
      const next = tabs[(index + direction + tabs.length) % tabs.length]
      if (next) controller.activateTab(next.tabId)
    },
    [focusedController]
  )
  useCommandHandler(
    'nextTab',
    useCallback(() => activateAdjacent(1), [activateAdjacent])
  )
  useCommandHandler(
    'previousTab',
    useCallback(() => activateAdjacent(-1), [activateAdjacent])
  )

  /*
   * Codex `_m('close-active-app-shell-tab')`(app-initial:226345):
   * closeActiveTab 不成(active 不可关)→ 退到预览 tab 的 closeTab。
   */
  useCommandHandler(
    'closeTab',
    useCallback(() => {
      const controller = focusedController()
      const open = controller.panelId === 'right' ? rightPanelOpen : bottomPanelOpen
      if (!open) return
      const { activeTab } = controller
      if (activeTab == null) return
      if (activeTab.isClosable) controller.closeTab(activeTab.tabId)
      else {
        const preview = controller.tabs.find((t) => t.isPreview && t.isClosable)
        if (preview) controller.closeTab(preview.tabId)
      }
    }, [focusedController, rightPanelOpen, bottomPanelOpen])
  )

  useCommandHandler(
    'openSideChat',
    useCallback(() => {
      if (activeChatId == null) return
      // Codex `B`:cwd 取会话工作区的 cwd(`f.cwd`),不是项目根
      void openSideChat({
        controller: rightPanelController,
        sourceChatId: activeChatId,
        cwd,
        panelOpen: rightPanelOpen
      }).catch((error: unknown) => {
        console.error('Failed to open side chat', error)
      })
    }, [activeChatId, rightPanelController, cwd, rightPanelOpen])
  )
  return null
}
