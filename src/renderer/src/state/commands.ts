import { useEffect } from 'react'
import { COMMAND_DEFINITIONS, findCommand } from '@shared/commands/definitions'
import {
  commandKeybindingLabel as sharedKeybindingLabel,
  eventToAccelerator,
  isNativeAccelerator,
  normalizeAccelerator,
  resolveKeybindings,
  type KeymapPlatform
} from '@shared/commands/keybindings'
import type { HostMessageType, SyntheticKeyboardEvent } from '@shared/host/messages'
import { subscribeHostMessage } from '../host/hostMessages'

/**
 * 命令注册表（渲染层侧）。
 *
 * 命令定义与键位已经上移到 `@shared/commands` —— 主进程用同一张表生成原生
 * 应用菜单的 accelerator，渲染层用它做命令面板与提示串。这一份只保留
 * **处理器注册与分发**：
 *   - `registerCommandHandler` / `useCommandHandler`（Codex `dEr` / `TM`）
 *     LIFO + priority(normal→fallback)；
 *   - `runCommand`（Codex `xM`）按 id 执行，返回是否被消费。
 *
 * 触发链路与 Codex 一致：**键位由原生菜单的 accelerator 匹配**，主进程命中后
 * 发宿主消息，这里分发。渲染层不再把键位表同步给主进程，也不再有
 * `before-input-event` 手工匹配那一套。
 *
 * 浏览器预览页（没有 electronBridge）退化为 window keydown 兜底。
 */

const platform: KeymapPlatform = {
  isMacOS: navigator.platform.toLowerCase().includes('mac')
}

export { COMMAND_DEFINITIONS }

/** 命令 → 首个键位的展示串（⌘T） */
export function commandKeybindingLabel(id: string): string | undefined {
  return sharedKeybindingLabel(id, platform)
}

/** Codex `Po(yM, id)`：读键位展示串（本项目暂无用户自定义键位，静态直出） */
export function useCommandKeybindingLabel(id: string): string | undefined {
  return commandKeybindingLabel(id)
}

type CommandPriority = 'normal' | 'fallback'

interface CommandHandlerEntry {
  handler: (source?: string) => boolean | void
  isActive: () => boolean
  priority: CommandPriority
}

const handlers = new Map<string, CommandHandlerEntry[]>()

/** Codex `dEr` —— 返回注销函数 */
export function registerCommandHandler(
  id: string,
  handler: (source?: string) => boolean | void,
  opts?: { isActive?: () => boolean; priority?: CommandPriority }
): () => void {
  const entry: CommandHandlerEntry = {
    handler,
    isActive: opts?.isActive ?? (() => true),
    priority: opts?.priority ?? 'normal'
  }
  const list = handlers.get(id) ?? []
  list.push(entry)
  handlers.set(id, list)
  return () => {
    const current = handlers.get(id)
    if (!current) return
    const index = current.lastIndexOf(entry)
    if (index !== -1) current.splice(index, 1)
    if (current.length === 0) handlers.delete(id)
  }
}

/** Codex `mEr`/`xM`：priority normal→fallback，各自 LIFO；handler 返回 false 表示不消费 */
export function runCommand(id: string, source?: string): boolean {
  const list = handlers.get(id)
  for (const priority of ['normal', 'fallback'] as const) {
    for (let i = (list?.length ?? 0) - 1; i >= 0; i--) {
      const entry = list?.[i]
      if (entry?.priority === priority && entry.isActive()) {
        return entry.handler(source) !== false
      }
    }
  }
  return false
}

/** Codex `TM`：React hook 形式的注册 */
export function useCommandHandler(
  id: string,
  handler: (source?: string) => boolean | void,
  opts?: { isActive?: () => boolean; priority?: CommandPriority }
): void {
  useEffect(() => registerCommandHandler(id, handler, opts), [id, handler, opts])
}

/* ==================== 宿主消息 → 命令 ==================== */

/**
 * 宿主为高频面板保留了专用消息（不走 `run-command`）。
 *
 * Codex 的组件是各自 `useHostMessage('toggle-sidebar', …)` 直接接这些消息；
 * 本项目的面板已经按命令 id 注册了处理器，所以在这里把专用消息映射回命令 id，
 * 保持只有一套分发出口。映射表与主进程 `ApplicationMenuManager` 里的
 * `DEDICATED_MESSAGES` 是同一组对应关系，改一边要改另一边。
 */
const MESSAGE_TO_COMMAND: Partial<Record<HostMessageType, string>> = {
  'toggle-sidebar': 'toggleSidebar',
  'toggle-bottom-panel': 'toggleBottomPanel',
  'toggle-file-tree-panel': 'toggleFileTreePanel',
  'toggle-terminal': 'toggleTerminal',
  'toggle-thread-pin': 'toggleThreadPin',
  'toggle-browser-panel': 'toggleBrowserPanel',
  'navigate-back': 'navigateBack',
  'navigate-forward': 'navigateForward',
  'find-in-thread': 'findInThread',
  'open-browser-tab': 'openBrowserTab',
  'close-active-app-shell-tab': 'closeTab',
  'command-menu': 'openCommandMenu',
  'chat-search-command-menu': 'searchChats',
  'file-search-command-menu': 'searchFiles',
  'new-projectless-task': 'newProjectlessTask',
  'archive-thread': 'archiveThread',
  'rename-thread': 'renameThread',
  'copy-deeplink': 'copyDeeplink',
  'copy-session-id': 'copySessionId',
  'copy-working-directory': 'copyWorkingDirectory',
  'copy-conversation-path': 'copyConversationPath'
}

let initialized = false

/**
 * 启动命令链路（App 根挂一次）。
 *
 * Electron 宿主：订阅 `run-command` 与全部专用面板消息。
 * 非 Electron 宿主（预览页）：没有原生菜单，退化为 window keydown 兜底 ——
 * 这条兜底路径要自己做键位匹配与去重，只为预览页服务。
 */
export function initCommandBridge(): void {
  if (initialized) return
  initialized = true

  if (window.electronBridge != null) {
    subscribeHostMessage('run-command', (message) => {
      runCommand(message.id, sourceOf(message.keyboardEvent))
    })
    for (const [type, commandId] of Object.entries(MESSAGE_TO_COMMAND) as Array<
      [HostMessageType, string]
    >) {
      subscribeHostMessage(type, () => {
        runCommand(commandId, 'host_message')
      })
    }
    return
  }

  // 预览页兜底：宿主不在，只能自己听键盘
  const occupied = new Map<string, string>()
  for (const def of COMMAND_DEFINITIONS) {
    if (def.shortcutScope === 'os-global') continue
    for (const binding of resolveKeybindings(def, platform)) {
      if (!isNativeAccelerator(binding.key)) continue
      const key = normalizeAccelerator(binding.key, platform)
      if (!occupied.has(key)) occupied.set(key, def.id)
    }
  }
  window.addEventListener('keydown', (event) => {
    const accelerator = eventToAccelerator(event)
    if (accelerator == null) return
    const commandId = occupied.get(normalizeAccelerator(accelerator, platform))
    if (commandId == null) return
    const def = findCommand(commandId)
    if (event.repeat && def?.allowsKeyRepeat !== true) return
    if (runCommand(commandId, 'keyboard_shortcut')) event.preventDefault()
  })
}

function sourceOf(keyboardEvent: SyntheticKeyboardEvent | undefined): string {
  return keyboardEvent == null ? 'app_menu' : 'keyboard_shortcut'
}
