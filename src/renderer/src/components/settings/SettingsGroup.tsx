import type { ReactNode } from 'react'
import { cx } from '../../utils/cx'

/**
 * 设置分组卡片 —— Codex `Object.assign(vsl, {Header: ysl, Content: bsl, Footer: msl})`
 *（导出名 `gr`）。本轮用到 Group / Header / Content 三个。
 *
 * 逐字取自产物：
 *   Group        section#id.flex.flex-col
 *   Group.Header div.flex.justify-between.gap-4 + (有副标题 ? pb-3
 *                : min-h-toolbar.items-center.pb-1.5)
 *                + (有副标题 && compact ? items-center)
 *                + (有副标题 && !compact ? items-start)
 *     ├ div.flex.min-w-0.flex-1.flex-col + (titleGap==='none' ? gap-0 : gap-0.5)
 *     │   ├ 标题 div.font-medium.text-token-text-primary
 *     │   │        + compact  ? text-sm.leading-[18px]
 *     │   │        + !compact && 有副标题 ? text-lg
 *     │   │        + !compact && 无副标题 ? text-base
 *     │   └ 副标题 div.font-normal.text-balance.text-token-text-secondary
 *     │              + (compact ? text-xs.leading-4 : text-sm.leading-[18px])
 *     └ actions div.flex.items-center.gap-2
 *   Group.Content div.flex.flex-col.gap-1.5
 *
 * Header 三个分支都没命中（无标题、无副标题、无 actions）时返回空 Fragment ——
 * 不是渲染一个空 div，否则那 `min-h-toolbar` 会白占一行高度。
 */

type GroupSize = 'default' | 'compact'

function Group({
  id,
  className,
  children
}: {
  id?: string
  className?: string
  children?: ReactNode
}): React.JSX.Element {
  return (
    <section id={id} className={cx('flex flex-col', className)}>
      {children}
    </section>
  )
}

function GroupHeader({
  title,
  subtitle,
  actions,
  className,
  size = 'default',
  titleGap = 'default'
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
  size?: GroupSize
  titleGap?: 'default' | 'none'
}): React.JSX.Element | null {
  const hasTitle = title != null
  const hasSubtitle = subtitle != null
  const hasActions = actions != null
  if (!hasTitle && !hasSubtitle && !hasActions) return null
  const compact = size === 'compact'

  return (
    <div
      className={cx(
        'flex justify-between gap-4',
        hasSubtitle ? 'pb-3' : 'min-h-toolbar items-center pb-1.5',
        hasSubtitle && compact && 'items-center',
        hasSubtitle && !compact && 'items-start',
        className
      )}
    >
      <div
        className={cx('flex min-w-0 flex-1 flex-col', titleGap === 'none' ? 'gap-0' : 'gap-0.5')}
      >
        {hasTitle && (
          <div
            className={cx(
              'font-medium text-token-text-primary',
              compact && 'text-sm leading-[18px]',
              !compact && hasSubtitle && 'text-lg',
              !compact && !hasSubtitle && 'text-base'
            )}
          >
            {title}
          </div>
        )}
        {hasSubtitle && (
          <div
            className={cx(
              'font-normal text-balance text-token-text-secondary',
              compact ? 'text-xs leading-4' : 'text-sm leading-[18px]'
            )}
          >
            {subtitle}
          </div>
        )}
      </div>
      {hasActions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

function GroupContent({
  className,
  children
}: {
  className?: string
  children?: ReactNode
}): React.JSX.Element {
  return <div className={cx('flex flex-col gap-1.5', className)}>{children}</div>
}

export const SettingsGroup = Object.assign(Group, {
  Header: GroupHeader,
  Content: GroupContent
})
