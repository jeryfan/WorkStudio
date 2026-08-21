import type { IconProps } from '../types'

/** VS Code 图标（panel/1.html 第 255 行 img 的 onerror 内联 fallback） */
export function VsCodeIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24">
      <path
        fill="#0078d4"
        d="M17.58 2.2l4.42 2.03v15.54l-4.42 2.03-7.53-6.84-5.6 4.24L2 18.06l5.02-6.06L2 5.94l2.45-3.14 5.6 4.24zm-.02 5.31l-4.52 4.49 4.52 4.49z"
      />
    </svg>
  )
}
