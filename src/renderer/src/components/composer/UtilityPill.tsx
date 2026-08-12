import type { ReactNode } from 'react'

interface UtilityPillProps {
  icon: ReactNode
  label: string
  ariaLabel?: string
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
}

/** .util-pill（1.html 第 579-609 行）：utility-bar 里的胶囊按钮 */
export function UtilityPill({
  icon,
  label,
  ariaLabel,
  onClick
}: UtilityPillProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="flex h-6 shrink-0 items-center gap-1.5 rounded-full px-1.5 text-[13px] text-primary hover:bg-black/5"
    >
      <span className="flex size-4 items-center justify-center">{icon}</span>
      <span className="max-w-60 truncate">{label}</span>
    </button>
  )
}
