import type { IconProps } from './types'

/** 加号菜单插件区「Documents」文档图标（chat.html 该处为位图占位，按原型风格自绘） */
export function DocumentsIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="3" y="1.8" width="10" height="12.4" rx="1.5" stroke="currentColor" />
      <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke="currentColor" strokeLinecap="round" />
    </svg>
  )
}
