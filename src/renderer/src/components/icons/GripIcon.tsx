import type { IconProps } from './types'

/**
 * 拖拽把手(六点)—— Codex 队列消息行左侧的 grip。
 * 注意:path 未从 Codex 源码逐像素确认(图标组件名在 bundle 里被压扁,
 * 导出链未定位到),这里是同语义的 20×20 六点近似,已记录的偏差。
 */
export function GripIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="7" cy="5" r="1.25" />
      <circle cx="13" cy="5" r="1.25" />
      <circle cx="7" cy="10" r="1.25" />
      <circle cx="13" cy="10" r="1.25" />
      <circle cx="7" cy="15" r="1.25" />
      <circle cx="13" cy="15" r="1.25" />
    </svg>
  )
}
