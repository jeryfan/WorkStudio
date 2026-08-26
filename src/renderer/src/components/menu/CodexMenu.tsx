import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
import { CheckIcon } from '../icons'
import { cx } from '../../utils/cx'

/**
 * 侧栏下拉菜单的 Codex 复刻 —— Radix DropdownMenu(Codex 原生就是 Radix,
 * 证据:运行 DOM 里的 data-radix-menu-content / aria-labelledby / radix id)。
 *
 * 外壳类逐字实测:
 *   no-drag z-50 m-px flex select-none flex-col overflow-y-auto px-1 py-1
 *   bg-token-dropdown-background/90 text-token-foreground ring-token-border
 *   rounded-xl ring-[0.5px] shadow-xl-spread backdrop-blur-sm
 *
 * 宽度各菜单不同,由调用方给:
 * - Project actions      min-w-[160px]
 * - 分节 options         min-w-[172px] max-w-[240px]
 * - 模式切换器           w-[240px] p-1.5
 * - profile              无宽度类,内联 style 给 calc(侧栏宽 - 2 * row 内边距)
 * - help                 w-50
 *
 * 与通用 DropdownMenu 不同的点:
 * - 项是 `div[role=menuitem]`(Radix Item 默认渲染 div),**不是 button**;
 * - hover 与 focus(Radix 键盘导航的高亮)都给底色:hover:bg + focus:bg;
 * - 图标 `icon-xs shrink-0 opacity-75 group-hover/focus:opacity-100`。
 */

const CONTENT_CLASS =
  'no-drag z-50 m-px flex select-none flex-col overflow-y-auto px-1 py-1 ' +
  'bg-token-dropdown-background/90 text-token-foreground ring-token-border rounded-xl ' +
  'ring-[0.5px] shadow-xl-spread backdrop-blur-sm'

const ITEM_CLASS =
  'no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] ' +
  'text-sm text-token-foreground group hover:bg-token-list-hover-background ' +
  'focus:bg-token-list-hover-background cursor-interaction flex flex-col'

const ITEM_ICON_CLASS =
  'icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100'

/** 菜单卡片外壳(Codex 实测类);`open` 受控时单独用 Trigger/Content 组装 */
export function CodexMenuContent({
  children,
  className,
  style,
  align = 'start',
  side,
  sideOffset
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'right' | 'left'
  sideOffset?: number
}): React.JSX.Element {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        side={side}
        align={align}
        sideOffset={sideOffset}
        className={cx(CONTENT_CLASS, className)}
        style={{
          outline: 'none',
          maxWidth: 'min(var(--radix-dropdown-menu-content-available-width), calc(100vw - 16px))',
          maxHeight: 'min(var(--radix-dropdown-menu-content-available-height), calc(100vh - 16px))',
          ...style
        }}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  )
}

export function CodexMenu({
  trigger,
  children,
  contentClassName,
  contentStyle,
  side = 'bottom',
  align = 'start',
  sideOffset,
  onOpenChange
}: {
  /** 触发器 —— 内部走 Radix Trigger asChild,data-state/aria-expanded 自动同步 */
  trigger: ReactNode
  children: ReactNode
  contentClassName?: string
  contentStyle?: React.CSSProperties
  side?: 'top' | 'bottom' | 'right' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  onOpenChange?(open: boolean): void
}): React.JSX.Element {
  return (
    <DropdownMenu.Root onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <CodexMenuContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        className={contentClassName}
        style={contentStyle}
      >
        {children}
      </CodexMenuContent>
    </DropdownMenu.Root>
  )
}

/** 分组标签(Codex `hH.SectionLabel`) */
export function CodexMenuLabel({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="px-[var(--padding-row-x)] py-1 text-sm text-token-description-foreground">
      {children}
    </div>
  )
}

/** 分组容器(Codex `hH.Section` —— 无类的普通 div) */
export function CodexMenuGroup({ children }: { children: ReactNode }): React.JSX.Element {
  return <div>{children}</div>
}

/** 分隔线(实测:px-row-x py-1 里一条 1px 的 token-menu-border) */
export function CodexMenuSeparator(): React.JSX.Element {
  return (
    <div className="w-full px-[var(--padding-row-x)] py-1">
      <div className="h-[1px] w-full bg-token-menu-border" />
    </div>
  )
}

export interface CodexMenuItemDef {
  id: string
  label: ReactNode
  icon?: ReactNode
  /** 尾部快捷键(Codex 用 span 而不是 kbd) */
  shortcut?: string
  disabled?: boolean
  onSelect?(): void
}

/** 普通菜单项(Codex `hH.Item`) */
export function CodexMenuItem({ item }: { item: CodexMenuItemDef }): React.JSX.Element {
  if (item.disabled) {
    // 实测禁用项的类:cursor-default + opacity-50,且多一个重复的 opacity-100
    // (Codex 的类拼接痕迹,照抄)
    return (
      <DropdownMenu.Item
        disabled
        className="no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-foreground cursor-default opacity-50 opacity-100 flex flex-col"
      >
        <div className="flex w-full items-center gap-1.5">
          {item.icon}
          <span className="flex-1 min-w-0 truncate">{item.label}</span>
        </div>
      </DropdownMenu.Item>
    )
  }
  return (
    <DropdownMenu.Item onSelect={() => item.onSelect?.()} className={ITEM_CLASS}>
      <div className="flex w-full items-center gap-1.5">
        {item.icon}
        <span className="flex-1 min-w-0 truncate">{item.label}</span>
        {item.shortcut != null && (
          <span className="ms-2 shrink-0 text-xs text-token-description-foreground">
            {item.shortcut}
          </span>
        )}
      </div>
    </DropdownMenu.Item>
  )
}

/**
 * 单选菜单项(Codex 的 organize/sort 组,`hH.Item` + `role=menuitemradio`)。
 * 选中态的 check 在**左侧**;未选中时 check 槽 `invisible` 占位。
 */
export function CodexMenuRadioItem({
  checked,
  label,
  onSelect
}: {
  checked: boolean
  label: ReactNode
  onSelect(): void
}): React.JSX.Element {
  return (
    <DropdownMenu.Item
      role="menuitemradio"
      aria-checked={checked}
      onSelect={onSelect}
      className={ITEM_CLASS}
    >
      <div className="flex w-full items-center gap-1.5">
        <span
          className={cx(
            'inline-flex items-center justify-center leading-none icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100',
            !checked && 'invisible'
          )}
        >
          <CheckIcon />
        </span>
        <span className="flex-1 min-w-0 truncate">{label}</span>
      </div>
    </DropdownMenu.Item>
  )
}

/** 项图标的统一类(调用方把 svg 包进来或直接给图标组件加类都行) */
export const CODEX_MENU_ITEM_ICON_CLASS = ITEM_ICON_CLASS
