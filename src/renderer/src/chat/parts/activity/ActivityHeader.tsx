import type { ReactNode } from 'react'
import { SubmenuChevronIcon } from '../../../components/icons'
import { cx } from '../../../utils/cx'
import { preserveViewportPosition, windowZoom } from '../../preserveViewportPosition'

/**
 * 活动行表头的三个原语 —— 逐字对应 Codex 的
 * `assets/tool-activity-disclosure-CkDQzSI4.js`(源码 `y` / `C` / `D`)。
 *
 * 上一轮是从 DOM 快照倒推的,少了 `accessory` 与 chevron,而且把调用方传进来的
 * 那几层 span 当成了本组件的一部分。这一轮直接读到了 lazy chunk,按源码重写。
 */

/**
 * `ActivityHeaderContent`(Codex `y`) —— 表头里那个 inline-flex 的 span。
 *
 * `align` 决定 `items-center` 还是 `items-start`:多行摘要(例如带文件列表的)
 * 要顶对齐,否则图标会掉到文字块的垂直中心。
 */
export function ActivityHeaderContent({
  align = 'center',
  className,
  children
}: {
  align?: 'center' | 'start'
  className?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <span
      className={cx(
        'inline-flex min-w-0 gap-1.5',
        align === 'center' ? 'items-center' : 'items-start',
        className
      )}
    >
      {children}
    </span>
  )
}

/**
 * `ActivityChevron`(Codex `C`) —— 表头右端的展开箭头。
 *
 * **平时是透明的**(`opacity-0`),hover / focus-visible / 已展开时才显形 ——
 * 一列常驻的小箭头会把回复流渲染成树控件。这条与之前 VS Code 版
 * `Collapsible` 的 hover-chevron 行为一致,但实现完全不同:Codex 走
 * `group-*` 变体,不需要额外的容器类。
 *
 * 展开时追加 `rotate-90 opacity-100` —— 本体朝右,转 90° 变朝下。
 * (注意:Tailwind v4 的 `rotate-90` 写的是 CSS `rotate` 而不是 `transform`,
 * 验证时要读 `rotate` 属性。)
 *
 * hover 那条变体带 `:not(:has([data-agent-activity-file-link]:hover))` ——
 * 摘要里有文件链接时,鼠标停在链接上不算"停在这一行",箭头不亮。
 * 这是为了让"点链接"和"点行展开"两种意图在视觉上分得开。
 */
export function ActivityChevron({ expanded }: { expanded?: boolean }): React.JSX.Element {
  return (
    <SubmenuChevronIcon
      aria-hidden="true"
      className={cx(
        'icon-2xs shrink-0 text-token-conversation-body opacity-0',
        'group-focus-visible/activity-header:opacity-100 group-focus-visible/activity-header:text-token-foreground',
        'group-has-[:focus-visible]/activity-header:opacity-100 group-has-[:focus-visible]/activity-header:text-token-foreground',
        'transition-transform duration-relaxed',
        '[@media(hover:hover)]:group-[:hover:not(:has([data-agent-activity-file-link]:hover))]/activity-header:opacity-100',
        expanded && 'rotate-90 opacity-100'
      )}
    />
  )
}

/**
 * `ActivityHeader`(Codex `D`) —— 活动行的表头本体。
 *
 * **有 `disclosure` 就渲染成 `button`,没有就是 `div`**,类名基座完全相同,
 * 只多一个 `cursor-interaction`。这不是可有可无的分流:不可展开的活动行
 * (例如只写 "Searched the web")不该有按钮语义,也不该有 hover 反馈。
 *
 * 子元素顺序固定是 `[内容, accessory, chevron]` —— accessory 在箭头**左边**
 * (文件改动行的 `+12 -3` 就走这个槽)。
 */
export function ActivityHeader({
  accessory,
  children,
  className,
  dir,
  disclosure,
  testId
}: {
  /** 摘要与箭头之间的附加信息,如增删行数 */
  accessory?: ReactNode
  children: ReactNode
  className?: string
  dir?: string
  /** 传了才是可展开的那一档(渲染成 button) */
  disclosure?: { expanded: boolean; onToggle(): void }
  testId?: string
}): React.JSX.Element {
  const content = (
    <>
      <ActivityHeaderContent className="shrink truncate text-size-chat">
        {children}
      </ActivityHeaderContent>
      {accessory}
      {disclosure == null ? null : <ActivityChevron expanded={disclosure.expanded} />}
    </>
  )
  const base = cx(
    'group/activity-header inline-flex min-w-0 max-w-full self-start items-center gap-1 p-0 text-start',
    disclosure != null && 'cursor-interaction',
    className
  )

  if (disclosure == null) {
    return (
      <div className={base} data-testid={testId} dir={dir}>
        {content}
      </div>
    )
  }
  return (
    <button
      type="button"
      className={base}
      data-testid={testId}
      dir={dir}
      aria-expanded={disclosure.expanded}
      onClick={(e) => {
        // 见 preserveViewportPosition:反向 flex 容器里,展开会把这一行自己顶走
        preserveViewportPosition(e.currentTarget, windowZoom())
        disclosure.onToggle()
      }}
    >
      {content}
    </button>
  )
}
