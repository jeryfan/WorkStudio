import type { IconProps } from '../../types'

/**
 * Codex Compact 项的上下文用量环(12×12):底圈 16% 透明 + 进度圈
 * (stroke-dashoffset 随用量过渡;用量数据未接入,当前恒为空环)。
 */
export function CompactIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle
        cx="6"
        cy="6"
        r="5"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        opacity="0.16"
      />
      <circle
        cx="6"
        cy="6"
        r="5"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0"
        strokeLinecap="round"
        fill="none"
        pathLength={100}
        strokeDasharray={100}
        strokeDashoffset={100}
        transform="rotate(-90 6 6)"
        style={{ transition: 'stroke-dashoffset 120ms ease-out, opacity 120ms ease-out' }}
      />
    </svg>
  )
}
