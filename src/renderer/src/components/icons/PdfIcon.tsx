import type { IconProps } from './types'

/** 加号菜单插件区「PDF」折角文档图标（chat.html 该处为位图占位，按原型风格自绘） */
export function PdfIcon({ className }: IconProps): React.JSX.Element {
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
        d="M4 1.8h4.8L12 5v8.7a1.3 1.3 0 0 1-1.3 1.3H4A1.3 1.3 0 0 1 2.7 13.7V3.1a1.3 1.3 0 0 1 1.3-1.3Z"
        stroke="currentColor"
      />
      <path d="M8.8 1.8V5H12" stroke="currentColor" strokeLinejoin="round" />
    </svg>
  )
}
