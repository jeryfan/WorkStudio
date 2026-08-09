import type { MenuId } from '../../state/OverlayContext'
import {
  ApiKeyIcon,
  ArchiveAllIcon,
  ArchiveTasksIcon,
  ChromeIcon,
  HelpIcon,
  KeyboardIcon,
  LogoutIcon,
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
        { id: 'archive-all', label: 'Archive all tasks', icon: ArchiveAllIcon },
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
        { id: 'archive-tasks', label: 'Archive tasks', icon: ArchiveTasksIcon },
        { id: 'remove', label: 'Remove', icon: RemoveIcon }
      ]
    },
    settings: {
      width: 283,
      entries: [
        { id: 'api-key', label: 'Logged in with API key', icon: ApiKeyIcon, disabled: true },
        { separator: 'thin' },
        { id: 'show-pet', label: 'Show pet', icon: PetIcon },
        { id: 'settings', label: 'Settings', icon: SettingsIcon, shortcut: '⌘,' },
        { id: 'logout', label: 'Log out', icon: LogoutIcon }
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
    }
  }
