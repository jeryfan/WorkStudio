import type { IconProps } from './types'

/** 命令执行活动行的图标 —— 圆角方框内一个提示符 */
export function TerminalIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect
        x="1.75"
        y="2.75"
        width="12.5"
        height="10.5"
        rx="2.25"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M5.25 6.25L7.25 8L5.25 9.75"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.75 10H10.75" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
