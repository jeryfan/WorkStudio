import type { IconProps } from './types'

/** 加号菜单插件区「Spreadsheets」表格图标（chat.html 该处为位图占位，按原型风格自绘） */
export function SpreadsheetsIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" />
      <path d="M2.5 6.5h11M6.5 2.5v11" stroke="currentColor" />
    </svg>
  )
}
