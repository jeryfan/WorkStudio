import {
  COMMAND_DEFINITIONS,
  findCommand,
  type CommandDefinition,
  type CommandKeybinding
} from './definitions'

/**
 * 键位解析 —— 对齐 Codex 的 `zt`（解析）/`Ut`（原生可表达判定）/`Ht`（可用性闸门）。
 *
 * 平台覆盖优先于 defaultKeybindings：Codex 的 `platformDefaultKeybindings.macOS`
 * 在 macOS 上是**替换**而不是追加（⌘⇧] 在 mac 上会被 ⌃Tab 一组取代）。
 */

export interface KeymapPlatform {
  isMacOS: boolean
}

/** 宿主可用能力，对应 Codex 的 `{codexLocal, workLocal}` */
export interface CommandAccessState {
  codexLocal: boolean
  workLocal: boolean
}

/** Codex 伪键位：鼠标侧键，原生菜单表达不了，只能在渲染层监听 */
const PSEUDO_KEYS = new Set(['MouseBack', 'MouseForward'])

export function resolveKeybindings(
  def: CommandDefinition,
  platform: KeymapPlatform
): CommandKeybinding[] {
  const electron = def.electron
  if (!electron) return []
  const override = platform.isMacOS
    ? electron.platformDefaultKeybindings?.macOS
    : electron.platformDefaultKeybindings?.default
  return override ?? electron.defaultKeybindings ?? []
}

export function resolveAccelerators(commandId: string, platform: KeymapPlatform): string[] {
  const def = findCommand(commandId)
  return def ? resolveKeybindings(def, platform).map((binding) => binding.key) : []
}

/** Codex `Ut` 的取反：能否作为原生菜单 accelerator */
export function isNativeAccelerator(accelerator: string): boolean {
  return !accelerator.includes(' ') && !PSEUDO_KEYS.has(accelerator)
}

/** Codex `Ht`：requiredAccess 闸门。不满足时菜单项 visible:false 而不是删掉 */
export function isCommandAvailable(def: CommandDefinition, access: CommandAccessState): boolean {
  switch (def.requiredAccess) {
    case undefined:
      return true
    case 'codexLocal':
      return access.codexLocal
    case 'workLocal':
      return access.workLocal
    case 'codexOrWorkLocal':
      return access.codexLocal || access.workLocal
  }
}

/**
 * 归一化 accelerator 以便去重比较。
 *
 * `CmdOrCtrl+F` 与 macOS 上的 `Command+F` 是同一个键位，若不归一化，
 * "该命令的键位是否已被别的菜单项占用"就判不准，会出现两个菜单项抢同一个键。
 */
export function normalizeAccelerator(accelerator: string, platform: KeymapPlatform): string {
  const parts = accelerator.split('+')
  const key = parts[parts.length - 1] ?? ''
  const mods = new Set(parts.slice(0, -1).map((part) => part.toLowerCase()))
  const hasCmdOrCtrl = mods.has('cmdorctrl') || mods.has('commandorcontrol')
  const meta = mods.has('command') || mods.has('cmd') || mods.has('meta')
  const ctrl = mods.has('control') || mods.has('ctrl')
  const primary = hasCmdOrCtrl ? (platform.isMacOS ? 'meta' : 'ctrl') : null
  const normalized: string[] = []
  if (primary === 'meta' || meta) normalized.push('meta')
  if (primary === 'ctrl' || ctrl) normalized.push('ctrl')
  if (mods.has('alt') || mods.has('option')) normalized.push('alt')
  if (mods.has('shift')) normalized.push('shift')
  normalized.sort()
  return `${normalized.join('+')}|${key.length === 1 ? key.toUpperCase() : key}`
}

/** 键位 → 展示串（macOS 用符号：⌃⌥⇧⌘，顺序与系统一致） */
export function formatKeybindingLabel(accelerator: string, platform: KeymapPlatform): string {
  if (!platform.isMacOS) return accelerator
  const parts = accelerator.split('+')
  const key = parts[parts.length - 1] ?? ''
  const mods = new Set(parts.slice(0, -1).map((part) => part.toLowerCase()))
  const hasCmd =
    mods.has('cmdorctrl') ||
    mods.has('commandorcontrol') ||
    mods.has('cmd') ||
    mods.has('command') ||
    mods.has('meta')
  const hasAlt = mods.has('alt') || mods.has('option')
  const hasShift = mods.has('shift')
  // CmdOrCtrl 在 mac 上是 ⌘，此时不再叠加 ⌃
  const hasCtrl = !hasCmd && (mods.has('ctrl') || mods.has('control'))
  const label = key.length === 1 ? key.toUpperCase() : (KEY_SYMBOLS[key] ?? key)
  return `${hasCtrl ? '⌃' : ''}${hasAlt ? '⌥' : ''}${hasShift ? '⇧' : ''}${hasCmd ? '⌘' : ''}${label}`
}

const KEY_SYMBOLS: Record<string, string> = {
  Left: '←',
  Right: '→',
  Up: '↑',
  Down: '↓',
  Tab: '⇥',
  PageUp: '⇞',
  PageDown: '⇟',
  Enter: '↩',
  Escape: '⎋'
}

/** 命令 → 首个可展示键位（命令面板与菜单项右侧的提示串） */
export function commandKeybindingLabel(
  commandId: string,
  platform: KeymapPlatform
): string | undefined {
  const first = resolveAccelerators(commandId, platform).find(isNativeAccelerator)
  return first == null ? undefined : formatKeybindingLabel(first, platform)
}

/**
 * 所有会被原生菜单占用的键位（归一化后）。
 *
 * Codex 用它做两件事：① 给"隐藏但仍要响应 accelerator"的菜单项去重；
 * ② 把 `isOverridableByBrowserWebpage` 的命令排除在外 —— 那些键位要留给
 * 内置浏览器里的网页。
 */
export function nativeMenuOccupiedAccelerators(
  platform: KeymapPlatform,
  access: CommandAccessState
): Set<string> {
  const occupied = new Set<string>()
  for (const def of COMMAND_DEFINITIONS) {
    if (def.electron?.isOverridableByBrowserWebpage === true) continue
    if (def.shortcutScope === 'os-global') continue
    if (!isCommandAvailable(def, access)) continue
    for (const binding of resolveKeybindings(def, platform)) {
      if (isNativeAccelerator(binding.key))
        occupied.add(normalizeAccelerator(binding.key, platform))
    }
  }
  return occupied
}

/** 渲染层兜底监听用：KeyboardEvent → accelerator 串（与解析规则同一套） */
export function eventToAccelerator(event: {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}): string | null {
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) return null
  const parts: string[] = []
  if (event.metaKey) parts.push('Command')
  if (event.ctrlKey) parts.push('Control')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
  parts.push(key)
  return parts.join('+')
}
