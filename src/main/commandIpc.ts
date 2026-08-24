import { app, BrowserWindow, ipcMain } from 'electron'

/**
 * 命令快捷键 —— 对齐 Codex 的宿主侧键位处理:
 * Codex 由宿主(Electron 应用菜单 accelerator)捕获键位,再向渲染进程发宿主消息。
 * WS 同构:渲染层启动时把命令键位表同步过来(`commands:sync-keybindings`),
 * 主进程在 before-input-event 里匹配,命中即 preventDefault + 回发 `codex-command`。
 *
 * 注意:这是窗口级输入管线,输入框里的按键同样会被命中(与菜单 accelerator 一致;
 * ⌘P/⌘T 这类应用级命令本就该在输入框里生效)。
 */

interface CommandKeybindingEntry {
  id: string
  /** accelerator 语法:'CmdOrCtrl+T' / 'Ctrl+Shift+G' / 'Control+`' */
  key: string
  allowsKeyRepeat: boolean
}

/** 每个窗口一张表(渲染层启动时同步;通常只有一张) */
const keybindingsByWebContents = new Map<number, CommandKeybindingEntry[]>()

/** 键名归一化:Electron input.key 与 accelerator 串的差异(箭头键) */
const KEY_ALIASES: Record<string, string> = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down'
}

/** 部分键位 Shift 按下时 input.key 会变成变档字符(⌘⇧] → '}'):用 code 兜底 */
const CODE_TO_KEY: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`',
  Tab: 'Tab',
  PageUp: 'PageUp',
  PageDown: 'PageDown'
}

interface BeforeInputEventInput {
  type: string
  key: string
  code: string
  isAutoRepeat: boolean
  control: boolean
  meta: boolean
  alt: boolean
  shift: boolean
}

/** before-input-event 的 input → 可能的 accelerator 候选(key 与 code 两路) */
function inputToAcceleratorCandidates(input: BeforeInputEventInput): string[] {
  if (input.type !== 'keyDown' && input.type !== 'rawKeyDown') return []
  const { key, code, control, meta, alt, shift } = input
  if (key === 'Meta' || key === 'Control' || key === 'Alt' || key === 'Shift') return []
  const mods: string[] = []
  if (meta || control) mods.push('CmdOrCtrl')
  if (alt) mods.push('Alt')
  if (shift) mods.push('Shift')
  if (mods.length === 0) return [] // 无修饰键不参与命令匹配
  const fromKey = [...mods, KEY_ALIASES[key] ?? (key.length === 1 ? key.toUpperCase() : key)].join(
    '+'
  )
  const codeKey = CODE_TO_KEY[code]
  const fromCode = codeKey != null ? [...mods, codeKey].join('+') : null
  return fromCode != null && fromCode !== fromKey ? [fromKey, fromCode] : [fromKey]
}

export function registerCommandIpc(): void {
  ipcMain.handle('commands:sync-keybindings', (event, list: CommandKeybindingEntry[]) => {
    keybindingsByWebContents.set(event.sender.id, Array.isArray(list) ? list : [])
  })

  const attach = (win: BrowserWindow): void => {
    console.log('[command] attach window', win.id)
    const webContents = win.webContents
    webContents.on('before-input-event', (event, input) => {
      const table = keybindingsByWebContents.get(webContents.id)
      if (!table || table.length === 0) return
      const candidates = inputToAcceleratorCandidates(input)
      if (candidates.length === 0) return
      const hit = table.find((kb) => candidates.includes(kb.key))
      if (!hit) return
      if (input.isAutoRepeat && !hit.allowsKeyRepeat) return
      event.preventDefault()
      webContents.send('codex-command', hit.id)
    })
    webContents.on('destroyed', () => {
      keybindingsByWebContents.delete(webContents.id)
    })
  }

  for (const win of BrowserWindow.getAllWindows()) attach(win)
  app.on('browser-window-created', (_e, win) => attach(win))
}
