import type { IconProps } from './types'

/** 加号菜单插件区「Presentations」演示文稿图标（chat.html 该处为位图占位，按原型风格自绘） */
export function PresentationsIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="2" y="2.2" width="12" height="9" rx="1.5" stroke="currentColor" />
      <path d="M8 11.2v2.6M5 14.6l3-1.8 3 1.8" stroke="currentColor" strokeLinecap="round" />
    </svg>
  )
}
