import { useEffect } from 'react'
import { SAFE_HEADER_LEFT, SAFE_HEADER_RIGHT } from '../../utils/platform'
import { WorkspaceProvider } from '../../state/WorkspaceContext'
import { SessionProvider } from '../../state/SessionContext'
import { ChatRuntimeProvider, useChatRuntime } from '../../state/ChatRuntimeContext'
import { OverlayProvider, useOverlay } from '../../state/OverlayContext'
import {
  AppShellProvider,
  useAppShell,
  RIGHT_PANEL_COLLAPSE_AT,
  BOTTOM_PANEL_COLLAPSE_AT
} from '../../state/AppShellContext'
import { LeftPanel } from '../sidebar/LeftPanel'
import { MainContentLayout } from './MainContentLayout'
import { RightPanel } from './RightPanel'
import { BottomPanel } from './BottomPanel'
import {
  BottomPanelOutlet,
  BottomPanelTabListAfter,
  BottomPanelTabListAfterSticky,
  RightPanelOutlet,
  RightPanelTabListAfterSticky,
  RightPanelTabsEmptyState
} from '../panel/slots'
import { RightPanelTabs } from '../panel/RightPanelTabs'
import { BottomPanelTabs } from '../panel/BottomPanelTabs'
import { RightPanelNewTabPage } from '../panel/RightPanelNewTabPage'
import { OpenSidePanelTabMenu } from '../panel/OpenSidePanelTabMenu'
import { OpenFileTabsSync } from '../panel/file/OpenFileTabsSync'
import { OverlayLayer } from '../overlay/OverlayLayer'
import { BrowserSurfaceLayer } from '../panel/BrowserSurfaceLayer'
import { TooltipProvider } from '../tooltip/Tooltip'
import { AppPortals } from '../overlay/AppPortals'
import { AppCommands } from '../command/AppCommands'
import { SideChatCloseDialogHost } from '../panel/sideChat/SideChatCloseDialog'
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
 * absolute 贴在面板自己身上的(见 ResizeHandle)。
 *
 * 高度传递链:应用根有确定高度(100vh) → 主行 flex-1 + min-h-0 → aside/main 靠
 * align-items:stretch 自动等高。任何一环写成块级,后面全得手写高度。
 *
 * 右/底面板**常驻渲染**(RightPanel/BottomPanel 内部按 Codex `UPr` 语义在
 * 关闭动画播完前保持挂载、之后返回 null)——开合动画在面板自己身上,
 * 这里不做条件渲染。
 */
/**
 * 槽位内容 —— **必须是稳定引用**(模块级常量):
 * 槽位注册的 useLayoutEffect 以 children 为依赖,Shell 每渲染一次就产生新元素的话
 * 会 setSlots → 重渲染 → 再注册 → 死循环。Codex 靠 React Compiler 的 memo cache
 * 钉住(thread-app-shell-chrome 里这些 JSX 全是 memo_cache_sentinel 常量),
 * WS 没有 compiler,手工钉。内容自身的更新走 context,不受元素引用稳定影响。
 */
const RIGHT_PANEL_OUTLET_CONTENT = <RightPanelTabs />
const RIGHT_PANEL_EMPTY_STATE = <RightPanelNewTabPage />
const RIGHT_PANEL_TAB_MENU = <OpenSidePanelTabMenu target="right" />
const BOTTOM_PANEL_OUTLET_CONTENT = <BottomPanelTabs />
const BOTTOM_PANEL_TAB_MENU = <OpenSidePanelTabMenu target="bottom" />
const BOTTOM_PANEL_CLOSE = <BottomPanelCloseButton />

function Shell(): React.JSX.Element {
  const { toggleCommand, closeAll } = useOverlay()
  // 进了会话就是 thread 态 —— 路由容器类名、顶部渐隐、thread 边缘分隔线三处都要跟着切
  const { activeChatId } = useChatRuntime()
  const isThread = activeChatId != null
  const {
    sidebarWidth,
    setSidebarWidth,
    rightPanelWidth,
    setRightPanelWidth,
    commitRightPanelWidth,
    rightPanelOpen,
    bottomPanelOpen,
    rightPanelWidthMode,
    bottomPanelHeight,
    setBottomPanelHeight,
    commitBottomPanelHeight
  } = useAppShell()

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
      {/* 命令注册表的处理器接线(渲染 null;Codex 的 TM/_m 注册点) */}
      <AppCommands />
      {/* 打开中的文件 tab → fs/watch(渲染 null;Codex `v$i` 的接线) */}
      <OpenFileTabsSync />
      {/*
       * thread chrome 的槽位注册(Codex `Ar`/`Dr`,thread-app-shell-chrome):
       * 这些组件渲染 null,把内容写进 AppShell 的 slot store(KP);
       * RightPanel(`EJr`)/ BottomPanel(`YPr`)渲染时读出。
       *
       * Codex 里 emptyState / afterSticky 还有 `ready === 'ready'` 条件(未 ready 不注册)——
       * WS 无 worktree provisioning,恒 ready。
       * Codex 还注册了 HeaderAction(thread-side-panel-close / bottom-panel-toggle)——
       * WS 的 header 动作是写死的,没有 HeaderAction registry,本轮不接。
       */}
      <RightPanelOutlet>{RIGHT_PANEL_OUTLET_CONTENT}</RightPanelOutlet>
      <RightPanelTabsEmptyState>{RIGHT_PANEL_EMPTY_STATE}</RightPanelTabsEmptyState>
      <RightPanelTabListAfterSticky>{RIGHT_PANEL_TAB_MENU}</RightPanelTabListAfterSticky>
      <BottomPanelOutlet>{BOTTOM_PANEL_OUTLET_CONTENT}</BottomPanelOutlet>
      <BottomPanelTabListAfterSticky>{BOTTOM_PANEL_TAB_MENU}</BottomPanelTabListAfterSticky>
      <BottomPanelTabListAfter>{BOTTOM_PANEL_CLOSE}</BottomPanelTabListAfter>

      <div className="relative isolate flex max-h-full min-h-0 w-full flex-1">
        <LeftPanel width={sidebarWidth} onResize={setSidebarWidth} />
        <MainContentLayout
          routeLayout={isThread ? 'thread' : 'home'}
          topFade={isThread ? 'full-bleed' : 'visible'}
          threadEdgeDivider={isThread}
          rightPanelFullWidth={rightPanelWidthMode === 'full'}
          rightPanel={
            <RightPanel
              isOpen={rightPanelOpen}
              width={rightPanelWidth}
              onResize={setRightPanelWidth}
              onResizeEnd={(finalWidth) => {
                // Codex Tkr onResizeEnd:`e < WHn(320) || MHn(…)` —— 拖过折叠阈值不持久化,
                // 保留拖拽前的 ratio,重开恢复
                if (finalWidth >= RIGHT_PANEL_COLLAPSE_AT) commitRightPanelWidth()
              }}
            />
          }
          bottomPanel={
            <BottomPanel
              isOpen={bottomPanelOpen}
              height={bottomPanelHeight}
              onResize={setBottomPanelHeight}
              onResizeEnd={(finalHeight) => {
                if (finalHeight >= BOTTOM_PANEL_COLLAPSE_AT) commitBottomPanelHeight()
              }}
            />
          }
        >
          <MainView />
        </MainContentLayout>
      </div>
      <OverlayLayer />
      {/*
        内置浏览器的 webview 持久层。
        必须挂在这一层（而不是面板里）：webview 从 DOM 摘下 guest 就销毁，
        而浏览器页面要活过 tab 切换、面板关闭与会话切换。
      */}
      <BrowserSurfaceLayer />
      {/* side chat 关闭确认弹窗(Codex `De`,closeGuard 驱动) */}
      <SideChatCloseDialogHost />
      {/* body 级 portal 层 —— 必须在 #root 外(这一层有 zoom,会给 fixed 建包含块) */}
      <AppPortals />
    </div>
  )
}

/** 底部面板 strip 右侧的 Close 按钮(Codex chrome `Dr` 里 BottomPanelTabListAfter 的注册内容) */
function BottomPanelCloseButton(): React.JSX.Element {
  const { toggleBottomPanel } = useAppShell()
  return (
    <button
      type="button"
      title="Close"
      onClick={toggleBottomPanel}
      className="no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-lg text-token-text-tertiary enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent h-token-button-composer px-2 py-0 text-base leading-[18px] aspect-square shrink-0 items-center justify-center !px-0"
    >
      {/* 不确定:Codex 此处图标 `ye` 未能取证(本机底部面板点不开),先用 tab 关闭钮同款 × */}
      <svg
        width="21"
        height="21"
        viewBox="0 0 21 21"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="icon-xs"
      >
        <path
          d="M14.6549 5.57307C14.9283 5.2997 15.3718 5.2997 15.6451 5.57307C15.9185 5.84643 15.9185 6.28993 15.6451 6.5633L11.3903 10.8182L15.6451 15.0731L15.735 15.1834C15.9141 15.4551 15.8842 15.8242 15.6451 16.0633C15.4061 16.3024 15.0369 16.3322 14.7653 16.1531L14.6549 16.0633L10.4 11.8084L6.14515 16.0633C5.87178 16.3367 5.42828 16.3367 5.15492 16.0633C4.88155 15.7899 4.88155 15.3464 5.15492 15.0731L9.4098 10.8182L5.15492 6.5633L5.06507 6.45295C4.88597 6.18128 4.91584 5.81214 5.15492 5.57307C5.39399 5.33399 5.76313 5.30413 6.0348 5.48322L6.14515 5.57307L10.4 9.82795L14.6549 5.57307Z"
          fill="currentColor"
        />
      </svg>
    </button>
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
            <AppShellProvider>
              {/*
               * tooltip / 悬浮卡片的全局管理器 —— Codex 把它挂在路由之上
               * (bundle 里 `ltt` 无 props,取默认 700ms 延迟 / 300ms 免延迟窗口)。
               * 必须在侧栏之上:互斥关闭与「免延迟窗口」是跨行共享的状态,
               * 每行各自计时的话沿着列表往下扫会每行都等 700ms。
               */}
              <TooltipProvider>
                <Shell />
              </TooltipProvider>
            </AppShellProvider>
          </OverlayProvider>
        </ChatRuntimeProvider>
      </SessionProvider>
    </WorkspaceProvider>
  )
}
