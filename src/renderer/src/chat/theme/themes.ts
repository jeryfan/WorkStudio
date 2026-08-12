/**
 * 主题清单。
 *
 * 四档对应 VSCode 的四个内置默认主题（workbenchThemeService.ts 的
 * ThemeSettingDefaults）。名字同时是三处的键，必须一致：
 *
 *   `<html data-theme="...">`  → tokens.css 里的选择器
 *   shiki / Monaco 的主题名     → vscode-themes/<name>.json 里的 `name`
 *
 * 这三处任意一处对不上，表现都是"某一档主题下颜色全错"，所以这里做成单一来源。
 */
import darkTheme from './vscode-themes/dark.json'
import lightTheme from './vscode-themes/light.json'
import hcDarkTheme from './vscode-themes/hc-dark.json'
import hcLightTheme from './vscode-themes/hc-light.json'

export const THEME_NAMES = ['dark', 'light', 'hc-dark', 'hc-light'] as const

export type ThemeName = (typeof THEME_NAMES)[number]

/** 用户可选的主题偏好；`system` 表示跟随操作系统 */
export type ThemePreference = ThemeName | 'system'

/** 生成物，供 shiki 加载后再交给 Monaco */
export const VSCODE_THEMES: Record<ThemeName, unknown> = {
  dark: darkTheme,
  light: lightTheme,
  'hc-dark': hcDarkTheme,
  'hc-light': hcLightTheme
}

/**
 * 跟随系统时解析出实际主题。
 *
 * 先看对比度再看明暗：系统开了高对比度的用户，拿到普通深色主题等于没生效。
 */
export function resolveSystemTheme(): ThemeName {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const contrast = window.matchMedia('(prefers-contrast: more)').matches
  if (contrast) return dark ? 'hc-dark' : 'hc-light'
  return dark ? 'dark' : 'light'
}
