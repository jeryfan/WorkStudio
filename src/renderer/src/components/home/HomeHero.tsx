import { useState } from 'react'
import { useWorkspace } from '../../state/WorkspaceContext'
import { HomeLogoIcon } from '../icons'
import { Popover } from '../composer/popovers/Popover'
import { ProjectPicker } from '../composer/popovers/ProjectPicker'

/**
 * 首页 hero —— logo + 标题,类名逐字对齐 Codex 实测。
 *
 * Codex 的形态:
 *   div.flex.w-full.flex-col.items-center.gap-6
 *   ├ div.relative.size-14.cursor-interaction.text-token-foreground.opacity-30
 *   │   .transition-opacity.duration-basic.ease-enter-snappy.motion-reduce:transition-none
 *   │   .[@media(hover:hover)_and_(pointer:fine)]:hover:opacity-40
 *   │   [aria-hidden="true" data-testid="home-icon" style="transform: rotate(0deg) scale(…)"]
 *   │ └ svg.absolute.inset-0.size-full
 *   └ div.heading-xl.flex.max-w-full.min-w-0.items-end.justify-center.text-center
 *       .font-normal.whitespace-pre-wrap.text-token-foreground.select-none [data-feature="game-source"]
 *     └ span.group/title.inline-block.max-w-full
 *       └ button.inline-block.max-w-full.cursor-interaction.break-words.whitespace-normal
 *           .underline.decoration-token-text-tertiary.decoration-dotted.decoration-[1px]
 *           .underline-offset-4.hover:text-token-text-secondary
 *
 * 三处以前写错的:
 * - 标题**不是 `<h1>`**,是 `div.heading-xl`(28px/33.6px/w400,来自 utility)。
 *   之前用 `text-2xl`(24px)+ `leading-8`,字号和行高都不对。
 * - 下划线色用 `decoration-token-text-tertiary`,hover 用 `text-token-text-secondary`,
 *   不是硬编码的 `rgba(111,111,116,.9)` / `#55555a`。
 * - logo 带 `cursor-interaction` + hover 提亮(30% → 40%),而且只在
 *   真鼠标设备上生效(`@media (hover:hover) and (pointer:fine)`);触屏不该有 hover 态。
 *
 * `data-feature="game-source"` 与滚动容器上那条
 * `[&:has([data-feature='game-surface'])_[data-feature='game-source']]:invisible`
 * 配对 —— 彩蛋游戏出现时把标题隐掉。照抄留着,不然那条选择器没有锚点。
 */
export function HomeHero(): React.JSX.Element | null {
  const { currentProject } = useWorkspace()
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  if (!currentProject) return null

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div
        aria-hidden="true"
        data-testid="home-icon"
        className="relative size-14 cursor-interaction text-token-foreground opacity-30 transition-opacity duration-basic ease-enter-snappy motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:opacity-40"
      >
        <HomeLogoIcon className="absolute inset-0 size-full" />
      </div>
      <div
        data-feature="game-source"
        className="heading-xl flex max-w-full min-w-0 items-end justify-center text-center font-normal whitespace-pre-wrap text-token-foreground select-none"
      >
        <span className="group/title inline-block max-w-full">
          What should we build in{' '}
          <button
            type="button"
            data-state="closed"
            onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
            className="inline-block max-w-full cursor-interaction break-words whitespace-normal underline decoration-token-text-tertiary decoration-dotted decoration-[1px] underline-offset-4 hover:text-token-text-secondary"
          >
            {currentProject.name}
          </button>
          ?
        </span>
      </div>
      {anchor && (
        <Popover
          anchor={anchor}
          align="center"
          width={260}
          onClose={() => setAnchor(null)}
          ariaLabel="Select project"
        >
          <ProjectPicker onClose={() => setAnchor(null)} />
        </Popover>
      )}
    </div>
  )
}
