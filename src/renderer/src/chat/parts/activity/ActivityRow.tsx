import type { ReactNode } from 'react'
import { cx } from '../../../utils/cx'

/**
 * 活动条目的两层外壳 —— 对应 Codex 的 `ConversationItem`(app-initial 源码
 * `aZc`,以 `padding` 分档)与 `ActivityRow`(`tool-activity-disclosure` 里的 `j`)。
 *
 * 上一轮从 DOM 量到的
 * `div.min-w-0.text-size-chat.relative.overflow-visible.py-0 > div.flex.min-w-0.flex-col`
 * 就是这两层叠出来的:外层是 `padding="offset"` 的条目壳,内层是 ActivityRow。
 */

/**
 * `ConversationItem`(Codex `aZc`) —— 会话条目的统一外壳。
 *
 * `offset` 档多出 `relative overflow-visible`:活动行的 hover 高亮/浮层要能
 * 溢出这一格(`overflow-visible`),而 `relative` 给它们提供定位原点。
 * 可展开表头那版把整块盖上一个 `absolute inset-0` 的按钮,靠的就是这个原点。
 */
export function ConversationItem({
  children,
  className,
  padding = 'default'
}: {
  children: ReactNode
  className?: string
  padding?: 'default' | 'offset'
}): React.JSX.Element {
  const base = cx('min-w-0 text-size-chat', className)
  if (padding === 'offset') {
    return <div className={cx(base, 'relative overflow-visible py-0')}>{children}</div>
  }
  return <div className={cx(base, 'py-0')}>{children}</div>
}

/**
 * `ActivityRow`(Codex `j`) —— 表头 + 展开体的竖排容器。
 *
 * 注意它固定套在 `padding="offset"` 的条目壳里面,不是自己决定内外边距。
 */
export function ActivityRow({
  header,
  body,
  className,
  ...rest
}: {
  header: ReactNode
  body?: ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <ConversationItem padding="offset">
      <div {...rest} className={cx('flex min-w-0 flex-col', className)}>
        {header}
        {body}
      </div>
    </ConversationItem>
  )
}
