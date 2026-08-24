import type { IconProps } from './types'

/**
 * 停止钮的实心圆角方块 —— Codex `Gh`(composer stop 按钮,viewBox 20×20,
 * fill 直接挂在 svg 上,path 不再带 fill;Codex 实测这些工具图标不带 aria-hidden)。
 */
export function StopIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M4.5 5.75C4.5 5.05964 5.05964 4.5 5.75 4.5H14.25C14.9404 4.5 15.5 5.05964 15.5 5.75V14.25C15.5 14.9404 14.9404 15.5 14.25 15.5H5.75C5.05964 15.5 4.5 14.9404 4.5 14.25V5.75Z" />
    </svg>
  )
}
