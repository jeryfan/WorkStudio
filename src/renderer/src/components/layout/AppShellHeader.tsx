import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useAppShell } from '../../state/AppShellContext'
import { useSidePanelTabActions } from '../panel/useSidePanelTabActions'
import { ArrowIcon, BottomPanelIcon, SidebarHideIcon, SidePanelIcon } from '../icons'

/**
 * 工具栏图标按钮 —— Codex 实测 **28×28**,svg 16px(icon-xs)。
 *
 * 尺寸来自 `h-token-button-composer`(= --spacing-token-button-composer = 28px)
 * + `aspect-square` + `!px-0`,不是写死的 size-8(32px)。
 *
 * **Codex 没有"激活态"**:侧栏开着的时候,Hide sidebar 按钮的类名和其他按钮
 * 一模一样,不给底色。类里那个 `data-[state=open]:bg-token-list-hover-background`
 * 是给下拉/弹层的开合状态用的,不是给面板开关的。原先这里的 tinted 变体
 * (灰底 + 实色前景)是 WorkStudio 自己加的。
 */
function HdrButton({
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <button
      type="button"
      className={`no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-lg text-token-text-tertiary enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent h-token-button-composer px-2 py-0 text-base leading-[18px] aspect-square shrink-0 items-center justify-center !px-0 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/**
 * 槽内容 —— 左右两侧各渲染**两遍**:一份不可见的测量副本 + 一份真实的。
 *
 * Codex 这么做是因为槽是 `[container-type:inline-size]` 容器:中间的
 * context-menu-surface 要靠容器查询知道两侧占了多宽才能算自己的可用宽度,
 * 而容器本身的宽度又不能由内容决定(否则循环)。所以先用一个
 * `invisible fixed min-w-max` 的副本把自然宽度量出来,真实那份再 `w-full` 铺开。
 *
 * 副本必须带 `[&_*]:![view-transition-name:none]` —— 否则视图过渡时
 * 同名元素出现两份,过渡直接失效。
 */
function HeaderSlot({
  side,
  children
}: {
  side: 'start' | 'end'
  children: ReactNode
}): React.JSX.Element {
  const pad = side === 'start' ? 'ps-[max(var(--spacing-token-safe-header-left),0.5rem)]' : 'pe-2'
  /*
   * 测量副本 → 真实槽宽(Codex `upsertHeaderSlotElement`)。
   *
   * 真实槽是 `shrink-0` + `[container-type:inline-size]`:容器查询要求它的宽度
   * **不能由内容决定**,所以它自己不会被内容撑开 —— 不给宽度时宽度就只剩 padding。
   * 实测(1200 视口):右槽 `pe-2` → 宽 8px,里面两个 28px 按钮溢出到
   * x=1192 / 1226,而视口只到 1200,于是“右上角的图标从来没出现过”。
   *
   * Codex 的做法就是先量一遍(bundle 里 `headerLeftWidth` / `headerRightWidth`),
   * 把不可见副本的宽度写回真实槽,**同时发布到 AppShell store** ——
   * 右面板 strip 的 header 让位 spacer 和全宽时的左侧占位都读这个值。
   * 副本必须带 `[&_*]:![view-transition-name:none]`,否则视图过渡时同名元素出现两份。
   */
  const { setHeaderSlotWidth } = useAppShell()
  const measureRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = measureRef.current
    if (el == null) return
    const apply = (): void => setHeaderSlotWidth(side, el.getBoundingClientRect().width)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [side, setHeaderSlotWidth])

  return (
    <>
      <div
        ref={measureRef}
        aria-hidden="true"
        className={`invisible pointer-events-none fixed top-0 left-0 min-w-max [&_*]:![view-transition-name:none] ${pad}`}
      >
        <div className="inline-flex h-full items-center gap-1.5 no-drag pointer-events-auto w-auto">
          {children}
        </div>
      </div>
      {/* 宽度 = start 槽:headerLeftWidth / end 槽:headerRightWidth,从 AppShell store 读回 */}
      <HeaderSlotReal side={side} pad={pad}>
        {children}
      </HeaderSlotReal>
    </>
  )
}

function HeaderSlotReal({
  side,
  pad,
  children
}: {
  side: 'start' | 'end'
  pad: string
  children: ReactNode
}): React.JSX.Element {
  const { headerLeftWidth, headerRightWidth } = useAppShell()
  const width = side === 'start' ? headerLeftWidth : headerRightWidth
  return (
    <div
      data-test-id="header-shell-slot"
      className={`pointer-events-none relative h-full shrink-0 [container-type:inline-size] ${pad}`}
      style={width === 0 ? undefined : { width: `${width}px` }}
    >
      <div className="inline-flex h-full items-center gap-1.5 pointer-events-none w-full">
        {children}
      </div>
    </div>
  )
}

/**
 * header —— Codex 的形态:**在 `main` 内部**,但用 `fixed inset-x-0 top-0` 逃出
 * 父盒子横跨整窗(main 没有建立包含块,实测 header 宽度 = 窗口宽度)。
 *
 * 高度用 `h-toolbar`(46px),不是 h-11(44px) —— 和 aside 的 padding-top、
 * footer 的行高共用同一个 token。之前差的这 2px 会让侧栏内容与主区内容错开一行。
 *
 * 结构是五个兄弟:左测量副本 / 左槽 / 中间 context surface / 右测量副本 / 右槽。
 * 中间那层是给 thread 标题和它右侧动作用的,首页态为空但结构要在。
 */
export function AppShellHeader(): React.JSX.Element {
  const {
    sidebarOpen,
    toggleSidebar,
    rightPanelOpen,
    toggleRightPanel,
    bottomPanelOpen,
    toggleBottomPanel,
    rightPanelController
  } = useAppShell()
  // Codex `jr`:面板关 && 无 tab && 只剩 1 个可用 action → 直接执行它,不开面板
  const sidePanelActions = useSidePanelTabActions(rightPanelController)
  const onToggleSidePanel = (): void => {
    if (
      !rightPanelOpen &&
      rightPanelController.tabs.length === 0 &&
      sidePanelActions.length === 1
    ) {
      sidePanelActions[0].onSelect()
      return
    }
    toggleRightPanel()
  }

  return (
    <header
      data-app-shell-application-menu-bar="false"
      data-app-shell-header-edge-scroll="false"
      data-pip-obstacle="app-shell-header"
      className="pointer-events-none fixed z-30 flex h-toolbar min-w-0 items-center draggable bg-[var(--codex-titlebar-tint,transparent)] inset-x-0 top-0"
    >
      <HeaderSlot side="start">
        <div className="pointer-events-auto flex shrink-0 items-center no-drag">
          <div className="flex items-center gap-1">
            <span className="contents" data-state="closed">
              <HdrButton
                aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                onClick={toggleSidebar}
              >
                <SidebarHideIcon className="icon-xs" />
              </HdrButton>
            </span>
            <span className="contents" data-state="closed">
              <HdrButton aria-label="Back">
                <ArrowIcon className="icon-xs" />
              </HdrButton>
            </span>
            <span className="contents" data-state="closed">
              <HdrButton aria-label="Forward" disabled>
                <ArrowIcon className="icon-xs -scale-x-100" />
              </HdrButton>
            </span>
          </div>
        </div>
      </HeaderSlot>

      {/*
       * 中间的 context surface —— thread 标题与右侧动作的挂载点。
       * `[contain:layout_paint]` 把长标题的重排锁在这层内;
       * `[&_a]:pointer-events-auto` 那一串是因为整个 header 是 pointer-events-none,
       * 需要按标签逐个放开,而不是给容器开 auto(那样会把拖拽区一起吃掉)。
       */}
      <div
        aria-hidden="false"
        data-testid="app-shell-header-context-menu-surface"
        className="pointer-events-none relative ms-2 flex h-full min-w-0 flex-1 isolate items-center gap-1.5 overflow-hidden [contain:layout_paint] pe-1.5"
      >
        <div className="pointer-events-none w-full min-w-0 flex-1 [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_select]:pointer-events-auto [&_textarea]:pointer-events-auto">
          <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 draggable electron:h-toolbar extension:py-row-y">
            <div className="text-md flex min-w-0 items-center gap-0 truncate text-base focus-within:overflow-visible electron:font-medium">
              <div className="flex min-w-0 items-center gap-1" />
            </div>
            <div className="flex items-center justify-end gap-1.5" />
          </div>
        </div>
      </div>

      <HeaderSlot side="end">
        {/*
         * Codex 右侧是两个**各自独立**的 shrink-0 容器(第一个带 ms-auto 把整组推到右边),
         * 不是一个 gap-1 的按钮组 —— 所以两个按钮之间的间距来自外层 gap-1.5 而不是 gap-1。
         * Codex 这里没有"最大化面板"按钮,原先那个 ExpandIcon 是 WorkStudio 自己加的。
         */}
        <div className="no-drag pointer-events-auto flex shrink-0 items-center ms-auto">
          <span className="contents" data-state="closed">
            {/* Codex 的两个 panel toggle 都是 `bn`(ThreadPanelToggleButton):带 aria-pressed */}
            <HdrButton
              aria-label="Toggle bottom panel"
              aria-pressed={bottomPanelOpen}
              onClick={toggleBottomPanel}
            >
              <BottomPanelIcon className="icon-xs" />
            </HdrButton>
          </span>
        </div>
        <div className="no-drag pointer-events-auto flex shrink-0 items-center">
          <span className="contents" data-state="closed">
            <HdrButton
              aria-label="Toggle side panel"
              aria-pressed={rightPanelOpen}
              onClick={onToggleSidePanel}
            >
              <SidePanelIcon className="icon-xs rotate-180" />
            </HdrButton>
          </span>
        </div>
      </HeaderSlot>
    </header>
  )
}
