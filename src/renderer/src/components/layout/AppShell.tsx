import { useEffect } from 'react'
import { SAFE_HEADER_LEFT, SAFE_HEADER_RIGHT } from '../../utils/platform'
import { WorkspaceProvider } from '../../state/WorkspaceContext'
import { SessionProvider } from '../../state/SessionContext'
import { ChatRuntimeProvider, useChatRuntime } from '../../state/ChatRuntimeContext'
import { OverlayProvider, useOverlay } from '../../state/OverlayContext'
import { PanelProvider, usePanels } from '../../state/PanelContext'
import { Sidebar } from '../sidebar/Sidebar'
import { ContentArea } from './ContentArea'
import { RightPanel } from './RightPanel'
import { PanelShell } from '../panel/PanelShell'
import { OverlayLayer } from '../overlay/OverlayLayer'
import { HomeView } from '../../views/HomeView'
import { ChatView } from '../../chat/ChatView'

/**
 * 应用骨架 —— 祖先链逐层对齐 Codex 实测值:
 *
 *   div#root                                                    (块级,React 挂载点)
 *   └ div.relative.flex.flex-col                                ← 应用根,纵向
 *     style: --spacing-token-safe-header-left/right
 *            width/height: calc(100vw|100vh / var(--codex-window-zoom))
 *            zoom: var(--codex-window-zoom)
 *     └ div.relative.isolate.flex.max-h-full.min-h-0.w-full.flex-1   ← 主行,**横向**
 *       ├ aside.app-shell-left-panel  style: padding-top: var(--height-toolbar); width: <n>px
 *       └ main.codex-MainContentSurface                          (flex:1 由模块 CSS 给)
 *
 * **这里没有任何分隔条元素。** 两个面板的宽度各自走内联 width,拖拽手柄是
 * absolute 贴在面板自己身上的(见 ResizeHandle)。之前用 react-resizable-panels
 * 会在 DOM 里插入 `[data-panel-group]` / `[data-panel]` / `[role=separator]` 共 9 个
 * Codex 完全没有的节点,而且 Panel 是**块级** div —— aside 和 main 因此拿不到
 * flex 行的 stretch 高度,得靠 h-full/w-full 打补丁。祖先链一改,那些补丁全部删掉。
 *
 * 高度传递链:应用根有确定高度(100vh) → 主行 flex-1 + min-h-0 → aside/main 靠
 * align-items:stretch 自动等高。任何一环写成块级,后面全得手写高度。
 */
function Shell(): React.JSX.Element {
  const { toggleCommand, closeAll } = useOverlay()
  const {
    sidebarWidth,
    setSidebarWidth,
    rightPanelWidth,
    setRightPanelWidth,
    rightPanelOpen,
    bottomPanelOpen,
    panelMaximized
  } = usePanels()

  // 全局快捷键：⌘K 命令面板 / Escape 关闭浮层
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggleCommand()
      } else if (e.key === 'Escape') {
        closeAll()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleCommand, closeAll])

  return (
    <div
      className="relative flex flex-col"
      style={
        {
          '--spacing-token-safe-header-left': `${SAFE_HEADER_LEFT}px`,
          '--spacing-token-safe-header-right': `${SAFE_HEADER_RIGHT}px`,
          width: 'calc(100vw / var(--codex-window-zoom))',
          height: 'calc(100vh / var(--codex-window-zoom))',
          zoom: 'var(--codex-window-zoom)'
        } as React.CSSProperties
      }
    >
      <div className="relative isolate flex max-h-full min-h-0 w-full flex-1">
        <Sidebar width={sidebarWidth} onResize={setSidebarWidth} />
        <ContentArea
          rightPanelFullWidth={panelMaximized}
          rightPanel={
            rightPanelOpen ? (
              <RightPanel width={rightPanelWidth} onResize={setRightPanelWidth}>
                <PanelShell docked="right" />
              </RightPanel>
            ) : undefined
          }
          bottomPanel={bottomPanelOpen ? <PanelShell docked="bottom" /> : undefined}
        >
          <MainView />
        </ContentArea>
      </div>
      <OverlayLayer />
    </div>
  )
}

/** 主区域路由：没有打开的会话就是首页 */
function MainView(): React.JSX.Element {
  const { activeChatId } = useChatRuntime()
  return activeChatId ? <ChatView /> : <HomeView />
}

export function AppShell(): React.JSX.Element {
  return (
    <WorkspaceProvider>
      <SessionProvider>
        <ChatRuntimeProvider>
          <OverlayProvider>
            <PanelProvider>
              <Shell />
            </PanelProvider>
          </OverlayProvider>
        </ChatRuntimeProvider>
      </SessionProvider>
    </WorkspaceProvider>
  )
}
