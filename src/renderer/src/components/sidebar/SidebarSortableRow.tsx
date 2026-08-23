import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * 折叠动画层(D8)—— Codex 在**三处**都用同一个形态:
 * 分节内容区、项目的会话列表、每一行的外壳。实测稳态内联样式是
 * `height: auto; opacity: 1; overflow: visible;`,类名只有 `overflow-hidden`
 * —— 这正是 framer-motion 动画结束后留下的痕迹(类给静态兜底,内联给动画)。
 *
 * 为什么每一行也要包一层:行高度参与折叠动画,没有这层裁剪,折叠过程中
 * 行内容会溢出到相邻分节上。
 *
 * 折叠时**整块不渲染**(不是 height:0 常驻)—— Codex 折叠的那一节 DOM 里
 * 只有标题行一个子元素,项目折叠时也没有这一层。常驻会留下可聚焦的隐藏元素。
 */
export function SidebarCollapseRegion({
  children,
  open = true
}: {
  children: ReactNode
  open?: boolean
}): React.JSX.Element {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className="overflow-hidden"
          initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
          animate={{ height: 'auto', opacity: 1, overflow: 'visible' }}
          exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
          transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * 列表容器 —— Codex 用 `div.flex.flex-col[role="list"][tabindex="-1"]`。
 *
 * `tabindex="-1"` 让容器可编程聚焦(拖拽结束后把焦点还回来),但不进 Tab 序列。
 * `aria-label` 只有项目内的会话列表有(`Scheduled tasks in X`),
 * Pinned / Recents 那两个没有 —— 别给它们补,那会让屏幕阅读器多念一遍分节名。
 */
export function SidebarRowList({
  children,
  ariaLabel
}: {
  children: ReactNode
  ariaLabel?: string
}): React.JSX.Element {
  return (
    <div className="flex flex-col" role="list" tabIndex={-1} aria-label={ariaLabel}>
      {children}
    </div>
  )
}

/**
 * 行间 1px 间隙 —— 用 `after` 伪元素而不是 gap。
 *
 * `last:after:hidden` 去掉最后一行的,所以列表底部不多 1px;
 * 正在被拖走的那行额外加 `after:!hidden`(实测),避免原位留下空隙。
 */
function itemSpacing(hidden: boolean): string {
  return `after:block after:h-px after:content-[''] last:after:hidden${hidden ? ' after:!hidden' : ''}`
}

/**
 * Pinned / Projects 分节的可排序项包装 —— **项目行与会话行共用这一个形态**,
 * 这就是它们在 Pinned 里能互相拖动排序的前提(实测两者逐字相同)。
 *
 * ```
 * div[role=listitem][tabindex=0][aria-roledescription="sortable"][aria-disabled][aria-describedby]
 *   .after:block.after:h-px.after:content-[''].last:after:hidden.touch-none
 * └ div.overflow-hidden[style="height:auto;opacity:1;overflow:visible"]
 *   └ <行本体 / 项目组>
 * ```
 *
 * `touch-none` 关掉触屏默认滚动手势,否则长按拖拽会变成滑动页面。
 * 注意这一档**没有** `cursor-grab` —— 光标由行自己的 `cursor-interaction` 决定
 * (Codex 实测:Pinned 里的行是箭头光标,只有项目内/Recents 的会话行才是抓手)。
 */
export function SidebarSortableItem({
  children,
  dragging = false,
  isLast = false,
  attributes,
  listeners,
  setNodeRef,
  style
}: {
  children: ReactNode
  dragging?: boolean
  isLast?: boolean
  attributes?: Record<string, unknown>
  listeners?: Record<string, unknown>
  setNodeRef?(el: HTMLElement | null): void
  style?: React.CSSProperties
}): React.JSX.Element {
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${itemSpacing(isLast || dragging)} touch-none`}
      {...attributes}
      {...listeners}
      /*
       * `role` 必须写在 attributes **之后**。
       *
       * dnd-kit 的 `attributes.role` 默认是 `'button'`,写在前面会被它覆盖 ——
       * 实测后果:项目行的可排序包装变成 `role="button"`,而 Codex 那层是
       * `role="listitem"` + `aria-roledescription="sortable"`(两者并存)。
       * 除了无障碍语义错,按 `[role=list] > [role=listitem]` 找项目项的选择器
       * 也会全部落空。
       */
      role="listitem"
    >
      <SidebarCollapseRegion>{children}</SidebarCollapseRegion>
    </div>
  )
}

/**
 * 项目内会话 / Recents 会话的拖拽包装 —— 与上面**不同的形态**(实测):
 * 可拖属性挂在**内层**一个专门的抓手 div 上,listitem 只负责行间隙。
 *
 * ```
 * div[role=listitem]  .after:block.after:h-px…               ← 没有 touch-none
 * └ div.cursor-grab.active:cursor-grabbing
 *     [aria-roledescription="sortable"|"draggable"][role=button][tabindex=0]
 *   └ div.overflow-hidden[style=…]
 *     └ <行本体>
 * ```
 *
 * `aria-roledescription` 两档也是实测的差别:
 * - 项目内的会话 → `sortable`(既能重排也能移出去)
 * - Recents 的会话 → `draggable`(只能拖走,Recents 自己不支持重排 ——
 *   它按时间排序,手工顺序没有意义)
 */
export function SidebarThreadDragItem({
  children,
  dragging = false,
  isLast = false,
  attributes,
  listeners,
  setNodeRef,
  style
}: {
  children: ReactNode
  dragging?: boolean
  isLast?: boolean
  attributes?: Record<string, unknown>
  listeners?: Record<string, unknown>
  setNodeRef?(el: HTMLElement | null): void
  style?: React.CSSProperties
}): React.JSX.Element {
  return (
    <div role="listitem" style={style} className={itemSpacing(isLast || dragging)}>
      <div
        ref={setNodeRef}
        className="cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <SidebarCollapseRegion>{children}</SidebarCollapseRegion>
      </div>
    </div>
  )
}
