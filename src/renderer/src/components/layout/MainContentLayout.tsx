import type { ReactNode } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import type { AppShellTabPanelController } from '../../state/AppShellContext'
import { useAppShell } from '../../state/AppShellContext'
import { AppShellHeader } from './AppShellHeader'

/**
 * 右/底面板的 tab 拖拽共用一个 DndContext,挂在 main(codex-MainContentSurface)里 ——
 * Codex 就是这样(dnd-kit 的 DndDescribedBy 播报节点实测是 MainContentSurface 的
 * 直接子代;跨面板拖拽也以此为基础)。droppable strip 的 data 带 controller
 * ({controller, kind: 'app-shell-tab-strip'}),dragEnd 据此路由到对应 controller。
 */
function usePanelDnd(): {
  sensors: ReturnType<typeof useSensors>
  onDragEnd(e: DragEndEvent): void
} {
  const { rightPanelController, bottomPanelController } = useAppShell()
  const sensors = useSensors(
    // 拖动阈值 4px:点击仍走 activate,不触发拖拽
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (over == null || active.id === over.id) return
    // over 是 strip(空白尾区)→ 落到该 strip 末尾;over 是 tab → 落到那个 tab 的位置
    const overData = over.data.current as
      { controller?: AppShellTabPanelController; kind?: string } | undefined
    let controller = overData?.kind === 'app-shell-tab-strip' ? overData.controller : undefined
    if (controller == null) {
      // tab 上没带 data —— 扫两个 controller 找 dndId 归属
      for (const c of [rightPanelController, bottomPanelController]) {
        if (c.tabs.some((t) => t.dndId === String(over.id))) {
          controller = c
          break
        }
      }
    }
    if (controller == null) return
    const toId =
      overData?.kind === 'app-shell-tab-strip'
        ? (controller.tabs[controller.tabs.length - 1]?.dndId ?? null)
        : String(over.id)
    if (toId == null) return
    const fromTabId = controller.tabs.find((t) => t.dndId === String(active.id))?.tabId
    const toTabId = controller.tabs.find((t) => t.dndId === toId)?.tabId
    if (fromTabId != null && toTabId != null) controller.reorderTab(fromTabId, toTabId)
  }
  return { sensors, onDragEnd }
}

/**
 * 主内容区 —— 对齐 Codex 的 main 壳层。Codex 的完整层级:
 *
 *   main.codex-MainContentSurface[data-app-shell-main-surface]
 *   ├ div.pointer-events-none.absolute.inset-y-0.start-0        ← 左缘覆盖层
 *   ├ header …                                                  ← 工具栏在 main **内部**
 *   └ div.relative.isolate.flex.min-h-0.flex-1.overflow-hidden
 *     └ div.codex-MainContentViewport[data-app-shell-main-content-layout]
 *                                    [data-app-shell-right-panel-full-width]
 *       └ div.codex-MainContentFrame[data-app-shell-thread-edge-divider]
 *         └ div.relative.flex.min-h-0.flex-1
 *           ├ div.codex-MainContentTopFade[data-app-shell-main-content-top-fade]
 *           └ div.h-full.min-h-0.min-w-0.flex-1
 *             └ div.flex.h-full.flex-col[data-vscode-context][tabindex=0]
 *
 * 三层 CSS Module 各自承担的东西(见 assets/codex/components.css 2215-2290):
 *
 * - **Viewport** 管圆角与右面板占满时的布局切换(`right-panel-full-width`)。
 * - **Frame** 管 thread 边缘那道分隔线(`thread-edge-divider`),以及 46px 的
 *   顶部让位 —— 所以这里不需要再写 pt-11。
 * - **TopFade** 是内容顶部的渐隐遮罩,三态:`visible` / `full-bleed` / 无。
 *   首页是 visible,进 thread 变 full-bleed。
 *
 * 少了这三层的表现:顶部渐隐没有、右面板全宽时主区不让位、thread 顶边少一道线,
 * 而且 header 的 46px 让位得靠调用方自己写 pt,各处容易写歪(之前是 pt-11 = 44px)。
 *
 * data-app-shell-main-surface 有 default / browser 两个取值,Electron 宿主用 default。
 */
export function MainContentLayout({
  children,
  /** 进入会话后由 ChatView 侧切成 full-bleed;首页是 visible */
  topFade = 'visible',
  threadEdgeDivider = false,
  rightPanelFullWidth = false,
  layout = 'default',
  /** 右面板 —— 作为 MainContentViewport 的兄弟渲染 */
  /** 'home' | 'thread' —— 决定两层路由容器的类名档位(Codex 两态不同) */
  routeLayout = 'home',
  rightPanel,
  /**
   * 底部面板。**Codex 侧无法取证**:它的 "Toggle bottom panel" 点下去
   * DOM 里不产生任何节点(实测),所以没有可对齐的目标结构。
   * 这里放在 main 的 flex 列末尾 —— 那是唯一在语义上说得通的位置。
   * 等 Codex 那边能复现出底部面板再按实测调整。
   */
  bottomPanel
}: {
  children: ReactNode
  topFade?: 'visible' | 'full-bleed' | 'hidden'
  threadEdgeDivider?: boolean
  rightPanelFullWidth?: boolean
  layout?: string
  routeLayout?: 'home' | 'thread'
  rightPanel?: ReactNode
  bottomPanel?: ReactNode
}): React.JSX.Element {
  const { sensors, onDragEnd } = usePanelDnd()
  return (
    <main
      /* 模块类自带 isolate/flex/flex-col/flex-1/min-height:0/relative(components.css:2183)。
         主行现在是真正的 flex 行了,高度靠 stretch、宽度靠 flex:1,不需要 h-full/w-full。 */
      className="codex-MainContentSurface"
      data-app-shell-main-surface="default"
    >
      <div className="pointer-events-none absolute inset-y-0 start-0" />
      <AppShellHeader />
      {/*
       * 这一层是**横向** flex:MainContentViewport + 右面板 aside 并排。
       * Codex 的右面板不是独立 panel 库,而是这一层的第二个子元素:
       *   aside.relative.z-[41].h-full.min-h-0.min-w-0.shrink-0.overflow-visible.ltr:ms-auto.rtl:me-auto
       *     [data-app-shell-focus-area="right-panel"]  style: opacity/width
       *     ├ div … w-px shadow-[-8px_0_16px_-8px_…]        ← 左缘投影(不是 border)
       *     ├ ResizeHandle(panel-start)
       *     └ div.absolute.inset-0.min-h-0.min-w-0.overflow-hidden
       *       └ div.absolute.top-0.bottom-0.left-0.min-w-0.bg-token-main-surface-primary.border-l.border-token-border-default
       *          style: min-width/width 与 aside 同值
       * 内层用 absolute + 同值 min-width/width,是为了宽度动画时内容不跟着重排。
       */}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="relative isolate flex min-h-0 flex-1 overflow-hidden">
          <div
            className="codex-MainContentViewport"
            data-app-shell-main-content-layout={layout}
            data-app-shell-right-panel-full-width={rightPanelFullWidth ? 'true' : 'false'}
          >
            <div
              className="codex-MainContentFrame"
              data-app-shell-thread-edge-divider={threadEdgeDivider ? 'true' : 'false'}
            >
              <div className="relative flex min-h-0 flex-1">
                {topFade !== 'hidden' && (
                  <div
                    aria-hidden="true"
                    className="codex-MainContentTopFade"
                    data-app-shell-main-content-top-fade={topFade}
                  />
                )}
                <div className="h-full min-h-0 min-w-0 flex-1">
                  {/* data-vscode-context 是 Codex 给内嵌 VS Code 组件传上下文用的,
                    tabindex=0 让主区可以整体接收键盘焦点 */}
                  {/*
                   * Codex 在 data-vscode-context 内外的容器顺序,首页与 thread **不同**
                   * (2026-08 运行时实测复核):
                   *
                   *   首页   div.flex.h-full.flex-col[vscode] > div.relative.min-h-0.flex-1 > div.h-full.min-h-0
                   *   thread div.relative.h-full.min-h-0   > div.h-full.min-h-0 > div.relative.flex.h-full.flex-col.min-h-0[vscode]
                   *
                   * 首页的 vscode 层在路由容器**外面**:路由容器是它的 flex item,
                   * 高度才有确定值。写反了(路由容器在外)时,路由容器的父级是 block,
                   * `flex-1` 失效 → 高度链断 → 内部 0 高,首页整片被 overflow 裁剪
                   * (DOM 在、屏幕全白)。
                   *
                   * 这两层归 MainContentLayout 而非各视图:视图切换时它们不重建,
                   * 滚动位置和动画上下文才保得住。
                   */}
                  {routeLayout === 'thread' ? (
                    <div className="relative h-full min-h-0">
                      <div className="h-full min-h-0">
                        <div
                          className="relative flex h-full flex-col min-h-0"
                          data-vscode-context='{"chatgpt.supportsNewChatMenu": true}'
                          tabIndex={0}
                        >
                          {children}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex h-full flex-col"
                      data-vscode-context='{"chatgpt.supportsNewChatMenu": true}'
                      tabIndex={0}
                    >
                      <div className="relative min-h-0 flex-1">
                        <div className="h-full min-h-0">{children}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {rightPanel}
        </div>
        {bottomPanel}
      </DndContext>
    </main>
  )
}
