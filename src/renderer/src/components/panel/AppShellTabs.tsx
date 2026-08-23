import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useDndContext, useDroppable } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import type { AppShellTabPanelController } from '../../state/AppShellContext'
import { AppShellTab } from './AppShellTab'
import { AppShellTabPanel } from './AppShellTabPanel'

/**
 * AppShellTabs —— Codex bundle 里的共享组件(压缩名 KCr,**Codex 没有留下可读名**;
 * app-initial:208257)。RightPanelTabs(uDr)/ BottomPanelTabs(ewr)都只是
 * 给它传不同 props:controller + headerHeight + 四个槽位内容。
 *
 * DOM 逐层实测(2026-08-23):
 *
 *   div[data-app-shell-tabs=true].isolate.flex.h-full.min-h-0.flex-col…[contain:layout_paint]
 *   ├ div.{h-toolbar|h-toolbar-pane}.isolate.flex.min-w-0.shrink-0.select-none.items-center…px-2
 *   │ ├ div.my-auto.flex.shrink-0.items-center[role=presentation]      ← beforeList
 *   │ ├ div[data-app-shell-tab-strip-controller={panelId}]
 *   │ │   .relative.isolate.hide-scrollbar.flex.h-full.min-w-0.flex-1.scroll-px-1.items-center
 *   │ │   .overflow-x-auto.overflow-y-hidden  style: scroll-padding-inline-end: <sticky宽>px
 *   │ │ ├ div.sticky.start-0…(左渐隐 mask,IntersectionObserver 切 opacity-0/100)
 *   │ │ ├ span[aria-hidden]                            ← observer 哨兵
 *   │ │ ├ div.relative.flex.shrink-0.z-0
 *   │ │ │   style: gap:3px; width: clamp(n*90+(n-1)*3 px, calc(100% − sticky px), n*160+(n-1)*3 px)
 *   │ │ │   (实测:clamp 下限时塌缩成固定 px —— 3 tab/320 宽时写出 276px)
 *   │ │ │ ├ div.contents[role=tablist]                 ← sortable tabs
 *   │ │ │ └ div.sticky.w-0.shrink-0.z-10
 *   │ │ │     style: inset-inline-end:sticky px; margin-inline-start: 有 tab −3px / 无 tab 0
 *   │ │ │     └ div.w-max.bg-token-main-surface-primary  ← afterListSticky(「+」菜单)
 *   │ │ ├ span[aria-hidden]                            ← observer 哨兵
 *   │ │ └ div.sticky.z-10…(右渐隐 mask)style: inset-inline-end:sticky px
 *   │ └ div.my-auto.flex.shrink-0.items-center[role=presentation]      ← afterList
 *   └ 有 activeTab → AppShellTabPanel(tabpanel + error boundary)
 *     无 activeTab → div.relative.min-h-0.flex-1 > emptyState
 *
 *   有 activeTab 且(ready 或 tab 不要求 ready)→ AppShellTabPanel(key = activeTabReactKey)
 *   ready 但无 activeTab → div.relative.min-h-0.flex-1 > emptyState
 *   未 ready 且 tab 要求 ready → “Available when the worktree is ready”
 *   (Codex `KCr` 的 `g = l != null && (h || l.requiresWorkspaceReady === false)` 分支;
 *    ready 态 `h` 来自 worktree 状态 `bbr` —— WS 无 worktree provisioning,恒 ready)
 *
 * tab 的宽区间:Codex 实测 min 90 / max 160 / gap 3。
 */

const TAB_MIN_WIDTH = 90
const TAB_MAX_WIDTH = 160
const TAB_GAP = 3

export function AppShellTabs({
  controller,
  headerHeight,
  beforeList = null,
  afterList = null,
  afterListSticky = null,
  emptyState = null
}: {
  controller: AppShellTabPanelController
  /** 'toolbar' = h-toolbar(46px,右面板);'pane' = h-toolbar-pane(底部面板) */
  headerHeight: 'toolbar' | 'pane'
  beforeList?: ReactNode
  afterList?: ReactNode
  afterListSticky?: ReactNode
  emptyState?: ReactNode
}): React.JSX.Element {
  const { tabs, activeTab } = controller

  const stripRef = useRef<HTMLDivElement | null>(null)
  const stickyInnerRef = useRef<HTMLDivElement | null>(null)
  const startSentinelRef = useRef<HTMLSpanElement | null>(null)
  const endSentinelRef = useRef<HTMLSpanElement | null>(null)

  /** sticky 区实测宽(scroll-padding 与 clamp 的中间值都靠它;无内容时是 0 —— 实测一致) */
  const [stickyWidth, setStickyWidth] = useState(0)
  const [maskAtStart, setMaskAtStart] = useState(false)
  const [maskAtEnd, setMaskAtEnd] = useState(false)

  useEffect(() => {
    const strip = stripRef.current
    const sticky = stickyInnerRef.current
    if (!strip) return
    const ro = new ResizeObserver(() => {
      setStickyWidth(sticky?.getBoundingClientRect().width ?? 0)
    })
    ro.observe(strip)
    if (sticky) ro.observe(sticky)
    return () => ro.disconnect()
  }, [])

  // 两端渐隐 mask:哨兵不出视野 = 那一端还有内容可滚(Codex 用的 IntersectionObserver)
  useEffect(() => {
    const strip = stripRef.current
    const start = startSentinelRef.current
    const end = endSentinelRef.current
    if (!strip || !start || !end) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === start) setMaskAtStart(!entry.isIntersecting)
          else if (entry.target === end) setMaskAtEnd(!entry.isIntersecting)
        }
      },
      { root: strip, threshold: 1 }
    )
    io.observe(start)
    io.observe(end)
    return () => io.disconnect()
  }, [])

  // 激活 tab 滚进视野(tab 多到溢出时)
  useEffect(() => {
    if (activeTab == null) return
    stripRef.current
      ?.querySelector(
        `[data-app-shell-tab-controller][data-tab-id="${CSS.escape(activeTab.tabId)}"]`
      )
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTab])

  /*
   * tab 容器宽(Codex `BCr`,app-initial:207866):
   *   I = max(tabs.length, 关闭前的数量)   ← 关闭动画期间 tab 数不掉
   *   L = max(0, I-1) * 3(gap 总额)
   *   常态恒为 `clamp(${I*90+L}px, calc(100% - ${sticky}px), ${I*160+L}px)`;
   *   有关闭在进行(lockedWidth,strip 在 capture 阶段锁下被关 tab 的 offsetWidth)
   *   → 写死 `${I * lockedWidth + L}px`(此时全部 tab 等宽,恰为当前容器宽,
   *   其余 tab 在关闭动画期间不重排)。
   *   之前误记的「可用宽 ≤ min 时塌缩成固定 px」其实就是关闭中的锁宽态。
   */
  const [lockedWidth, setLockedWidth] = useState<number | null>(null)
  const [prevTabCount, setPrevTabCount] = useState(tabs.length)
  /* Codex:`c.length > b && x(c.length)`(渲染期调整);tab 数变化 = 关闭动画完成 → 解锁。
     这是 React 官方的「渲染期调整派生 state」模式(带条件,不会循环)。 */
  if (tabs.length !== prevTabCount) {
    setPrevTabCount(tabs.length)
    setLockedWidth(null)
  }
  const tabCountForWidth = Math.max(tabs.length, prevTabCount)

  const tabsWidth = useMemo(() => {
    const n = tabCountForWidth
    const gapTotal = Math.max(0, n - 1) * TAB_GAP
    if (lockedWidth != null) return `${n * lockedWidth + gapTotal}px`
    const min = n * TAB_MIN_WIDTH + gapTotal
    const max = n * TAB_MAX_WIDTH + gapTotal
    return `clamp(${min}px, calc(100% - ${stickyWidth}px), ${max}px)`
  }, [tabCountForWidth, lockedWidth, stickyWidth])

  // strip 本身是 droppable(Codex:id `app-shell-tab-strip:{panelId}`,
  // data { controller, kind: 'app-shell-tab-strip' } —— zCr 里的 O/k 实测)。
  // **DndContext 不在这里**:Codex 把它放在 MainContentSurface 层(右/底面板共用一个,
  // 跨面板拖拽的前提),所以 dnd-kit 的 DndDescribedBy 播报节点也不会落在 strip 行里。
  // onDragEnd 由 MainContentLayout 统一派发(按 droppable data 里的 controller)。
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `app-shell-tab-strip:${controller.panelId}`,
    data: { controller, kind: 'app-shell-tab-strip' }
  })
  const { active: draggingActive } = useDndContext()
  const isDraggingAny = draggingActive != null

  // Codex `bbr` = worktree provisioning 状态;WS 没有 worktree,恒 'ready'
  const workspaceReady = true
  const activeRenderable =
    activeTab != null && (workspaceReady || activeTab.requiresWorkspaceReady === false)

  return (
    <div
      data-app-shell-tabs="true"
      className="isolate flex h-full min-h-0 flex-col bg-token-main-surface-primary [contain:layout_paint]"
    >
      <div
        className={`${headerHeight === 'toolbar' ? 'h-toolbar' : 'h-toolbar-pane'} isolate flex min-w-0 shrink-0 select-none items-center bg-token-main-surface-primary px-2 [contain:layout_paint]`}
      >
        <div className="my-auto flex shrink-0 items-center" role="presentation">
          {beforeList}
        </div>
        <div
          ref={(el) => {
            stripRef.current = el
            setDroppableRef(el)
          }}
          data-app-shell-tab-strip-controller={controller.panelId}
          className="relative isolate hide-scrollbar flex h-full min-w-0 flex-1 scroll-px-1 items-center overflow-x-auto overflow-y-hidden [contain:layout_paint]"
          style={{ scrollPaddingInlineEnd: `${stickyWidth}px` }}
        >
          <div
            aria-hidden="true"
            className={`sticky start-0 z-10 h-full w-0 after:absolute transition-opacity after:pointer-events-none duration-basic after:start-0 after:top-0 after:bottom-0 after:w-10 after:bg-linear-to-l after:from-transparent after:to-token-main-surface-primary after:content-[''] ${
              maskAtStart ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <span aria-hidden="true" ref={startSentinelRef} />
          {/* 拖拽中 z-20(Codex `BCr`:`V ? 'z-20' : 'z-0'`,V = dnd dragState 非空) */}
          <div
            className={`relative flex shrink-0 ${isDraggingAny ? 'z-20' : 'z-0'}`}
            style={{ gap: TAB_GAP, width: tabsWidth }}
            onMouseDownCapture={(e) => {
              // Codex `te`:中键点击或点关闭钮 → 锁下被关 tab 的当前像素宽
              if (!(e.target instanceof Element)) return
              if (e.button !== 1 && e.target.closest('[data-app-shell-tab-close-button]') == null)
                return
              const tabEl = e.target.closest('[data-app-shell-tab-controller]')
              if (tabEl != null) setLockedWidth((tabEl as HTMLElement).offsetWidth)
            }}
          >
            <div role="tablist" className="contents">
              <SortableContext
                items={tabs.map((t) => t.dndId)}
                strategy={horizontalListSortingStrategy}
              >
                {tabs.map((tab, i) => (
                  <AppShellTab
                    key={tab.tabId}
                    controller={controller}
                    tab={tab}
                    index={i}
                    isActive={tab.tabId === controller.activeTabId}
                    isBeforeActive={tabs[i + 1]?.tabId === controller.activeTabId}
                    isLast={i === tabs.length - 1}
                  />
                ))}
              </SortableContext>
            </div>
            <div
              className="sticky w-0 shrink-0 z-10"
              style={{
                insetInlineEnd: `${stickyWidth}px`,
                marginInlineStart: tabs.length > 0 ? -3 : 0
              }}
            >
              <div ref={stickyInnerRef} className="w-max bg-token-main-surface-primary">
                {afterListSticky}
              </div>
            </div>
          </div>
          <span aria-hidden="true" ref={endSentinelRef} />
          <div
            aria-hidden="true"
            className={`sticky z-10 h-full w-0 after:absolute transition-opacity duration-basic after:pointer-events-none after:end-0 after:inset-y-0 after:w-10 after:bg-linear-to-r after:from-transparent after:to-token-main-surface-primary after:content-[''] ${
              maskAtEnd ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ insetInlineEnd: `${stickyWidth}px` }}
          />
        </div>
        <div className="my-auto flex shrink-0 items-center" role="presentation">
          {afterList}
        </div>
      </div>
      {/*
        Codex `KCr` 的内容区三分支:
          g(tab 可渲染) → QCr(tabpanel + error boundary),key = activeTabReactKey$
          ready 且无 tab → emptyState 容器
          未 ready → worktree provisioning 占位
      */}
      {activeRenderable && activeTab != null ? (
        <AppShellTabPanel
          key={controller.activeTabReactKey ?? activeTab.tabId}
          controller={controller}
          tab={activeTab}
        />
      ) : workspaceReady ? (
        <div className="relative min-h-0 flex-1">{emptyState}</div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-token-text-secondary">
          Available when the worktree is ready
        </div>
      )}
    </div>
  )
}
