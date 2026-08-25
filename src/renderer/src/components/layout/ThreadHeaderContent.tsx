import type { ReactNode } from 'react'

/**
 * header 中段的内容布局 —— Codex `Lsc`(app-initial:583889)。
 *
 * 结构逐字对齐(首页态的空壳在实测 DOM `codex-dom-full.txt` 里也是这一套):
 *
 *   div.grid.grid-cols-[minmax(0,1fr)_auto].gap-x-4.draggable.electron:h-toolbar
 *   ├ div.text-md.flex.min-w-0.items-center.gap-0.truncate…electron:font-medium
 *   │ ├ (project != null || start) div.flex.min-w-0.items-center.gap-0.5[.ps-2]
 *   │ │ ├ (project) 项目图标 + 名                       ← 未接,见下
 *   │ │ └ (start)  div.max-w-[320px].min-w-0.truncate    ← 标题
 *   │ └ div.flex.min-w-0.items-center.gap-1              ← env chip / secondary / startActions
 *   └ div.flex.items-center.justify-end.gap-1.5          ← trailing
 *
 * 两处按 Codex 保留但本项目还没有内容:
 * - `project`:Codex 在标题左边放项目图标 + hover card(`Rsc`),
 *   项目为空时整块不渲染,并给标题块补 `ps-2`。本项目的 header 还没有项目块,
 *   所以走的一直是 `ps-2` 那一支。
 * - Codex 的 `startActions` 右边还有一组 `u`(实测恒为空数组)与分隔线,
 *   条件是 `u.length > 0`,永远为假 —— 不搬。
 */
export function ThreadHeaderContent({
  start,
  startActions,
  secondary,
  trailing
}: {
  /** 标题（Codex 的 `start`，thread 路由传的是可改名标题） */
  start?: ReactNode
  /** 标题右侧的动作组（三点菜单等） */
  startActions?: ReactNode
  /** 标题下/右的次要说明（Codex `secondary`，灰色 18px 行高） */
  secondary?: ReactNode
  /** 最右侧（Codex `trailing`） */
  trailing?: ReactNode
}): React.JSX.Element {
  return (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 draggable electron:h-toolbar extension:py-row-y">
      <div className="text-md flex min-w-0 items-center gap-0 truncate text-base focus-within:overflow-visible electron:font-medium">
        {start == null ? null : (
          <div className="flex min-w-0 items-center gap-0.5 ps-2">
            <div className="max-w-[320px] min-w-0 truncate focus-within:overflow-visible">
              {start}
            </div>
          </div>
        )}
        <div className="flex min-w-0 items-center gap-1">
          {secondary == null ? null : (
            <div className="flex min-w-0 truncate leading-[18px] font-normal text-token-description-foreground">
              {secondary}
            </div>
          )}
          {startActions}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5">{trailing}</div>
    </div>
  )
}
