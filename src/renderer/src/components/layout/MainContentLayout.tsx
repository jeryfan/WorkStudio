import type { ReactNode } from 'react'
import { TopBar } from './TopBar'

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
export function ContentArea({
  children,
  /** 进入会话后由 ChatView 侧切成 full-bleed;首页是 visible */
  topFade = 'visible',
  threadEdgeDivider = false,
  rightPanelFullWidth = false,
  layout = 'default',
  /** 右面板 —— 作为 MainContentViewport 的兄弟渲染 */
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
  rightPanel?: ReactNode
  bottomPanel?: ReactNode
}): React.JSX.Element {
  return (
    <main
      /* 模块类自带 isolate/flex/flex-col/flex-1/min-height:0/relative(components.css:2183)。
         主行现在是真正的 flex 行了,高度靠 stretch、宽度靠 flex:1,不需要 h-full/w-full。 */
      className="codex-MainContentSurface"
      data-app-shell-main-surface="default"
    >
      <div className="pointer-events-none absolute inset-y-0 start-0" />
      <TopBar />
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
                <div
                  className="flex h-full flex-col"
                  data-vscode-context='{"chatgpt.supportsNewChatMenu": true}'
                  tabIndex={0}
                >
                  {children}
                </div>
              </div>
            </div>
          </div>
        </div>
        {rightPanel}
      </div>
      {bottomPanel}
    </main>
  )
}
