import type { ComponentType } from 'react'
import type { IconProps } from '../icons'

/** 单个菜单项 */
export interface MenuItemDef {
  id: string
  label: string
  icon?: ComponentType<IconProps>
  shortcut?: string
  disabled?: boolean
  /** 右侧子菜单 chevron（Organize sidebar / Sort by） */
  submenu?: boolean
}

/** 分隔线：normal（pt 较大）/ thin */
export interface MenuSeparator {
  separator: 'normal' | 'thin'
}

export type MenuEntry = MenuItemDef | MenuSeparator

export function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return 'separator' in entry
}
