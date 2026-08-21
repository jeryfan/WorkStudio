import type { MenuId } from '../../state/OverlayContext'
import {
  AddReviewIcon,
  ApiKeyIcon,
  ArchiveAllIcon,
  ArchiveTasksIcon,
  ChromeIcon,
  HelpIcon,
  KeyboardIcon,
  OrganizeIcon,
  PetIcon,
  PinProjectIcon,
  RemoveIcon,
  RenameIcon,
  RevealIcon,
  SettingsIcon,
  SortIcon,
  WhatsNewIcon,
  WorktreeIcon
} from '../icons'
import type { MenuEntry } from './types'

/**
 * 四个下拉菜单的内容与样式参数（sider/2.html 第 2999-3413 行）。
 */
export const menuDefs: Record<MenuId, { entries: MenuEntry[]; minWidth?: number; width?: number }> =
  {
    'project-options': {
      minWidth: 172,
      entries: [
        { id: 'archive-all', label: 'Archive all chats', icon: ArchiveAllIcon },
        { separator: 'normal' },
        { id: 'organize', label: 'Organize sidebar', icon: OrganizeIcon, submenu: true },
        { id: 'sort-by', label: 'Sort by', icon: SortIcon, submenu: true }
      ]
    },
    'project-actions': {
      minWidth: 160,
      entries: [
        { id: 'pin-project', label: 'Pin project', icon: PinProjectIcon },
        { id: 'reveal', label: 'Reveal in Finder', icon: RevealIcon },
        { id: 'worktree', label: 'Create permanent worktree', icon: WorktreeIcon },
        { id: 'rename', label: 'Rename project', icon: RenameIcon },
        { id: 'archive-chats', label: 'Archive chats', icon: ArchiveTasksIcon },
        { id: 'remove', label: 'Remove', icon: RemoveIcon }
      ]
    },
    // Codex 的 profile 菜单实测:卡片 324 宽,三条 316×29 的 menuitem
    // (账户名 / Show pet / Settings ⌘,)。账户名那条也是普通 menuitem,
    // 只是下面跟了分隔线才看着像标题。Codex 这个菜单里没有 Log out。
    settings: {
      width: 324,
      entries: [
        { id: 'api-key', label: 'Logged in with API key', icon: ApiKeyIcon, disabled: true },
        { separator: 'thin' },
        { id: 'show-pet', label: 'Show pet', icon: PetIcon },
        { id: 'settings', label: 'Settings', icon: SettingsIcon, shortcut: '⌘,' }
      ]
    },
    help: {
      minWidth: 220,
      entries: [
        { id: 'chrome-ext', label: 'Set up Chrome extension', icon: ChromeIcon },
        { separator: 'thin' },
        { id: 'whats-new', label: "What's new", icon: WhatsNewIcon },
        { id: 'shortcuts', label: 'Keyboard shortcuts', icon: KeyboardIcon },
        { id: 'help', label: 'Help', icon: HelpIcon }
      ]
    },
    // panel/1.html #menu-add-tab（设计文件在第 359 行截断，仅 Review 一项可考，
    // Browser 项为保持现有新建标签能力所加；Review tab 类型未实现，暂置灰）
    'add-tab': {
      width: 280,
      entries: [
        { id: 'review', label: 'Review', icon: AddReviewIcon, shortcut: '⌃⇧G', disabled: true },
        { id: 'browser', label: 'Browser', icon: ChromeIcon }
      ]
    }
  }
