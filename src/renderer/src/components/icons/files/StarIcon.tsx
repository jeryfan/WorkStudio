import type { IconProps } from '../types'

export function StarIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16">
      <path
        fill="#d97706"
        d="M8 0l1.2 4.1L12.6 1l-1 4 4-1-3.1 3.4L16 8.6l-4.1 1.2 3.1 3.4-4-1 1 4-3.4-3.1L7.4 16l-1.2-4.1L2.8 15l1-4-4 1 3.1-3.4L0 7.4l4.1-1.2L1 2.8l4 1-1-4 3.4 3.1z"
        transform="scale(0.94) translate(.5 .5)"
      />
    </svg>
  )
}
