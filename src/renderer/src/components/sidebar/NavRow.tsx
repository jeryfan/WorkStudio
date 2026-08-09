import type { ReactNode } from 'react'

interface NavRowProps {
  icon: ReactNode
  label: string
  /** 快捷键提示（⌘N / ⌘K），hover 时淡入 */
  kbd?: string
  onClick?: () => void
}

/**
 * .row / .row-btn —— 侧栏通用行：
 * hover 背景变灰；带 kbd 时右侧 chip 从透明淡入。
 */
export function NavRow({ icon, label, kbd, onClick }: NavRowProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-[30px] w-full shrink-0 items-center gap-2 overflow-hidden rounded-row px-2 text-left text-sm leading-[21px] text-ink hover:bg-row-hover"
    >
      <span className="flex w-4 shrink-0 items-center justify-center [&_svg]:size-4">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {kbd && (
        <span className="shrink-0 text-desc opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100">
          <kbd className="inline-flex whitespace-nowrap rounded-md bg-ink-10 px-1.5 py-0.5 text-xs leading-none">
            {kbd}
          </kbd>
        </span>
      )}
    </button>
  )
}
