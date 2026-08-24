import { useEffect } from 'react'

/**
 * 命令注册表 —— Codex command registry 的 WS 移植:
 * - 静态定义(Codex `xxr`/`yxr` 等数组):id + defaultKeybindings(macOS 用
 *   platformDefaultKeybindings.macOS 覆盖;Codex `zxr` 解析)。
 * - `useCommandHandler`(Codex `TM`):注册处理器,LIFO + priority(normal→fallback)。
 * - `runCommand`(Codex `xM`):按 id 执行;返回是否被处理。
 * - `useCommandKeybindingLabel`(Codex `Po(yM, id)`):首个键位的展示串(⌘T)。
 *
 * 触发链路:Codex Electron 是宿主注册 accelerator → 渲染进程收宿主消息(`_m`)。
 * WS 同构:渲染层把键位表同步给主进程,主进程 before-input-event 命中后
 * 发 `codex-command` IPC,这里分发(等价宿主消息)。浏览器预览(无 bridge)
 * 退化为 window keydown 监听。
 */

/* ==================== 定义(右面板相关子集) ==================== */

export interface CommandKeybinding {
  /** Electron accelerator 语法:'CmdOrCtrl+T' / 'Ctrl+Shift+G' / 'Control+`' */
  key: string
}

export interface CommandDefinition {
  id: string
  defaultKeybindings?: CommandKeybinding[]
  platformDefaultKeybindings?: {
    macOS?: CommandKeybinding[]
    default?: CommandKeybinding[]
  }
  /** Codex:长按连发(tab 切换用) */
  allowsKeyRepeat?: boolean
}

/**
 * 已取证的 Codex 命令(app-initial:203614-204470,键位为 electron 段实测)。
 * openReviewTab(⌃⇧G)/toggleTerminal(⌃`)在 Review/Terminal tab 落地前只定义不接。
 */
export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  {
    id: 'openBrowserTab',
    defaultKeybindings: [{ key: 'CmdOrCtrl+T' }]
  },
  {
    id: 'toggleBrowserPanel',
    defaultKeybindings: [{ key: 'CmdOrCtrl+Shift+B' }]
  },
  {
    id: 'searchFiles',
    defaultKeybindings: [{ key: 'CmdOrCtrl+P' }]
  },
  {
    id: 'toggleSidePanel',
    defaultKeybindings: [{ key: 'CmdOrCtrl+Alt+B' }]
  },
  {
    id: 'toggleMaximizeSidePanel'
  },
  {
    id: 'toggleFileTreePanel',
    defaultKeybindings: [{ key: 'CmdOrCtrl+Shift+E' }]
  },
  {
    id: 'toggleBottomPanel',
    defaultKeybindings: [{ key: 'CmdOrCtrl+J' }]
  },
  {
    id: 'openSideChat',
    defaultKeybindings: [{ key: 'CmdOrCtrl+Alt+S' }]
  },
  {
    id: 'nextTab',
    allowsKeyRepeat: true,
    defaultKeybindings: [{ key: 'CmdOrCtrl+Shift+]' }],
    platformDefaultKeybindings: {
      macOS: [{ key: 'Ctrl+Tab' }, { key: 'Command+Shift+]' }, { key: 'Command+Alt+Right' }],
      default: [{ key: 'Ctrl+Tab' }, { key: 'Ctrl+Shift+]' }, { key: 'Ctrl+PageDown' }]
    }
  },
  {
    id: 'previousTab',
    allowsKeyRepeat: true,
    defaultKeybindings: [{ key: 'CmdOrCtrl+Shift+[' }],
    platformDefaultKeybindings: {
      macOS: [{ key: 'Ctrl+Shift+Tab' }, { key: 'Command+Shift+[' }, { key: 'Command+Alt+Left' }],
      default: [{ key: 'Ctrl+Shift+Tab' }, { key: 'Ctrl+Shift+[' }, { key: 'Ctrl+PageUp' }]
    }
  },
  {
    /*
     * Codex 里它是宿主消息 `close-active-app-shell-tab`(⌘W 由应用菜单触发),
     * 不走命令定义;WS 收进注册表统一管理(键位一致,链路见文件头注释)。
     */
    id: 'close-active-app-shell-tab',
    defaultKeybindings: [{ key: 'CmdOrCtrl+W' }]
  }
]

/* ==================== 键位解析与展示 ==================== */

const IS_MACOS = navigator.platform.toLowerCase().includes('mac')

/** Codex `zxr`:平台覆盖优先,否则 defaultKeybindings */
export function resolveKeybindings(def: CommandDefinition): CommandKeybinding[] {
  const platform = IS_MACOS
    ? def.platformDefaultKeybindings?.macOS
    : def.platformDefaultKeybindings?.default
  return platform ?? def.defaultKeybindings ?? []
}

/** Codex `Uj`:键位 → 展示串(macOS 符号:⌘⌥⇧⌃) */
export function formatKeybindingLabel(binding: string): string {
  if (!IS_MACOS) return binding
  const parts = binding.split('+')
  const key = parts[parts.length - 1]
  const mods = new Set(parts.slice(0, -1).map((p) => p.toLowerCase()))
  const hasCmd = mods.has('cmdorctrl') || mods.has('cmd') || mods.has('command') || mods.has('meta')
  const hasAlt = mods.has('alt') || mods.has('option')
  const hasShift = mods.has('shift')
  // Ctrl 与 CmdOrCtrl 互斥(Codex 的键位不会同时出现)
  const hasCtrl = !hasCmd && (mods.has('ctrl') || mods.has('control'))
  return `${hasCtrl ? '⌃' : ''}${hasAlt ? '⌥' : ''}${hasShift ? '⇧' : ''}${hasCmd ? '⌘' : ''}${key.length === 1 ? key.toUpperCase() : key}`
}

/** 命令 → 首个键位的展示串(没有 → undefined) */
export function commandKeybindingLabel(id: string): string | undefined {
  const def = COMMAND_DEFINITIONS.find((d) => d.id === id)
  if (!def) return undefined
  const first = resolveKeybindings(def)[0]
  return first ? formatKeybindingLabel(first.key) : undefined
}

/* ==================== 处理器注册与分发(Codex `dEr`/`mEr`) ==================== */

type CommandPriority = 'normal' | 'fallback'

interface CommandHandlerEntry {
  handler: (source?: string) => boolean | void
  isActive: () => boolean
  priority: CommandPriority
}

/** Codex `HEr` */
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

/** Codex `mEr`/`xM`:priority normal→fallback,各自 LIFO;handler 返回 false 表示不消费 */
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

/** Codex `TM`:React hook 形式的注册 */
export function useCommandHandler(
  id: string,
  handler: (source?: string) => boolean | void,
  opts?: { isActive?: () => boolean; priority?: CommandPriority }
): void {
  useEffect(() => registerCommandHandler(id, handler, opts), [id, handler, opts])
}

/** Codex `Po(yM, id)`:读键位展示串(WS 无用户自定义键位表,静态直出) */
export function useCommandKeybindingLabel(id: string): string | undefined {
  return commandKeybindingLabel(id)
}

/* ==================== 宿主桥(主进程 accelerator → 命令) ==================== */

/** 归一化给主进程匹配的键位表 */
function keybindingsPayload(): { id: string; key: string; allowsKeyRepeat: boolean }[] {
  return COMMAND_DEFINITIONS.flatMap((def) =>
    resolveKeybindings(def).map((b) => ({
      id: def.id,
      key: b.key,
      allowsKeyRepeat: def.allowsKeyRepeat === true
    }))
  )
}

let initialized = false

/**
 * 启动命令链路(App 根挂一次):
 * 1. 键位表同步给主进程(before-input-event 匹配后回发 `codex-command`)
 * 2. 订阅主进程命令消息 → runCommand(…, 'keyboard_shortcut')(Codex `fEr` 同源)
 * 3. 无 bridge(浏览器预览)→ window keydown 兜底
 */
export function initCommandBridge(): void {
  if (initialized) return
  initialized = true
  const bridge = window.codexBridge
  if (bridge?.syncCommandKeybindings != null && bridge.subscribeCommand != null) {
    void bridge.syncCommandKeybindings(keybindingsPayload())
    bridge.subscribeCommand((id) => {
      runCommand(id, 'keyboard_shortcut')
    })
    return
  }
  // 浏览器预览兜底
  window.addEventListener('keydown', (e) => {
    const pressed = eventToAccelerator(e)
    if (pressed == null) return
    for (const def of COMMAND_DEFINITIONS) {
      if (resolveKeybindings(def).some((b) => b.key === pressed)) {
        if (!def.allowsKeyRepeat && e.repeat) return
        if (runCommand(def.id, 'keyboard_shortcut')) {
          e.preventDefault()
          return
        }
      }
    }
  })
}

/** KeyboardEvent → accelerator 串(与主进程 eventToAccelerator 同一规则) */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  if (e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift') return null
  const parts: string[] = []
  if (e.metaKey || e.ctrlKey) parts.push('CmdOrCtrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
  parts.push(key)
  return parts.join('+')
}
