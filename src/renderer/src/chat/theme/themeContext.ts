import { createContext, useContext } from 'react'
import type { ThemeVariant } from './themes'

/**
 * 主题 context 与 hook 单独成文件。
 *
 * 不是洁癖:react-refresh 要求一个文件只导出组件,否则热更新时这个模块
 * 会整体重建,Provider 一重建下面所有状态就丢了。
 */

export interface ThemeValue {
  /** 当前生效的外观,始终跟随系统 —— 与 Codex 一致,没有用户偏好这一层 */
  variant: ThemeVariant
}

export const ThemeContext = createContext<ThemeValue | null>(null)

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme 必须在 ThemeProvider 内使用')
  return value
}
