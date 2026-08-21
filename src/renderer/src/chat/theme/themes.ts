/**
 * 主题清单 —— 对齐 Codex。
 *
 * Codex 只有明暗两档,且**没有应用内选择器**:它订阅宿主上报的系统外观,
 * 在 <html> 上切 electron-light / electron-dark。原先这里的四档
 * (含 hc-dark / hc-light)是照 VSCode 内置主题设计的,Codex 没有对应物,
 * 已移除。
 *
 * 两档的语义 token 不是明暗对调那么简单 —— Codex 的颜色是运行时从四个种子
 * 生成的,两套的对比度参数本身就不同(light 45 / dark 60),所以
 * assets/codex/runtime-{light,dark}.css 是各自捕获的两份实测值。
 */
import darkTheme from './vscode-themes/dark.json'
import lightTheme from './vscode-themes/light.json'

/** 与 <html> 上的 electron-* 类名一一对应 */
export const THEME_VARIANTS = ['light', 'dark'] as const

export type ThemeVariant = (typeof THEME_VARIANTS)[number]

/** <html> 上的类名 */
export function themeClassName(variant: ThemeVariant): `electron-${ThemeVariant}` {
  return `electron-${variant}`
}

/**
 * Monaco 的主题。
 *
 * TODO(Phase 3): Codex 不用 Monaco —— 它的代码渲染是 shiki 输出 .hljs-* 类、
 * 由 CSS 上色(见 assets/codex/highlight.css),diff 也是自研的。Monaco 会带进
 * 它自己的 DOM、滚动条和字体,是当前与 Codex 差异最大的一块。移除 Monaco 时
 * 这两个 VSCode 主题 JSON 一并删除。
 */
export const VSCODE_THEMES: Record<ThemeVariant, unknown> = {
  light: lightTheme,
  dark: darkTheme
}
