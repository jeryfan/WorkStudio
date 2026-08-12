import type { IconProps } from './types'

/** 重连状态行的图标 */
export function WifiIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M1.5 5.75C3.25 4.15 5.5 3.25 8 3.25C10.5 3.25 12.75 4.15 14.5 5.75"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M4 8.5C5.1 7.5 6.5 6.9 8 6.9C9.5 6.9 10.9 7.5 12 8.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M6.4 11.2C6.85 10.75 7.4 10.5 8 10.5C8.6 10.5 9.15 10.75 9.6 11.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="8" cy="13.4" r="0.85" fill="currentColor" />
    </svg>
  )
}
