import type { IconProps } from '../types'

/** 被中断(exec + executionStatus === "interrupted")—— 一个圆角实心方块(停止) */
export function ActivityInterruptedIcon({
  className,
  'aria-hidden': ariaHidden
}: IconProps): React.JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden={ariaHidden}
    >
      <path d="M4.5 5.75C4.5 5.05964 5.05964 4.5 5.75 4.5H14.25C14.9404 4.5 15.5 5.05964 15.5 5.75V14.25C15.5 14.9404 14.9404 15.5 14.25 15.5H5.75C5.05964 15.5 4.5 14.9404 4.5 14.25V5.75Z" />
    </svg>
  )
}
