import type { IconProps } from '../types'

export function GitIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16">
      <path fill="#e8590c" d="M8 1l7 7-7 7-7-7z" />
      <path
        fill="#fff"
        d="M6.2 4.5h1v2.6l2.2-1.3.5.86L7 8.3l2.9 1.74-.5.86-2.2-1.3v2.6h-1z"
        opacity=".9"
      />
    </svg>
  )
}
