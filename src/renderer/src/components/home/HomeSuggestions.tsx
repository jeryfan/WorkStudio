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

/**
 * 图标色 —— Codex 用 `token-charts-*` 系列,不是 `accent-*`。
 * 实测那张卡的 svg 上是 `text-token-charts-blue`。
 */
const chartColorByColor: Record<SuggestionColor, string> = {
  blue: 'text-token-charts-blue',
  purple: 'text-token-charts-purple',
  green: 'text-token-charts-green',
  orange: 'text-token-charts-orange'
}

/**
 * 首页建议卡 —— 逐层对齐 Codex 实测。
 *
 *   section.group/home-suggestions.relative.flex.min-w-0.flex-col.select-none
 *   └ div.min-w-0.mt-1.@container
 *     └ div.grid.grid-cols-[repeat(auto-fit,minmax(10rem,1fr))].gap-3   ← 自适应列数
 *         + 三条容器查询断点,窄了逐个藏掉后面的卡
 *       └ div.h-full.min-w-0
 *         └ button… (min-h-26 / rounded-2xl / border-token-input-border / shadow-md-strong
 *                    / electron:border-0 / electron:ring-[0.5px] / electron:ring-token-border-heavy)
 *           ├ span.flex.w-full.items-center.justify-between.gap-2
 *           │ └ span.[&>svg]:icon-sm.flex.size-6.shrink-0.items-center.justify-start
 *           │     .text-token-text-link-foreground
 *           │   └ svg.icon-xs.shrink-0.text-token-charts-<color>
 *           └ span.mt-auto.flex.min-h-10.w-full.flex-col.justify-end
 *             └ span.text-sm.leading-5.font-medium.text-token-text-primary
 *
 * 四处以前写错的:
 * - 网格是 **`auto-fit` + `minmax(10rem,1fr)`**,不是固定 `grid-cols-4` + `w-[714px]`。
 *   列数随容器宽度自己变,再叠三条 `@container` 断点在很窄时隐藏 4/3/2 号卡。
 * - Electron 下**没有 border**,靠 `ring-[0.5px]`(`electron:border-0`)—— 边框会显得比 Codex 重。
 * - 图标外面还有一层 `span.flex.w-full.items-center.justify-between`(给右上角留位置),
 *   之前直接把图标 span 当第一个子元素。
 * - 文字是 `text-sm`(13px)不是 `text-[13px]` 硬写,而且外面套了两层
 *   (`mt-auto…justify-end` + 文本 span)。
 */
export function HomeSuggestions(): React.JSX.Element {
  const { suggestions } = useWorkspace()

  return (
    <section className="group/home-suggestions relative flex min-w-0 flex-col select-none">
      <div className="min-w-0 mt-1 @container">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3 [@container_(max-width:42.249rem)]:[&>*:nth-child(n+4)]:hidden [@container_(max-width:31.499rem)]:[&>*:nth-child(n+3)]:hidden [@container_(max-width:20.749rem)]:[&>*:nth-child(n+2)]:hidden">
          {suggestions.map((s) => {
            const Icon = iconByColor[s.color]
            return (
              <div key={s.id} className="h-full min-w-0">
                <button
                  type="button"
                  className="flex h-full min-h-26 w-full min-w-0 cursor-interaction flex-col rounded-2xl border border-token-input-border bg-token-main-surface-primary px-4 py-3 text-start shadow-md-strong outline-none hover:bg-token-list-hover-background focus-visible:ring-1 focus-visible:ring-token-focus-border disabled:cursor-default disabled:opacity-50 electron:border-0 electron:ring-[0.5px] electron:ring-token-border-heavy"
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="[&>svg]:icon-sm flex size-6 shrink-0 items-center justify-start text-token-text-link-foreground">
                      <Icon className={`icon-xs shrink-0 ${chartColorByColor[s.color]}`} />
                    </span>
                  </span>
                  <span className="mt-auto flex min-h-10 w-full flex-col justify-end">
                    <span className="text-sm leading-5 font-medium text-token-text-primary">
                      {s.label}
                    </span>
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
