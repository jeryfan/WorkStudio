import type { ComponentType } from 'react'
import { useWorkspace } from '../../state/WorkspaceContext'
import type { SuggestionColor } from '../../services/workspace/types'
import { BuildIcon, ExploreIcon, FixIcon, ReviewIcon, type IconProps } from '../icons'

const iconByColor: Record<SuggestionColor, ComponentType<IconProps>> = {
  blue: ExploreIcon,
  purple: BuildIcon,
  green: ReviewIcon,
  orange: FixIcon
}

const textColorByColor: Record<SuggestionColor, string> = {
  blue: 'text-icon-blue',
  purple: 'text-icon-purple',
  green: 'text-icon-green',
  orange: 'text-icon-orange'
}

/**
 * .suggestions（1.html 第 493-556 行）：top:433px，714px 宽 4 列网格，数据驱动。
 */
export function SuggestionCards(): React.JSX.Element {
  const { suggestions } = useWorkspace()

  return (
    <div className="absolute left-1/2 top-[433px] grid w-[714px] max-w-[calc(100%-48px)] -translate-x-1/2 grid-cols-4 gap-3">
      {suggestions.map((s) => {
        const Icon = iconByColor[s.color]
        return (
          <button
            key={s.id}
            type="button"
            className="flex h-full min-h-[104px] flex-col items-stretch rounded-2xl border border-card-border bg-card px-4 py-3 text-left shadow-card hover:bg-[#f2f2f4]"
          >
            <span className={`flex size-6 items-start justify-start ${textColorByColor[s.color]}`}>
              <Icon className="size-5" />
            </span>
            <span className="mt-auto flex min-h-10 flex-col justify-end text-[13px] font-medium leading-5 text-primary">
              {s.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
