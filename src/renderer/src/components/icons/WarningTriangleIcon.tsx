import type { IconProps } from './types'

/**
 * 警告三角 —— Codex 队列暂停消息行首的警示标(text-token-editor-warning-foreground)。
 * 注意:path 未从 Codex 源码逐像素确认,同语义 20×20 近似,已记录的偏差。
 */
export function WarningTriangleIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M10 2.5C10.35 2.5 10.67 2.68 10.84 2.99L19.13 17.36C19.31 17.69 19.31 18.09 19.12 18.42C18.93 18.75 18.6 18.96 18.24 18.96H1.76C1.4 18.96 1.07 18.75 0.88 18.42C0.69 18.09 0.69 17.69 0.87 17.36L9.16 2.99C9.33 2.68 9.65 2.5 10 2.5ZM10 12.5C9.59 12.5 9.25 12.84 9.25 13.25C9.25 13.66 9.59 14 10 14C10.41 14 10.75 13.66 10.75 13.25C10.75 12.84 10.41 12.5 10 12.5ZM10 7.5C9.59 7.5 9.25 7.84 9.25 8.25V10.75C9.25 11.16 9.59 11.5 10 11.5C10.41 11.5 10.75 11.16 10.75 10.75V8.25C10.75 7.84 10.41 7.5 10 7.5Z" />
    </svg>
  )
}
