import type { IconProps } from './types'

/** 轮次失败提示框的图标 */
export function InfoIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="9" cy="9" r="6.9" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 5.4V9.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="9" cy="12.1" r="0.8" fill="currentColor" />
    </svg>
  )
}
