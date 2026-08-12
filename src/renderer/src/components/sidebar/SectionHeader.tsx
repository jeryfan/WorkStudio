import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useOverlay, type MenuId } from '../../state/OverlayContext'
import { ChevronIcon } from '../icons'

/** sider/2.html .icon-btn（第 380-404 行）：24px 方钮，svg 14px */
export function IconButtonSm({
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <button
      type="button"
      className={`flex size-6 shrink-0 items-center justify-center rounded-[10px] border border-transparent bg-transparent p-1 text-ink-50 hover:text-ink [&_svg]:size-3.5 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

interface SectionHeaderProps {
  title: string
  collapsed: boolean
  onToggle(): void
  /** hover 时淡入的右侧控制按钮组 */
  controls?: ReactNode
  /**
   * 由本区控制按钮打开的菜单 id。
   * 该菜单打开期间保持控制按钮组可见（鼠标已在菜单上，:hover 会丢失）。
   */
  menuId?: MenuId
}

/**
 * sider/2.html .section-header + .section-toggle-btn（第 297-368 行）：
 * 点击标题折叠/展开分区；chevron 平时透明，hover 显现，收起时旋转 -90°。
 */
export function SectionHeader({
  title,
  collapsed,
  onToggle,
  controls,
  menuId
}: SectionHeaderProps): React.JSX.Element {
  const { menu } = useOverlay()
  const controlsOpen = menuId !== undefined && menu?.id === menuId

  return (
    <div className="group flex items-center justify-between gap-2 pl-2 pr-0.5">
      <div className="min-w-0 flex-1 text-sm font-medium text-desc opacity-75">
        <div className="flex min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={onToggle}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md py-0.5 pl-0 pr-1 text-left text-sm font-medium leading-[21px]"
          >
            <span className="min-w-0 truncate">{title}</span>
            <span
              className={`flex size-3 shrink-0 items-center justify-center transition-[transform,opacity] duration-150 ${
                controlsOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              } ${collapsed ? '-rotate-90' : ''}`}
            >
              <ChevronIcon className="size-3" />
            </span>
          </button>
        </div>
      </div>
      {controls && (
        <div
          className={`flex items-center gap-1 transition-opacity duration-100 ${
            controlsOpen
              ? 'opacity-100'
              : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'
          }`}
        >
          {controls}
        </div>
      )}
    </div>
  )
}
