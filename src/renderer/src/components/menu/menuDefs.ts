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
  UnpinIcon,
  WhatsNewIcon,
  WorktreeIcon
} from '../icons'
import type { MenuEntry } from './types'

/**
 * 下拉菜单内容与样式参数 —— 文案与项数实测自 Codex（用 CDP 打开真实菜单读取）。
 */
/**
 * Project actions 的动态版本 —— 首项按置顶状态切文案。
 * Codex 实测:未置顶显示 "Pin project",已置顶显示 "Unpin project"。
 */
export function projectActionEntries(pinned: boolean): MenuEntry[] {
  const base = menuDefs['project-actions'].entries
  return [
    pinned
      ? { id: 'pin-project', label: 'Unpin project', icon: UnpinIcon }
      : { id: 'pin-project', label: 'Pin project', icon: PinProjectIcon },
    ...base.slice(1)
  ]
}
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
    /*
     * Project actions —— 六项,文案逐字实测(CDP 打开真实菜单读取):
     *   Unpin project / Reveal in Finder / Create permanent worktree /
     *   Edit project / Archive chats / Remove
     *
     * 两处以前写错的:
     * - 第 4 项是 **Edit project**,不是 "Rename project"
     * - 首项随置顶状态切 **Pin project ⇄ Unpin project**,所以这里给的是默认值,
     *   SidebarProjectRow 会按 pinned 覆盖它(见那边的 projectActionEntries)
     */
    'project-actions': {
      minWidth: 160,
      entries: [
        { id: 'pin-project', label: 'Pin project', icon: PinProjectIcon },
        { id: 'reveal', label: 'Reveal in Finder', icon: RevealIcon },
        { id: 'worktree', label: 'Create permanent worktree', icon: WorktreeIcon },
        { id: 'edit-project', label: 'Edit project', icon: RenameIcon },
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
