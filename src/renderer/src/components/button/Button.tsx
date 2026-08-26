import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../../utils/cx'
import { Spinner } from '../loading/Spinner'

/**
 * 按钮 —— Codex `th`（导出名 `Mbt`，app-initial:1576630 附近的三张类名表）。
 *
 * 基类与两张表逐字取自产物：
 *   base   `no-drag cursor-interaction items-center gap-1 border whitespace-nowrap
 *           select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40`
 *   radius `QZe[size]`，size==='large' 时强制 `rounded-lg`
 *   color  `u5e[color]`
 *   size   `d5e[size]`
 *
 * **两张表都只搬了当前有调用点的档**（color: primary / secondary，size: default）。
 * Codex 的表有 15 个 color、十几个 size；整表搬过来等于凭空造 13 个没人用的分支，
 * 将来真要用哪一档再从产物里取那一行 —— 表在 reverse 里随时可查。
 *
 * `loading` 的语义是 Codex 的：**同时把按钮禁用**（`disabled = disabled || loading`），
 * 并在 children 前面插一个 `icon-xxs` 的转圈。不是只换个图标 —— 点两次会发两次
 * 登录请求。
 */
const COLOR_CLASS = {
  primary:
    'border-token-border bg-token-foreground enabled:hover:bg-token-foreground/80 data-[state=open]:bg-token-foreground/80 text-token-dropdown-background',
  secondary:
    'text-token-foreground bg-token-foreground/5 enabled:hover:bg-token-foreground/10 data-[state=open]:bg-token-foreground/10 border-transparent'
} as const

const SIZE_CLASS = {
  default: 'px-2 py-0.5 text-sm leading-[18px]'
} as const

const RADIUS_CLASS = {
  default: 'rounded-full'
} as const

export function Button({
  color = 'primary',
  size = 'default',
  loading = false,
  disabled = false,
  className,
  children,
  type = 'button',
  ...rest
}: {
  color?: keyof typeof COLOR_CLASS
  size?: keyof typeof SIZE_CLASS
  loading?: boolean
  children?: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'>): React.JSX.Element {
  return (
    <button
      type={type}
      className={cx(
        'no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40',
        'flex',
        RADIUS_CLASS[size],
        COLOR_CLASS[color],
        SIZE_CLASS[size],
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="icon-xxs" />}
      {children}
    </button>
  )
}
