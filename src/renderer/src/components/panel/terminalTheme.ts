import type { ITheme } from '@xterm/xterm'

/**
 * xterm 的配色 —— 全部取应用主题已有的 `--color-token-terminal-*`。
 *
 * 为什么必须这么做：xterm 的默认主题是**黑底白字**，而本项目（与 Codex 一样）
 * 默认是亮色。Codex 侧这套 token 是现成的，而且 background 的定义就写着
 *   `--color-token-terminal-background: var(--color-token-main-surface-primary)`
 * —— 终端底色就是应用的主表面色，不是另一套深色。硬编码颜色会在切主题时错开。
 *
 * 两处**近似**（主题里没有对应 token，已标记）：
 *   cursor          用 foreground（Codex 没有 `terminal-cursor-*`）
 *   selection       用 `--color-token-editor-selection-background`
 */

/** token 名 → xterm ITheme 的键 */
const ANSI_TOKENS = {
  black: 'black',
  red: 'red',
  green: 'green',
  yellow: 'yellow',
  blue: 'blue',
  magenta: 'magenta',
  cyan: 'cyan',
  white: 'white',
  'bright-black': 'brightBlack',
  'bright-red': 'brightRed',
  'bright-green': 'brightGreen',
  'bright-yellow': 'brightYellow',
  'bright-blue': 'brightBlue',
  'bright-magenta': 'brightMagenta',
  'bright-cyan': 'brightCyan',
  'bright-white': 'brightWhite'
} as const satisfies Record<string, keyof ITheme>

/**
 * 读一个 CSS 自定义属性的**计算值**。
 *
 * 必须用 getComputedStyle 而不是自己解 `var()` 链：这些 token 是
 * `--color-token-terminal-ansi-red → --vscode-terminal-ansiRed → #hex` 的多级
 * 引用，只有浏览器能算到底。
 */
function readToken(styles: CSSStyleDeclaration, name: string): string | undefined {
  const value = styles.getPropertyValue(name).trim()
  return value.length > 0 ? value : undefined
}

/** 从元素所处的主题上下文里算出 xterm 主题 */
export function readTerminalTheme(element: Element): ITheme {
  const styles = getComputedStyle(element)
  const foreground = readToken(styles, '--color-token-terminal-foreground')
  const theme: ITheme = {
    background: readToken(styles, '--color-token-terminal-background'),
    foreground,
    // 近似：主题里没有 terminal-cursor token
    cursor: foreground,
    cursorAccent: readToken(styles, '--color-token-terminal-background'),
    // 近似：复用编辑器的选区色
    selectionBackground: readToken(styles, '--color-token-editor-selection-background')
  }
  for (const [token, key] of Object.entries(ANSI_TOKENS)) {
    const value = readToken(styles, `--color-token-terminal-ansi-${token}`)
    if (value != null) theme[key] = value
  }
  return theme
}

/**
 * 主题切换时回调。
 *
 * 依据：`ThemeProvider` 在 `<html>` 上切 `electron-light` / `electron-dark`
 * （见 chat/theme/themes.ts），所以观察根节点的 class 就够 —— 不需要再订阅
 * 宿主的 `system-theme-variant-updated`，那条消息最终也是落到这个 class 上。
 */
export function subscribeThemeChange(listener: () => void): () => void {
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}
