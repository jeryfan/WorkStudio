import { useCallback, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { motion, useMotionTemplate } from 'framer-motion'
import { useAppShell, useAppShellSlot } from '../../state/AppShellContext'
import { useSidePanelTabActions } from '../panel/useSidePanelTabActions'
import { cx } from '../../utils/cx'
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
 * 槽内容 —— 左右两侧各渲染**两遍**:一份不可见的测量副本 + 一份真实的(Codex `cJr`)。
 *
 * Codex 这么做是因为槽是 `[container-type:inline-size]` 容器:中间的
 * context-menu-surface 要靠容器查询知道两侧占了多宽才能算自己的可用宽度,
 * 而容器本身的宽度又不能由内容决定(否则循环)。所以先用一个
 * `invisible fixed min-w-max` 的副本把自然宽度量出来,真实那份再 `w-full` 铺开。
 *
 * 副本必须带 `[&_*]:![view-transition-name:none]` —— 否则视图过渡时
 * 同名元素出现两份,过渡直接失效。
 *
 * padding 只在槽内**有 entry 时**才加(Codex `!!e.length && a`),且:
 *   start 槽 → `ps-[max(var(--spacing-token-safe-header-left),0.5rem)]`
 *   start 槽里有 align=end 的 entry,或 end 槽 → 再加 `pe-2`
 */
function HeaderSlot({
  side,
  hasEndAlignedEntry = false,
  children
}: {
  side: 'start' | 'end'
  /** Codex `e.some(({align}) => align === 'end')` —— 决定 start 槽是否补 pe-2 */
  hasEndAlignedEntry?: boolean
  children: ReactNode
}): React.JSX.Element {
  const pad = cx(
    side === 'start' && 'ps-[max(var(--spacing-token-safe-header-left),0.5rem)]',
    ((side === 'start' && hasEndAlignedEntry) || side === 'end') && 'pe-2'
  )
  /*
   * 两个宽度,两种来源 —— Codex `cJr` 逐字:
   *
   *     style: { width: slotWidth, minWidth: `${fitWidth}px` }
   *     // start: slotWidth = leftPanelAnimatedWidth
   *     // end:   slotWidth = rightPanelAnimatedWidth
   *     // fitWidth = 不可见副本量出来的内容自然宽
   *
   * `width` **是面板宽度**,不是内容宽度:header 是 `fixed inset-x-0` 横跨整窗,
   * 两端槽各预留一个面板的宽度,中段(标题 + 三点菜单)才落在两个面板之间的
   * 净跨度里。8214 实测(窗口 1200、侧栏 358.99):
   *     侧栏开 → `width: 358.99px; min-width: 180px`,标题 x=373
   *     侧栏关 → `width: 0px; min-width: 214px`,标题 x=222
   *     右面板开 489 → end 槽 `width: 489.01px; min-width: 70px`
   *
   * 之前这里把**测量宽写进了 width**、且没有 minWidth,于是槽只有 ~180px 宽,
   * 标题从 x≈188 开始 —— 正好压进 340px 的侧栏里。这就是「标题从侧边栏开始」。
   *
   * `min-width` 的作用是反向保底:侧栏折叠(width:0)时槽仍要容下自己的按钮。
   */
  const {
    headerLeftWidth,
    headerRightWidth,
    leftPanelAnimatedWidth,
    rightPanelAnimatedWidth,
    rightPanelWidthMode
  } = useAppShell()
  const fitWidth = side === 'start' ? headerLeftWidth : headerRightWidth
  /*
   * Codex `kJr`:**full-width 模式下 rightPanelAnimatedWidth 恒为 0** ——
   * 面板占满主区时 header 右槽不再让位(让位改由 tab strip 自己的 spacer 承担)。
   */
  const slotWidth =
    side === 'start'
      ? leftPanelAnimatedWidth
      : rightPanelWidthMode === 'full'
        ? 0
        : rightPanelAnimatedWidth
  const minWidth = useMotionTemplate`${fitWidth}px`

  /*
   * 测量副本 → fitWidth(Codex `Rj` 的 resize-observer callback ref,`t.set(width)`)。
   * 直接写 MotionValue,不过 React:这个值每帧都可能变(字体加载、按钮增减),
   * 走 state 会白白重渲染整棵 shell。
   */
  const measureRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el == null) return
      fitWidth.set(el.getBoundingClientRect().width)
      const ro = new ResizeObserver(() => fitWidth.set(el.getBoundingClientRect().width))
      ro.observe(el)
      return () => ro.disconnect()
    },
    [fitWidth]
  )

  return (
    <>
      <div
        ref={measureRef}
        aria-hidden="true"
        className={cx(
          'invisible pointer-events-none fixed top-0 left-0 min-w-max [&_*]:![view-transition-name:none]',
          pad
        )}
      >
        <div className="inline-flex h-full items-center gap-1.5 no-drag pointer-events-auto w-auto">
          {children}
        </div>
      </div>
      <motion.div
        data-test-id="header-shell-slot"
        className={cx(
          'pointer-events-none relative h-full shrink-0 [container-type:inline-size]',
          pad
        )}
        style={{ width: slotWidth, minWidth }}
      >
        <div className="inline-flex h-full items-center gap-1.5 pointer-events-none w-full">
          {children}
        </div>
      </motion.div>
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

      <HeaderContextSurface />

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

/**
 * 中段 —— thread 标题与动作的挂载点(Codex `sJr` 里那一层
 * `data-testid="app-shell-header-context-menu-surface"`)。
 *
 * 内容不是写死的:`$P.Header` 注册的节点落在 slot 'header'(Codex atom `CUn`),
 * `$P.HeaderAction` 注册的动作按 align 分三组(Codex `h`/`g`/`_`):
 * - start:紧贴 Header 内容右侧
 * - end:`ms-auto` 推到最右
 * - center:**另一层** `fixed inset-x-0` 的居中带(左右各留出面板宽度的占位),
 *   本项目还没有 center 动作(Codex 的 home-composer-mode-toggle 是 Work/Chat 切换),
 *   所以这一层暂不渲染 —— 有注册者时再补,不为空结构占位。
 *
 * `[contain:layout_paint]` 把长标题的重排锁在这层内;
 * `[&_a]:pointer-events-auto` 那一串是因为整个 header 是 pointer-events-none,
 * 需要按标签逐个放开,而不是给容器开 auto(那样会把拖拽区一起吃掉)。
 */
function HeaderContextSurface(): React.JSX.Element {
  const headerNode = useAppShellSlot('header')
  const { headerActions, rightPanelWidthMode } = useAppShell()
  const start = headerActions.filter((a) => a.align === 'start')
  const end = headerActions.filter((a) => a.align === 'end')
  /*
   * Codex `m = J($E)`(右面板 full-width):中段整块 `aria-hidden` + `invisible` ——
   * 面板占满主区时标题不可见也不该被读屏器念到,但结构留着(宽度参与布局)。
   */
  const hidden = rightPanelWidthMode === 'full'

  return (
    <div
      aria-hidden={hidden}
      data-testid="app-shell-header-context-menu-surface"
      className={cx(
        'pointer-events-none relative ms-2 flex h-full min-w-0 flex-1 isolate items-center gap-1.5 overflow-hidden [contain:layout_paint] pe-1.5',
        hidden && 'invisible'
      )}
    >
      {headerNode != null && (
        <div className="pointer-events-none w-full min-w-0 flex-1 [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_select]:pointer-events-auto [&_textarea]:pointer-events-auto">
          {headerNode}
        </div>
      )}
      {start.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5">
          {start.map((action) => (
            <div
              key={action.actionId}
              className="pointer-events-auto flex shrink-0 items-center no-drag"
            >
              {action.node}
            </div>
          ))}
        </div>
      )}
      {end.length > 0 && (
        <div className="ms-auto flex shrink-0 items-center gap-1.5">
          {end.map((action) => (
            <div
              key={action.actionId}
              className="pointer-events-auto flex shrink-0 items-center no-drag"
            >
              {action.node}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
