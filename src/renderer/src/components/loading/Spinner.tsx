import { useReducedMotion } from 'framer-motion'
import { cx } from '../../utils/cx'
import type { IconProps } from '../icons/types'

/**
 * 转圈指示器 —— Codex `$m`（默认图标 `n5e`，24×24 双 path）。
 *
 * 结构是**两层**：外面一个 `inline-flex` 容器负责旋转，里面才是图标 ——
 * 这样 `className` 控图标尺寸、`containerClassName` 控容器，两者互不干扰。
 * `contain-layout contain-paint contain-style` 是 Codex 写的：转圈是常驻动画，
 * 不隔离的话每帧都会把祖先一起带进重排。
 *
 * `prefers-reduced-motion` 下**不加 `animate-spin`**（Codex 的 `Zm()` 读的是
 * 设置里的 reducedMotionPreference，本项目沿用已有的 `useReducedMotion`）。
 *
 * Codex 还有一个 `animationDelay`（模块级随机值 `i5e`，让同屏多个转圈不同步）；
 * 产物里那个值挖不到，这里不编一个 —— 见 animationDurationMs 的说明。
 */
export function Spinner({
  className,
  containerClassName,
  animationDurationMs
}: {
  className?: string
  containerClassName?: string
  /** 不传就走 CSS 的默认时长（Codex 同：`undefined` 时不写内联 style） */
  animationDurationMs?: number
}): React.JSX.Element {
  const reducedMotion = useReducedMotion() === true
  return (
    <div
      className={cx(
        !reducedMotion && 'animate-spin',
        'inline-flex h-fit w-fit items-center justify-center leading-none contain-layout contain-paint contain-style',
        containerClassName
      )}
      style={
        animationDurationMs == null ? undefined : { animationDuration: `${animationDurationMs}ms` }
      }
    >
      <SpinnerIcon className={className} />
    </div>
  )
}

/** Codex `n5e` */
function SpinnerIcon({ className, ...rest }: IconProps): React.JSX.Element {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...rest}
    >
      <path
        opacity={0.3}
        d="M18 12C18 8.68629 15.3137 6 12 6C8.68629 6 6 8.68629 6 12C6 15.3137 8.68629 18 12 18C15.3137 18 18 15.3137 18 12ZM20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12Z"
        fill="currentColor"
      />
      <path
        d="M12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12H6C6 15.3137 8.68629 18 12 18C15.3137 18 18 15.3137 18 12C18 8.68629 15.3137 6 12 6V4Z"
        fill="currentColor"
      />
    </svg>
  )
}
