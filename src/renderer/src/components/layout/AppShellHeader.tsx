import { type ButtonHTMLAttributes, type ReactNode } from 'react'
/*
 * 用 PanelContext 而不是 AppShellContext —— 后者虽然是它的超集,但
 * `AppShellProvider` 目前**没有挂载**(AppShell.tsx 挂的仍是 PanelProvider),
 * 从未挂载的 context 取值会直接抛 "useAppShell must be used within
 * AppShellProvider"。这一行原先 import 了 useAppShell 却仍在下面调 usePanels,
 * 两边都不成立,于是渲染时崩在 `usePanels is not defined`。
 * 等右面板那套迁移收尾、AppShellProvider 挂上之后再换过来。
 */
import { usePanels } from '../../state/PanelContext'
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
  return (
    <>
      <div
        aria-hidden="true"
        className={`invisible pointer-events-none fixed top-0 left-0 min-w-max [&_*]:![view-transition-name:none] ${pad}`}
      >
        <div className="inline-flex h-full items-center gap-1.5 no-drag pointer-events-auto w-auto">
          {children}
        </div>
      </div>
      <div
        data-test-id="header-shell-slot"
        className={`pointer-events-none relative h-full shrink-0 [container-type:inline-size] ${pad}`}
      >
        <div className="inline-flex h-full items-center gap-1.5 pointer-events-none w-full">
          {children}
        </div>
      </div>
    </>
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
  // 只取 sidebarOpen —— 它只用来切 aria-label。Codex 不给按钮激活态,
  // 所以 rightPanelOpen / bottomPanelOpen / panelMaximized 在 header 里都不需要。
  const { sidebarOpen, toggleSidebar, toggleRightPanel, toggleBottomPanel } = usePanels()

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
            <HdrButton aria-label="Toggle bottom panel" onClick={toggleBottomPanel}>
              <BottomPanelIcon className="icon-xs" />
            </HdrButton>
          </span>
        </div>
        <div className="no-drag pointer-events-auto flex shrink-0 items-center">
          <span className="contents" data-state="closed">
            <HdrButton aria-label="Toggle side panel" onClick={toggleRightPanel}>
              <SidePanelIcon className="icon-xs rotate-180" />
            </HdrButton>
          </span>
        </div>
      </HeaderSlot>
    </header>
  )
}
