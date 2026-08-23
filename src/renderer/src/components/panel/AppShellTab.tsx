import { useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'framer-motion'
import type { AppShellTabDescriptor, AppShellTabPanelController } from '../../state/AppShellContext'
import { CloseTabIcon } from '../icons'

/**
 * 单个 tab —— 逐层复刻 Codex 实测 DOM(2026-08-23,1512 视口):
 *
 *   div[data-app-shell-tab-controller][data-tab-id]   ← sortable 节点(transform 在这层)
 *     .@container/app-shell-tab.my-auto.relative.flex.shrink-0.items-center.overflow-hidden.contain-content
 *     style: flex-basis:0; flex-grow:1; max-width:160px; min-width:90px
 *   ├ div.flex.min-w-0.flex-1.items-center.pe-1
 *   │ └ div.group/tab…[role=button][tabindex=0][aria-roledescription=sortable]
 *   │     style: --app-shell-tab-background: color-mix(…)   ← hover/active 底色都读它
 *   │   ├ div.pointer-events-none.absolute.inset-0.z-0.rounded-md
 *   │   │   .group-hover/tab:bg-[var(--app-shell-tab-background)]   (+ active 时常驻 bg)
 *   │   ├ button[role=tab].no-drag…(图标 + 标题)
 *   │   └ button[data-app-shell-tab-close-button]   ← hover/focus-within 才可见;
 *   │       容器查询 @max-[4rem]/app-shell-tab:invisible(tab 太窄时藏)
 *   └ div[data-app-shell-tab-separator][-index]     ← 分隔线,opacity 见下
 *
 * 分隔线规则(实测,修正 spec 文档里的 opacity-70):**显示态是 opacity-100**;
 * 最后一个 tab、active tab、active 前一个 tab 的分隔线都 opacity-0。
 *
 * 关闭动画:Codex 关 tab 时锁宽(lockedWidth)再收起。这里点关闭/中键时不立刻
 * closeTab,先把自己钉在当前像素宽(flex-grow 撤掉)做 width→0,动画结束才真正移除,
 * 其他 tab 因此不会在关闭过程中跳变。
 */

/** 关闭收起的时长;过长会拖慢连续关 tab 的手感 */
const CLOSE_ANIMATION_MS = 150

export function AppShellTab({
  controller,
  tab,
  index,
  isActive,
  isBeforeActive,
  isLast
}: {
  controller: AppShellTabPanelController
  tab: AppShellTabDescriptor
  index: number
  isActive: boolean
  /** 自己是否为 active 的前一项(决定分隔线) */
  isBeforeActive: boolean
  isLast: boolean
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.dndId
  })
  const bodyRef = useRef<HTMLDivElement | null>(null)
  // 关闭动画期间:钉住像素宽 + 收起;为 null 表示正常态
  const [closingWidth, setClosingWidth] = useState<number | null>(null)

  const beginClose = (): void => {
    if (closingWidth != null) return
    setClosingWidth(bodyRef.current?.getBoundingClientRect().width ?? null)
    window.setTimeout(() => controller.closeTab(tab.tabId), CLOSE_ANIMATION_MS)
  }

  const separatorVisible = !isLast && !isActive && !isBeforeActive

  return (
    <div
      ref={setNodeRef}
      data-app-shell-tab-controller={controller.panelId}
      data-tab-id={tab.tabId}
      className="@container/app-shell-tab my-auto relative flex shrink-0 items-center overflow-hidden contain-content"
      style={{
        flexBasis: 0,
        flexGrow: closingWidth != null ? 0 : 1,
        maxWidth: closingWidth != null ? undefined : 160,
        minWidth: closingWidth != null ? undefined : 90,
        width: closingWidth ?? undefined,
        // dnd-kit 拖拽位移
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined
      }}
    >
      <motion.div
        className="flex min-w-0 flex-1 items-center pe-1"
        animate={closingWidth != null ? { width: 0, opacity: 0 } : { opacity: 1 }}
        transition={{ duration: CLOSE_ANIMATION_MS / 1000, ease: 'easeOut' }}
      >
        <div
          ref={bodyRef}
          role="button"
          tabIndex={0}
          aria-disabled={false}
          data-tab-id={tab.tabId}
          {...attributes}
          {...listeners}
          onDoubleClick={() => tab.isPreview && controller.pinTab(tab.tabId)}
          onMouseDownCapture={(e) => {
            // 中键关闭(Codex:onMouseDownCapture 里 e.button===1)
            if (e.button === 1 && tab.isClosable) {
              e.preventDefault()
              beginClose()
            }
          }}
          className="group/tab relative flex h-7 w-full max-w-39 shrink-0 items-center overflow-hidden rounded-lg bg-token-main-surface-primary px-2 py-1"
          style={
            {
              '--app-shell-tab-background':
                'color-mix(in srgb, var(--color-token-foreground, var(--color-text-foreground)) 5%, var(--color-token-main-surface-primary))'
            } as React.CSSProperties
          }
        >
          <div
            className={`pointer-events-none absolute inset-0 z-0 rounded-md group-hover/tab:bg-[var(--app-shell-tab-background)]${
              isActive ? ' bg-[var(--app-shell-tab-background)]' : ''
            }`}
          />
          <button
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => controller.activateTab(tab.tabId)}
            className="no-drag relative z-10 flex min-w-0 flex-1 items-center gap-2 pe-3.5 text-sm text-token-text-primary"
          >
            <span
              aria-hidden="true"
              className="icon-xs relative flex shrink-0 items-center justify-center overflow-visible"
            >
              <span className="flex size-full items-center justify-center">{tab.icon}</span>
            </span>
            <span className="relative min-w-0 flex-1 overflow-hidden">
              <span
                className={`block w-full min-w-0 whitespace-nowrap text-start${tab.isPreview ? ' italic' : ''}`}
                dir="auto"
                data-state="closed"
              >
                {tab.title}
              </span>
            </span>
          </button>
          {tab.isClosable && (
            <button
              type="button"
              data-app-shell-tab-close-button="true"
              aria-label={`Close ${tab.title} tab`}
              onClick={(e) => {
                e.stopPropagation()
                beginClose()
              }}
              className="no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-md text-token-text-tertiary enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent flex size-5 items-center justify-center p-0.5 [&>svg]:icon-2xs absolute end-1 top-1/2 z-30 -translate-y-1/2 @max-[4rem]/app-shell-tab:invisible pointer-events-none opacity-0 group-focus-within/tab:pointer-events-auto group-focus-within/tab:opacity-100 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
            >
              <CloseTabIcon aria-hidden="true" />
            </button>
          )}
        </div>
      </motion.div>
      <div
        aria-hidden="true"
        data-app-shell-tab-separator={tab.tabId}
        data-app-shell-tab-separator-index={index}
        className={`h-3 w-px shrink-0 end-0 absolute bg-token-border transition-opacity duration-basic ${
          separatorVisible ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  )
}
