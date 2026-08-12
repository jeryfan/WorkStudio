import { createContext, useContext } from 'react'
import type { ThemeName, ThemePreference } from './themes'

/**
 * 主题 context 与 hook 单独成文件。
 *
 * 不是洁癖：react-refresh 要求一个文件只导出组件，否则热更新时这个模块
 * 会整体重建，Provider 一重建下面所有状态就丢了。
 */

export interface ThemeValue {
  /** 用户的选择，可能是 `system` */
  preference: ThemePreference
  /** 实际生效的主题 */
  theme: ThemeName
  setPreference: (preference: ThemePreference) => void
}

export const ThemeContext = createContext<ThemeValue | null>(null)

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme 必须在 ThemeProvider 内使用')
  return value
}
