import type { ReactNode } from 'react'
import { cx } from '../../../utils/cx'

/**
 * 通用导航分组 —— Codex `g8`（导出名 `rl`）的非折叠分支。
 *
 * 逐字取自产物：
 *   div.flex.flex-col + (collapsed == null && 'gap-1') + className
 *   ├ 标题行(有 title 才渲染)
 *   │   div.group/nav-section-title.flex.items-center.justify-between.gap-2 + (titleRowClassName ?? 'pe-0.5 ps-2')
 *   │     div.min-w-0.flex-1 + (titleClassName ?? 'text-base font-medium
 *   │       text-token-input-placeholder-foreground opacity-75')
 *   └ div.flex.flex-col.gap-px          ← collapsed == null 时就是这一层
 *
 * 设置侧栏传的是 `className="gap-0"`：外层 gap 由 gap-1 压成 0，行距只剩内层的
 * `gap-px`。侧栏那个可折叠、可排序的 SectionHeader/SidebarSection 是另一套
 *（Codex 里也是另一套，带 collapsed 动画与 dnd 把手），不要互相套用。
 *
 * 这里不实现 collapsed 分支：设置侧栏的分组不可折叠（Codex 传的 `collapsed`
 * 为 undefined，走的就是上面这条无动画路径）。
 */
export function NavGroup({
  title,
  className,
  titleRowClassName,
  titleClassName,
  children
}: {
  title?: ReactNode
  className?: string
  titleRowClassName?: string
  titleClassName?: string
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div className={cx('flex flex-col', 'gap-1', className)}>
      {title != null && (
        <div
          className={cx(
            'group/nav-section-title flex items-center justify-between gap-2',
            titleRowClassName ?? 'pe-0.5 ps-2'
          )}
        >
          <div
            className={cx(
              'min-w-0 flex-1',
              titleClassName ??
                'text-base font-medium text-token-input-placeholder-foreground opacity-75'
            )}
          >
            {title}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-px">{children}</div>
    </div>
  )
}
