import { useId, type ReactNode } from 'react'
import { cx } from '../../../utils/cx'
import { preserveViewportPosition, windowZoom } from '../../preserveViewportPosition'
import { ActivityChevron, ActivityHeader, ActivityHeaderContent } from './ActivityHeader'
import { ActivityRow } from './ActivityRow'

/**
 * `ActivityHeaderRow`(Codex `tool-activity-disclosure` 源码 `F`) ——
 * 会话里**每一种**活动条目最终都落到这个组件上:exec / patch / web-search /
 * mcp-tool-call / context-compaction / system-error / image-view … 一个不例外。
 * 它把「图标 + 摘要 + 附加信息 + 展开体」拼成 ActivityRow。
 *
 * 最值得记的一点:**可展开那版不是把整行包进 `<button>`**,而是
 *
 *     div.group/activity-header.relative
 *     ├ button.absolute.inset-0            ← 铺满整行的透明按钮
 *     ├ span.pointer-events-none…[&_a]:pointer-events-auto   ← 摘要
 *     ├ accessory
 *     └ span.pointer-events-none.relative.flex > chevron
 *
 * 这样摘要里的文件链接依然可点(`[&_a]:pointer-events-auto` /
 * `[&_button]:pointer-events-auto`),而行内空白处点哪都能展开。
 * 用 `<button>` 包住整行做不到这个 —— 嵌套按钮/链接是非法的 HTML,
 * 而且点链接会同时触发展开。
 *
 * 无障碍:透明按钮没有可见文字,所以要么给 `aria-label`(调用方传
 * `accessibleLabel`,例如 "Toggle diff for src/foo.ts"),要么用
 * `aria-labelledby` 指向摘要 span 的 `useId()` —— Codex 两条都留着,
 * 有 label 用 label,没有就指摘要。
 *
 * 摘要 span 上那两条 `[&_*:not(button)]:!text-token-conversation-body` /
 * hover 时 `!text-token-foreground` 是**带 `!` 的**:摘要里嵌的 span 各自带色
 * (命令名、文件名、耗时),整行必须能一把压过去,否则 hover 时只有一部分变亮。
 */
export function ActivityHeaderRow({
  accessory,
  body,
  className,
  disclosure,
  headerClassName,
  icon,
  summary,
  ...rest
}: {
  accessory?: ReactNode
  body?: ReactNode
  className?: string
  disclosure?: { expanded: boolean; onToggle(): void; accessibleLabel?: string }
  headerClassName?: string
  icon?: ReactNode
  summary: ReactNode
} & React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  const summaryId = useId()

  const content = (
    <>
      <span className="contents text-token-conversation-body">{icon}</span>
      <span
        id={disclosure == null ? undefined : summaryId}
        className={cx(
          'min-w-0 flex-1 truncate text-token-conversation-body [&_.loading-shimmer-pure-text]:align-top [&_*:not(button)]:!text-token-conversation-body',
          disclosure != null &&
            '[@media(hover:hover)]:group-[:hover:not(:has([data-agent-activity-file-link]:hover))]/activity-header:!text-token-foreground [@media(hover:hover)]:group-[:hover:not(:has([data-agent-activity-file-link]:hover))]/activity-header:[&_*:not(button)]:!text-token-foreground'
        )}
      >
        {summary}
      </span>
    </>
  )

  const header =
    disclosure == null ? (
      <ActivityHeader accessory={accessory} className={cx('max-w-full', headerClassName)}>
        {content}
      </ActivityHeader>
    ) : (
      <div
        className={cx(
          'group/activity-header relative inline-flex max-w-full min-w-0 items-center gap-1 self-start',
          headerClassName
        )}
      >
        <button
          type="button"
          aria-label={disclosure.accessibleLabel}
          aria-labelledby={disclosure.accessibleLabel == null ? summaryId : undefined}
          aria-expanded={disclosure.expanded}
          className="absolute inset-0 cursor-interaction focus-visible:ring-1 focus-visible:ring-token-focus-border focus-visible:outline-none focus-visible:ring-inset"
          onClick={(e) => {
            // 见 preserveViewportPosition:反向 flex 容器里,展开会把这一行自己顶走
            preserveViewportPosition(e.currentTarget, windowZoom())
            disclosure.onToggle()
          }}
        />
        <ActivityHeaderContent className="pointer-events-none relative shrink truncate text-size-chat [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
          {content}
        </ActivityHeaderContent>
        {accessory}
        <span className="pointer-events-none relative flex">
          <ActivityChevron expanded={disclosure.expanded} />
        </span>
      </div>
    )

  return <ActivityRow {...rest} className={className} header={header} body={body} />
}
