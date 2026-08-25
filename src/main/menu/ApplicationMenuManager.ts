import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import {
  COMMAND_DEFINITIONS,
  findCommand,
  type CommandDefinition
} from '@shared/commands/definitions'
import {
  isCommandAvailable,
  isNativeAccelerator,
  normalizeAccelerator,
  resolveKeybindings,
  type CommandAccessState,
  type KeymapPlatform
} from '@shared/commands/keybindings'
import type { ApplicationMenuItemSnapshot } from '@shared/host/appHost'
import type { HostMessage, SyntheticKeyboardEvent } from '@shared/host/messages'
import type { WindowManager } from '../host/WindowManager'

/**
 * 原生应用菜单。
 *
 * 取证（这是与本项目原实现分歧最大的一处）：Codex **不在渲染层监听键盘**，
 * 也不用 `before-input-event` 手工匹配。它把共享命令表编译成
 * `Menu.setApplicationMenu` 的模板，accelerator 交给 Electron/OS 原生匹配，
 * 命中后 click 回调里向渲染层发宿主消息：
 *   - 通用命令 → `{ type: 'run-command', id, keyboardEvent }`
 *   - 高频面板 → 专用消息（`toggle-sidebar` / `navigate-back` / `step-zoom` …）
 *
 * 三个从实测里抄来的细节，缺一个就会出错：
 *
 * 1. **`isOverridableByBrowserWebpage` 的命令不注册 accelerator**。
 *    ⌘R / ⌘F / ⌘← 这些要留给内置浏览器里的网页；一旦进了应用菜单，
 *    Electron 会先吃掉，页面内的刷新和查找就永久失效。
 *
 * 2. **没有菜单位置但需要快捷键的命令**，做成 `visible:false` +
 *    `acceleratorWorksWhenHidden:true` 的隐藏项挂进菜单树。
 *
 * 3. **requiredAccess 不满足时是 `visible:false` 而不是删项**，
 *    这样菜单的结构（分隔线位置、项数）不随能力变化跳动。
 */

const isMac = process.platform === 'darwin'

const platform: KeymapPlatform = { isMacOS: isMac }

/** 命令 id → 专用宿主消息（Codex 为这些高频项保留了独立消息） */
const DEDICATED_MESSAGES: Record<string, HostMessage> = {
  toggleSidebar: { type: 'toggle-sidebar' },
  toggleBottomPanel: { type: 'toggle-bottom-panel' },
  toggleFileTreePanel: { type: 'toggle-file-tree-panel' },
  toggleTerminal: { type: 'toggle-terminal' },
  toggleThreadPin: { type: 'toggle-thread-pin' },
  toggleBrowserPanel: { type: 'toggle-browser-panel', source: 'manual', initiator: 'app_menu' },
  navigateBack: { type: 'navigate-back' },
  navigateForward: { type: 'navigate-forward' },
  findInThread: { type: 'find-in-thread' },
  openBrowserTab: { type: 'open-browser-tab' },
  openCommandMenu: { type: 'command-menu' },
  searchChats: { type: 'chat-search-command-menu' },
  searchFiles: { type: 'file-search-command-menu' },
  newProjectlessTask: { type: 'new-projectless-task' },
  archiveThread: { type: 'archive-thread' },
  renameThread: { type: 'rename-thread' },
  closeTab: { type: 'close-active-app-shell-tab' },
  copyDeeplink: { type: 'copy-deeplink' },
  copySessionId: { type: 'copy-session-id' },
  copyWorkingDirectory: { type: 'copy-working-directory' },
  copyConversationPath: { type: 'copy-conversation-path' }
}

export class ApplicationMenuManager {
  private access: CommandAccessState = { codexLocal: true, workLocal: false }
  private snapshot: ApplicationMenuItemSnapshot[] = []
  private readonly clickHandlers = new Map<string, () => void>()

  constructor(private readonly windowManager: WindowManager) {}

  setAccessState(access: CommandAccessState): void {
    this.access = access
    this.rebuild()
  }

  rebuild(): void {
    this.clickHandlers.clear()
    const template = this.buildTemplate()
    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
    this.snapshot = template.map((item) => toSnapshot(item))
  }

  getSnapshot(): ApplicationMenuItemSnapshot[] {
    return this.snapshot
  }

  /** Windows/Linux 自绘菜单栏点击后回原生 click（与 accelerator 走同一条实现） */
  invokeItem(id: string): void {
    this.clickHandlers.get(id)?.()
  }

  // ── 模板构建 ─────────────────────────────────────────────────────
  private buildTemplate(): MenuItemConstructorOptions[] {
    const occupied = new Set<string>()

    /** 生成一个命令菜单项；`index` 选第几个键位（同一命令的第二键位做隐藏项） */
    const item = (commandId: string, index = 0): MenuItemConstructorOptions => {
      const def = findCommand(commandId)
      if (def == null) throw new Error(`Menu references unknown command: ${commandId}`)
      const available = isCommandAvailable(def, this.access)
      const accelerator = this.acceleratorFor(def, index, occupied)
      const handler = (): void => this.dispatch(commandId)
      const id = `command:${commandId}:${index}`
      this.clickHandlers.set(id, handler)
      return {
        id,
        label: def.electron?.menuTitle ?? def.title ?? commandId,
        accelerator,
        enabled: true,
        visible: available ? undefined : false,
        click: handler
      }
    }

    /** 只为快捷键存在的隐藏项 */
    const hidden = (commandId: string, index = 0): MenuItemConstructorOptions => ({
      ...item(commandId, index),
      visible: false,
      acceleratorWorksWhenHidden: true
    })

    const appMenu: MenuItemConstructorOptions = {
      role: 'appMenu',
      submenu: [
        { role: 'about', label: `About ${app.getName()}` },
        { type: 'separator' },
        item('settings'),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }

    const fileMenu: MenuItemConstructorOptions = {
      label: 'File',
      submenu: [
        item('newTask'),
        hidden('newTask', 1),
        item('newProjectlessTask'),
        item('newWindow'),
        { type: 'separator' },
        item('openFolder'),
        { type: 'separator' },
        item('renameThread'),
        item('archiveThread'),
        item('toggleThreadPin'),
        { type: 'separator' },
        item('closeTab'),
        { role: 'close' }
      ]
    }

    const editMenu: MenuItemConstructorOptions = { role: 'editMenu' }

    const viewMenu: MenuItemConstructorOptions = {
      label: 'View',
      submenu: [
        item('toggleSidebar'),
        item('toggleBrowserPanel'),
        item('toggleSidePanel'),
        item('toggleBottomPanel'),
        item('toggleFileTreePanel'),
        item('toggleTerminal'),
        item('togglePinnedSummary'),
        { type: 'separator' },
        item('openCommandMenu'),
        hidden('openCommandMenu', 1),
        item('searchChats'),
        item('searchFiles'),
        item('findInThread'),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    }

    const navigateMenu: MenuItemConstructorOptions = {
      label: 'Navigate',
      submenu: [
        item('navigateBack'),
        item('navigateForward'),
        { type: 'separator' },
        item('previousThread'),
        item('nextThread'),
        hidden('previousTab'),
        hidden('previousTab', 1),
        hidden('previousTab', 2),
        hidden('nextTab'),
        hidden('nextTab', 1),
        hidden('nextTab', 2),
        { type: 'separator' },
        item('openBrowserTab'),
        item('focusBrowserAddressBar'),
        item('reloadBrowserPage'),
        item('hardReloadBrowserPage'),
        { type: 'separator' },
        ...Array.from({ length: 9 }, (_, index) => item(`thread${index + 1}`))
      ]
    }

    const windowMenu: MenuItemConstructorOptions = { role: 'windowMenu' }

    const helpMenu: MenuItemConstructorOptions = {
      role: 'help',
      submenu: [
        item('showKeyboardShortcuts'),
        { type: 'separator' },
        item('copySessionId'),
        item('copyWorkingDirectory'),
        item('copyConversationPath'),
        item('copyDeeplink'),
        { type: 'separator' },
        item('logOut')
      ]
    }

    return [
      ...(isMac ? [appMenu] : []),
      fileMenu,
      editMenu,
      viewMenu,
      navigateMenu,
      ...(isMac ? [windowMenu] : []),
      helpMenu
    ]
  }

  /**
   * 取该命令第 index 个可用于原生菜单的 accelerator。
   * 已被别的菜单项占用的、伪键位（MouseBack/MouseForward）、
   * 以及 `isOverridableByBrowserWebpage` 的一律不注册。
   */
  private acceleratorFor(
    def: CommandDefinition,
    index: number,
    occupied: Set<string>
  ): string | undefined {
    if (def.electron?.isOverridableByBrowserWebpage === true) return undefined
    if (!isCommandAvailable(def, this.access)) return undefined
    const candidates = resolveKeybindings(def, platform)
      .map((binding) => binding.key)
      .filter(isNativeAccelerator)
    const accelerator = candidates[index]
    if (accelerator == null) return undefined
    const key = normalizeAccelerator(accelerator, platform)
    if (occupied.has(key)) return undefined
    occupied.add(key)
    return accelerator
  }

  /** 命令派发：有专用消息就用专用消息，否则统一走 run-command */
  private dispatch(commandId: string): void {
    void this.windowManager.showPrimaryWindow().then((window) => {
      if (window == null) return
      const dedicated = DEDICATED_MESSAGES[commandId]
      if (dedicated != null) {
        this.windowManager.sendMessageToWindow(window, dedicated)
        return
      }
      this.windowManager.sendMessageToWindow(window, {
        type: 'run-command',
        id: commandId,
        keyboardEvent: syntheticKeyboardEvent(commandId)
      })
    })
  }
}

/**
 * 合成键盘事件。
 *
 * Codex 在 accelerator 触发时把修饰键状态一起发给渲染层，渲染层的命令处理器
 * 据此判断"这次是键盘触发还是点菜单触发"，以及是否要 preventDefault 同源事件。
 */
function syntheticKeyboardEvent(commandId: string): SyntheticKeyboardEvent | undefined {
  const def = findCommand(commandId)
  const accelerator = resolveKeybindings(def ?? { id: commandId }, platform)[0]?.key
  if (accelerator == null) return undefined
  const parts = accelerator.split('+')
  const mods = new Set(parts.slice(0, -1).map((part) => part.toLowerCase()))
  const primary = mods.has('cmdorctrl') || mods.has('commandorcontrol')
  return {
    key: parts[parts.length - 1] ?? '',
    altKey: mods.has('alt') || mods.has('option'),
    ctrlKey: mods.has('ctrl') || mods.has('control') || (primary && !isMac),
    metaKey: mods.has('cmd') || mods.has('command') || mods.has('meta') || (primary && isMac),
    shiftKey: mods.has('shift'),
    repeat: false
  }
}

function toSnapshot(item: MenuItemConstructorOptions): ApplicationMenuItemSnapshot {
  const submenu = Array.isArray(item.submenu) ? item.submenu.map(toSnapshot) : undefined
  return {
    id: typeof item.id === 'string' ? item.id : `role:${String(item.role ?? item.label ?? '')}`,
    label: typeof item.label === 'string' ? item.label : String(item.role ?? ''),
    enabled: item.enabled !== false,
    visible: item.visible !== false,
    ...(typeof item.accelerator === 'string' ? { accelerator: item.accelerator } : {}),
    ...(item.type != null ? { type: item.type as 'normal' | 'separator' } : {}),
    ...(submenu != null ? { submenu } : {})
  }
}

/** 命令表里所有能进原生菜单的命令（自检用：确保菜单没漏掉键位） */
export function menuCapableCommands(): CommandDefinition[] {
  return COMMAND_DEFINITIONS.filter(
    (def) => def.electron != null && def.shortcutScope !== 'os-global'
  )
}
