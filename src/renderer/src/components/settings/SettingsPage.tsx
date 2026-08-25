import type { ReactNode } from 'react'
import { cx } from '../../utils/cx'

/**
 * 设置页壳层 —— 对齐 Codex 的 detail-page 容器（`C$c`，导出名 `Wa`）。
 *
 * 层级与类名逐字取自 Codex 产物（非 embedded、非 fullWidth 这一支，
 * 设置路由用的就是这一支）：
 *
 *   div.flex.h-full.min-h-0.flex-col
 *      .electron:overflow-hidden.electron:bg-token-main-surface-primary
 *      .electron:elevation-prominent.windows:rounded-tl-lg          ← 主表面本体
 *   ├ div.flex.items-center.px-panel.draggable
 *   │    .electron:h-toolbar.extension:h-toolbar-sm                 ← 顶栏（backSlot）
 *   └ div.flex-1.scrollbar-stable.overflow-y-auto.p-panel           ← 滚动区
 *     └ div.mx-auto.flex.w-full.flex-col
 *          .max-w-3xl.electron:min-w-[calc(320px*var(--codex-window-zoom))]
 *       ├ div.pb-8 > PageHeader                                     ← 标题块
 *       └ div.flex.flex-col.gap-10                                  ← 分组之间 gap-10
 *
 * 注意这层壳自己就是"主表面"：`electron:bg-token-main-surface-primary` +
 * `electron:elevation-prominent` + `windows:rounded-tl-lg` 与
 * `.codex-MainContentSurface[data-app-shell-main-surface=default]` 的 CSS 完全
 * 对应。所以设置路由是**替换** main 表面，而不是渲染在它内部 —— 套在里面会
 * 得到两层底色和两层投影。
 *
 * `backSlot` 在 Codex 的 app-initial 里**没有任何调用方传值**（整个产物里只出现在
 * 这里的解构处），所以顶栏常态是一条空的可拖拽条：它仍然占 `h-toolbar` 的高度，
 * 让内容从红绿灯下方开始。这不是漏了返回按钮，是实测形态。
 */
export function SettingsPage({
  title,
  subtitle,
  subtitleClassName,
  action,
  backSlot,
  contentClassName,
  className,
  children
}: {
  title?: ReactNode
  subtitle?: ReactNode
  subtitleClassName?: string
  action?: ReactNode
  backSlot?: ReactNode
  contentClassName?: string
  className?: string
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div
      className={cx(
        'flex h-full min-h-0 flex-col electron:overflow-hidden electron:bg-token-main-surface-primary electron:elevation-prominent windows:rounded-tl-lg',
        className
      )}
    >
      <div className="flex items-center px-panel draggable electron:h-toolbar extension:h-toolbar-sm">
        {backSlot}
      </div>
      <div className="flex-1 scrollbar-stable overflow-y-auto p-panel">
        <div
          className={cx(
            'mx-auto flex w-full flex-col',
            'max-w-3xl electron:min-w-[calc(320px*var(--codex-window-zoom))]',
            contentClassName
          )}
        >
          {title != null && (
            <div className="pb-8">
              <SettingsPageHeader
                title={title}
                subtitle={subtitle}
                subtitleClassName={cx('text-balance', subtitleClassName)}
                actions={action}
              />
            </div>
          )}
          <div className="flex flex-col gap-10">{children}</div>
        </div>
      </div>
    </div>
  )
}

/**
 * 页头 —— Codex `b$c`，设置页传的是 `variant="settings"`。
 *
 * variant 只影响标题的字号类：settings 是 `heading-lg font-normal`
 *（page 是 `heading-lg electron:heading-xl`，default 是
 * `heading-base electron:heading-lg`）。这里只保留设置页用到的那一支。
 */
function SettingsPageHeader({
  title,
  subtitle,
  subtitleClassName,
  actions
}: {
  title: ReactNode
  subtitle?: ReactNode
  subtitleClassName?: string
  actions?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4 px-[var(--detail-page-inline-inset,0px)]">
      <div className="flex min-w-0 items-start justify-between gap-4 flex-wrap">
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1.5">
          <h1 className="min-w-0 break-words text-token-foreground heading-lg font-normal">
            {title}
          </h1>
          {subtitle != null && (
            <div className={cx('text-base text-token-text-secondary', subtitleClassName)}>
              {subtitle}
            </div>
          )}
        </div>
        {actions != null && (
          <div className="flex max-w-full shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  )
}
