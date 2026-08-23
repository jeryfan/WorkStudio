import type { ReactNode, Ref } from 'react'
import { cx } from '../../../utils/cx'

/**
 * `ActivityBody`(Codex `tool-activity-disclosure` 源码 `G`) —— 活动行展开后的内容容器。
 *
 * 三档 variant,间距各不相同(实测三档都在用):
 *
 * | variant   | 类名                                                  | 用在 |
 * |-----------|-------------------------------------------------------|------|
 * | `default` | `gap-2 pt-2 pb-1`                                     | 工具输出、代码块 |
 * | `grouped` | `gap-[var(--conversation-grouped-item-gap,4px)] pt-1`  | 一组子条目(多 agent 动作) |
 * | `flush`   | (无)                                                  | 推理正文 —— 自己带滚动窗,不要额外内边距 |
 *
 * `flush` 在 Codex 里不是显式分支:源码只判 `=== 'default'` 和 `=== 'grouped'`,
 * 传别的值就两条都不命中,于是没有间距类。这里把它写成显式的第三档,
 * 因为"什么都不加"是**有意的**,写成 default 之外的漏网之鱼会让人以为是 bug。
 *
 * `indent` → `ps-6`:展开体缩进到与表头文字对齐(图标 + gap 的宽度)。
 * `ToolActivityDisclosure` 默认 `indentContent = true`。
 */
export function ActivityBody({
  ref,
  className,
  indent = false,
  variant = 'default',
  children,
  ...rest
}: {
  ref?: Ref<HTMLDivElement>
  className?: string
  indent?: boolean
  variant?: 'default' | 'grouped' | 'flush'
  children?: ReactNode
} & React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      ref={ref}
      className={cx(
        'flex flex-col',
        variant === 'default' && 'gap-2 pt-2 pb-1',
        variant === 'grouped' && 'gap-[var(--conversation-grouped-item-gap,4px)] pt-1',
        indent && 'ps-6',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
