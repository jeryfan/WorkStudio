/**
 * 主题的当前值 + 订阅。
 *
 * 存在的理由是解耦方向：主题层不应该知道 Monaco。
 * 如果 ThemeProvider 直接 `import` monaco 的 setup，Monaco（几 MB）就会跟着
 * 应用启动一起加载，而用户可能整个会话都没打开过带代码块的对话。
 *
 * 于是反过来：这里只存一个字符串，谁关心谁订阅。Monaco 在第一个代码块挂载时
 * 才 boot，boot 时读当前值、并订阅后续变化。
 */
import type { ThemeName } from './themes'

let current: ThemeName = 'dark'
const listeners = new Set<(theme: ThemeName) => void>()

export function getTheme(): ThemeName {
  return current
}

export function setTheme(theme: ThemeName): void {
  if (theme === current) return
  current = theme
  for (const listener of listeners) listener(theme)
}

export function subscribeTheme(listener: (theme: ThemeName) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
