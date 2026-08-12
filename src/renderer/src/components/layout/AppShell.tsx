import { useEffect, useRef } from 'react'
import { Group, Panel } from 'react-resizable-panels'
import { WorkspaceProvider } from '../../state/WorkspaceContext'
import { SessionProvider } from '../../state/SessionContext'
import { ChatRuntimeProvider, useChatRuntime } from '../../state/ChatRuntimeContext'
import { OverlayProvider, useOverlay } from '../../state/OverlayContext'
import { PanelProvider, usePanels } from '../../state/PanelContext'
import { Sidebar } from '../sidebar/Sidebar'
import { TopBar } from './TopBar'
import { ContentArea } from './ContentArea'
import { PanelShell } from '../panel/PanelShell'
import { OverlayLayer } from '../overlay/OverlayLayer'
import { HomeView } from '../../views/HomeView'
import { ChatView } from '../../chat/ChatView'
import { HorizontalSeparator, VerticalSeparator } from './separators'

function Shell(): React.JSX.Element {
  const { toggleCommand, closeAll } = useOverlay()
  const { sidebarRef, rightRef, bottomRef, reportPanelSize, panelMaximized } = usePanels()

  // 右/底面板初始为折叠态（命令式 API 在挂载后调用一次）
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    rightRef.current?.collapse()
    bottomRef.current?.collapse()
  }, [rightRef, bottomRef])

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
    <div className="flex h-screen flex-col">
      <Group orientation="horizontal" className="min-h-0 flex-1">
        {/* collapsible + collapsedSize=0：拖过 minSize 继续拖会自动折叠（库的原生行为） */}
        <Panel
          id="sidebar"
          panelRef={sidebarRef}
          defaultSize="299px"
          minSize="220px"
          maxSize="480px"
          collapsible
          collapsedSize={0}
          onResize={(size) => reportPanelSize('sidebar', size.inPixels)}
          className="min-h-0"
        >
          <Sidebar />
        </Panel>
        <VerticalSeparator />

        <Panel id="main" minSize="360px" className="min-h-0">
          <Group orientation="vertical" className="h-full">
            <Panel id="content-row" minSize="240px" className="min-h-0">
              <Group orientation="horizontal" className="h-full">
                {/* 最大化时隐藏内容区，tab panel 占满整行 */}
                {!panelMaximized && (
                  <>
                    <Panel id="content" minSize="320px" className="min-h-0">
                      <ContentArea>
                        <MainView />
                      </ContentArea>
                    </Panel>
                    <VerticalSeparator />
                  </>
                )}
                <Panel
                  id="right-panel"
                  panelRef={rightRef}
                  defaultSize="320px"
                  minSize="240px"
                  maxSize={panelMaximized ? '100%' : '50%'}
                  collapsible
                  collapsedSize={0}
                  onResize={(size) => reportPanelSize('right', size.inPixels)}
                  className="min-h-0"
                >
                  <PanelShell docked="right" />
                </Panel>
              </Group>
            </Panel>

            <HorizontalSeparator />
            <Panel
              id="bottom-panel"
              panelRef={bottomRef}
              defaultSize="240px"
              minSize="120px"
              maxSize="70%"
              collapsible
              collapsedSize={0}
              onResize={(size) => reportPanelSize('bottom', size.inPixels)}
            >
              <PanelShell docked="bottom" />
            </Panel>
          </Group>
        </Panel>
      </Group>

      <TopBar />
      <OverlayLayer />
    </div>
  )
}

/** 主区域路由：没有打开的会话就是首页 */
function MainView(): React.JSX.Element {
  const { activeChatId } = useChatRuntime()
  return activeChatId ? <ChatView /> : <HomeView />
}

/**
 * .app (100vh 纵向) → 三向面板骨架（react-resizable-panels）：
 * 所有面板常驻挂载 + collapsible，开关走命令式 collapse/expand，
 * 拖拽过界自动折叠由库原生处理。
 */
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
