import type { IconProps } from '../types'

export function DocIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16">
      <path
        fill="#bdc1c6"
        d="M4 1.5h5.5L13 5v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z"
      />
      <path fill="#9aa0a6" d="M9.5 1.5L13 5H9.5z" />
    </svg>
  )
}
