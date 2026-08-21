/**
 * 当前外观 + 订阅。
 *
 * 存在的理由是解耦方向:主题层不应该知道 Monaco。
 * 如果 ThemeProvider 直接 import monaco 的 setup,Monaco(几 MB)就会跟着
 * 应用启动一起加载,而用户可能整个会话都没打开过带代码块的对话。
 *
 * 于是反过来:这里只存一个字符串,谁关心谁订阅。
 */
import type { ThemeVariant } from './themes'

let current: ThemeVariant = 'dark'
const listeners = new Set<(variant: ThemeVariant) => void>()

export function getTheme(): ThemeVariant {
  return current
}

export function setTheme(variant: ThemeVariant): void {
  if (variant === current) return
  current = variant
  for (const listener of listeners) listener(variant)
}

export function subscribeTheme(listener: (variant: ThemeVariant) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
