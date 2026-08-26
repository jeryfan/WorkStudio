import type { ReactNode } from 'react'
import { cx } from '../../utils/cx'
import { isMacOS } from '../../utils/platform'
import { BlossomIcon } from '../icons/BlossomIcon'

/**
 * onboarding / 登录页的页壳 —— Codex `$al`（导出名 `Fr`，app-initial:19835919）。
 *
 * DOM 逐字：
 *
 *   div.fixed.inset-0.overflow-hidden.select-none
 *   ├ div.absolute.inset-0.bg-token-bg-primary.electron:bg-transparent   ← 底色层（常驻）
 *   ├ (u && !showBrandIcon) div.fixed.inset-x-0.top-0.z-10.h-toolbar-sm.draggable.select-none
 *   ├ (showBrandIcon)       div.fixed.inset-x-0.top-0.z-10.flex.h-toolbar.items-center
 *   │                          .justify-center.bg-token-main-surface-primary.draggable.select-none
 *   │                        └ <BrandMark aria-hidden className="pointer-events-none size-6 text-token-foreground"/>
 *   └ div[fullBleed ? 'fixed inset-0'
 *        : cx('fixed inset-x-0 bottom-0 flex items-center justify-center px-6 pb-8',
 *             u ? 'top-toolbar-sm pt-2' : 'top-0 pt-8')]
 *       └ children
 *
 *   u = !hideHeader && (platform !== 'windows' || fullBleed)
 *
 * 两处值得说明：
 * - **底色层是独立的一层**，不是根 div 的 background。因为 electron 下它要
 *   `bg-transparent`（窗口自身的材质透出来），而根 div 还要负责 `overflow-hidden`；
 *   合成一层的话没法只让底色透明。
 * - `u` 那条：Windows 上系统标题栏已经占了顶部，再加一条 `h-toolbar-sm` 的拖拽带
 *   会把内容往下推一截；但 `fullBleed`（登录页就是）时内容自己铺满，拖拽带必须有，
 *   否则整个窗口没有任何地方可拖。
 */
export function OnboardingPage({
  children,
  fullBleed = false,
  hideHeader = false,
  showBrandIcon = false
}: {
  children?: ReactNode
  fullBleed?: boolean
  hideHeader?: boolean
  showBrandIcon?: boolean
}): React.JSX.Element {
  const withHeaderStrip = !hideHeader && (isMacOS || fullBleed)
  return (
    <div className="fixed inset-0 overflow-hidden select-none">
      <div className="absolute inset-0 bg-token-bg-primary electron:bg-transparent" />
      {withHeaderStrip && !showBrandIcon && (
        <div className="fixed inset-x-0 top-0 z-10 h-toolbar-sm draggable select-none" />
      )}
      {showBrandIcon && (
        <div className="fixed inset-x-0 top-0 z-10 flex h-toolbar items-center justify-center bg-token-main-surface-primary draggable select-none">
          <BlossomIcon
            aria-hidden="true"
            className="pointer-events-none size-6 text-token-foreground"
          />
        </div>
      )}
      <div
        className={
          fullBleed
            ? 'fixed inset-0'
            : cx(
                'fixed inset-x-0 bottom-0 flex items-center justify-center px-6 pb-8',
                withHeaderStrip ? 'top-toolbar-sm pt-2' : 'top-0 pt-8'
              )
        }
      >
        {children}
      </div>
    </div>
  )
}
