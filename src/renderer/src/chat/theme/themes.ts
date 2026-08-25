/**
 * 主题清单 —— 对齐 Codex。
 *
 * **这里的两档是"渲染结果"的两档,不是用户能选的档数。**
 *
 * Codex 确实有应用内主题选择器,而且是三档:设置项 `appearanceTheme`
 * (`enum('system'|'light'|'dark')`,default `system`,agentAccess `read-write`),
 * 落盘在 app-server config 的 `[desktop]` 表。界面在 Appearance 设置页
 * (见 components/settings/appearance)。
 *
 * 三档到两档的收敛发生在**主进程**,不在这里:
 *   appearanceTheme → nativeTheme.themeSource → Electron 算 shouldUseDarkColors
 *                   → 宿主广播 system-theme-variant-updated → 这里的两个类名
 * 所以渲染层只需要 light / dark 两个类名,`system` 档不需要在这一层出现 ——
 * 它是 nativeTheme 的一个取值,由 Electron 自己跟随系统(含日出日落自动切换)。
 * 原先这里的四档(含 hc-dark / hc-light)是照 VSCode 内置主题设计的,
 * Codex 没有对应物,已移除。
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
