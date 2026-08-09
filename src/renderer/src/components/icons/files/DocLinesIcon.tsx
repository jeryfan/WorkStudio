import type { IconProps } from '../types'

export function DocLinesIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16">
      <path
        fill="#9aa0a6"
        d="M4 1.5h5.5L13 5v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z"
      />
      <path fill="#fff" d="M5.5 8h5v.9h-5zM5.5 9.8h5v.9h-5zM5.5 11.6h3.4v.9H5.5z" />
    </svg>
  )
}
