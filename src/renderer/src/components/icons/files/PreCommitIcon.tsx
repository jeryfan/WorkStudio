import type { IconProps } from '../types'

export function PreCommitIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="2" width="6" height="5" rx="1" stroke="#ef4444" strokeWidth="1.4" />
      <rect x="8.5" y="9" width="6" height="5" rx="1" stroke="#ef4444" strokeWidth="1.4" />
      <path d="M4.5 7v2.5a2 2 0 0 0 2 2H8.5" stroke="#ef4444" strokeWidth="1.4" />
    </svg>
  )
}
