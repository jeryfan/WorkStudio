import { createElement, isValidElement, type ComponentType, type ReactNode } from 'react'
import { cx } from '../../utils/cx'

interface NavRowProps {
  /**
   * Codex `SOc` 的 icon 既可以是元素也可以是组件：
   * `isValidElement(icon) ? icon : createElement(icon, {className})`。
   * 传组件时才会被套上 iconClassName 与选中态色，传元素时原样渲染。
   */
  icon: ReactNode | ComponentType<{ className?: string }>
  label: ReactNode
  /** 非空闲状态的圆点(Codex 只在有活动的行上渲染这一槽) */
  status?: boolean
  onClick?: () => void
  /**
   * 选中态(Codex `SOc` 的 `isActive`)。
   * 行底色换成 token-list-hover-background、文字与图标换成 active-selection 两色,
   * 并给 `aria-current="page"` —— 设置侧栏靠这一组表达"当前在哪一页"。
   */
  isActive?: boolean
  disabled?: boolean
  /** Codex `iconClassName`,默认 icon-xs;设置侧栏传 icon-sm */
  iconClassName?: string
  /** Codex `weightClassName` —— 设置侧栏传 font-normal 压掉默认字重 */
  weightClassName?: string
  /** 行尾插槽(Codex `trailing`),外链箭头一类 */
  trailing?: ReactNode
  ariaLabel?: string
  /** 透传给 button 的 data-*(Codex 用 data-settings-panel-slug 做键盘上下移) */
  dataSettingsPanelSlug?: string
}

/**
 * 侧栏通用导航行 —— 类名逐字对齐 Codex 实测值。
 *
 * 高度与左右内边距一律走 token,不写死:
 *   h-[var(--height-token-row)]
 *   px-[var(--padding-row-cell-x,var(--padding-row-x))]
 *   py-row-y
 * 行高由上下文决定 —— 滚动区注入 30px,header 里落到 theme 的 29px。写死 h-[30px]
 * 就丢掉了这个能力,换宽度或换宿主时对不上。
 *
 * 三个容易写错的地方:
 *
 * 1. **中间必须有内容层** `div.flex.min-w-0.items-center.text-base.gap-2.flex-1`。
 *    文字色和 text-base 挂在它身上,不在 button 上 —— 因为右侧状态槽是 button 的
 *    直接子元素,不该继承这些。把子元素直接摊在 button 下,状态槽会跟着变 14px。
 *
 * 2. 标签用 `text-fade-truncate`(mask 右侧渐隐),**不是** `truncate`(省略号)。
 *    Codex 全站没有一处用省略号截断行标签。
 *
 * 3. 图标尺寸由 svg 自己的 `icon-xs` 决定,不要在插槽上写 `[&_svg]:size-4` ——
 *    那会把所有嵌套 svg 一起压成 16px,且绕过 icon-* 这套标度。
 *
 * 焦点态用 Codex 的 focus-visible:outline-token-border + offset-2(不是 ring),
 * 光标用 cursor-interaction(桌面端解析成 default,见 app-theme.css 的 body 层)。
 */
export function SidebarItem({
  icon,
  label,
  status,
  onClick,
  isActive = false,
  disabled = false,
  iconClassName,
  weightClassName,
  trailing,
  ariaLabel,
  dataSettingsPanelSlug
}: NavRowProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={isActive ? 'page' : undefined}
      data-settings-panel-slug={dataSettingsPanelSlug}
      className={cx(
        'sidebar-item focus-visible:outline-token-border relative h-[var(--height-token-row)] px-[var(--padding-row-cell-x,var(--padding-row-x))] py-row-y cursor-interaction shrink-0 items-center overflow-hidden text-start text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 gap-2 flex w-full',
        isActive ? 'bg-token-list-hover-background' : 'hover:bg-token-list-hover-background',
        weightClassName
      )}
    >
      <div
        className={cx(
          'flex min-w-0 items-center text-base gap-2 flex-1',
          isActive ? 'text-token-list-active-selection-foreground' : 'text-token-foreground'
        )}
      >
        <span className="flex w-4 shrink-0 items-center justify-center">
          {isValidElement(icon)
            ? icon
            : createElement(icon as ComponentType<{ className?: string }>, {
                className: cx(
                  iconClassName ?? 'icon-xs',
                  isActive && 'text-token-list-active-selection-icon-foreground'
                )
              })}
        </span>
        <span className="text-fade-truncate">{label}</span>
      </div>
      {trailing}
      {status && (
        <div className="relative flex size-5 shrink-0 items-center justify-center text-token-description-foreground">
          <span className="icon-xs relative scale-50">
            <span
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: 'var(--vscode-textLink-foreground)' }}
            />
          </span>
        </div>
      )}
    </button>
  )
}
