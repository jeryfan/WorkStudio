import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
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
  /** strip 内容区宽(判断 clamp 是否塌缩成固定 px) */
  const [stripWidth, setStripWidth] = useState(0)
  const [maskAtStart, setMaskAtStart] = useState(false)
  const [maskAtEnd, setMaskAtEnd] = useState(false)

  useEffect(() => {
    const strip = stripRef.current
    const sticky = stickyInnerRef.current
    if (!strip) return
    const ro = new ResizeObserver(() => {
      setStripWidth(strip.clientWidth)
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
      ?.querySelector(`[data-app-shell-tab-controller][data-tab-id="${CSS.escape(activeTab.tabId)}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTab])

  /*
   * tab 容器宽:Codex 是 JS 算好写进内联 style。
   * min = n*90+(n-1)*3,max = n*160+(n-1)*3,preferred = 100% − sticky。
   * 实测:可用宽 ≤ min 时直接写死 min px(不再挂 clamp)。
   */
  const tabsWidth = useMemo(() => {
    const n = tabs.length
    const min = n > 0 ? n * TAB_MIN_WIDTH + (n - 1) * TAB_GAP : 0
    const max = n > 0 ? n * TAB_MAX_WIDTH + (n - 1) * TAB_GAP : 0
    const available = stripWidth - stickyWidth
    if (n > 0 && stripWidth > 0 && min >= available) return `${min}px`
    const preferred = stickyWidth === 0 ? '100% + 0px' : `calc(100% - ${stickyWidth}px)`
    return `clamp(${min}px, ${preferred}, ${max}px)`
  }, [tabs.length, stripWidth, stickyWidth])

  const sensors = useSensors(
    // 拖动阈值 4px:点击仍走 activate,不触发拖拽
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )
  // strip 本身是 droppable(Codex id:`app-shell-tab-strip:{panelId}`),拖到空白尾区 = 落到末尾
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `app-shell-tab-strip:${controller.panelId}`
  })

  const onDragEnd = (e: DragEndEvent): void => {
    const { active, over } = e
    if (over == null || active.id === over.id) return
    // over 可能是 strip 本身(拖到空白尾区):落到末尾
    const toId =
      over.id === `app-shell-tab-strip:${controller.panelId}`
        ? (tabs[tabs.length - 1]?.dndId ?? null)
        : String(over.id)
    if (toId == null) return
    const fromTabId = tabs.find((t) => t.dndId === String(active.id))?.tabId
    const toTabId = tabs.find((t) => t.dndId === toId)?.tabId
    if (fromTabId != null && toTabId != null) controller.reorderTab(fromTabId, toTabId)
  }

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
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
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
            <div className="relative flex shrink-0 z-0" style={{ gap: TAB_GAP, width: tabsWidth }}>
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
        </DndContext>
        <div className="my-auto flex shrink-0 items-center" role="presentation">
          {afterList}
        </div>
      </div>
      {activeTab != null ? (
        <AppShellTabPanel controller={controller} tab={activeTab} />
      ) : (
        <div className="relative min-h-0 flex-1">{emptyState}</div>
      )}
    </div>
  )
}
