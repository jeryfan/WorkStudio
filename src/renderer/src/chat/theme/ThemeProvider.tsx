import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { resolveSystemTheme, type ThemeName, type ThemePreference } from './themes'
import { setTheme as publishTheme } from './themeStore'
import { ThemeContext, type ThemeValue } from './themeContext'

/**
 * 主题。
 *
 * 权威状态是 `<html data-theme>`：tokens.css 的四个块靠它选中，CSS 一侧不需要
 * 知道 React 的存在。Monaco 是唯一不吃 CSS 变量的消费者（它有自己的主题注册表），
 * 所以这里把主题名再发一份到 themeStore，由 Monaco 自己订阅——这个方向不能反，
 * 反过来会把整个 Monaco 拖进应用启动路径。
 */

const STORAGE_KEY = 'workstudio.theme'

function readStored(): ThemePreference {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === 'light' ||
    raw === 'dark' ||
    raw === 'hc-light' ||
    raw === 'hc-dark' ||
    raw === 'system'
    ? raw
    : 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStored)
  const [systemTheme, setSystemTheme] = useState<ThemeName>(resolveSystemTheme)

  // 系统偏好可以在运行中变（跟随日出日落、辅助功能开关），跟着走
  useEffect(() => {
    const queries = [
      window.matchMedia('(prefers-color-scheme: dark)'),
      window.matchMedia('(prefers-contrast: more)')
    ]
    const onChange = (): void => setSystemTheme(resolveSystemTheme())
    for (const q of queries) q.addEventListener('change', onChange)
    return () => {
      for (const q of queries) q.removeEventListener('change', onChange)
    }
  }, [])

  const theme = preference === 'system' ? systemTheme : preference

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    publishTheme(theme)
  }, [theme])

  const value = useMemo<ThemeValue>(
    () => ({
      preference,
      theme,
      setPreference: (next) => {
        setPreferenceState(next)
        localStorage.setItem(STORAGE_KEY, next)
      }
    }),
    [preference, theme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
