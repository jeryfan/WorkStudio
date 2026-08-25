import { SettingsGroup } from '../SettingsGroup'
import { ThemePicker } from './ThemePicker'

/**
 * Appearance 设置页的正文 —— Codex `appearance-settings` chunk 导出的
 * `AppearanceSettings`，页面本体是 general-settings chunk 里的那个组件。
 *
 * Codex 的完整正文是两个分组：
 *
 *   Group "Theme"        （`settings.general.appearance.theme.groupTitle`）
 *     Content.gap-4
 *       ├ 主题选择器（三张缩略图卡）                       ← 本轮实现
 *       ├ 代码主题控件（有 codex 本地访问权限时才渲染）      ← 本轮不做
 *       └ 每档 chrome 主题编辑器（accent / background / ink /
 *         contrast / 半透明侧栏 / UI 与代码字体，light+dark 各一套）
 *                                                        ← 本轮不做
 *   Group "Preferences"  （`settings.general.appearance.general.groupTitle`）
 *       指针光标 / Dock 图标 / diff 标记样式 / UI 字号 / 代码字号 /
 *       减弱动效 / 字体平滑                                ← 本轮不做
 *
 * 本轮只落 Theme 分组里的主题选择器一项，因此 Preferences 分组整块不渲染 ——
 * 不留空壳分组（Codex 的 `Group.Header` 在三个插槽全空时返回空 Fragment，
 * 但一个只有标题、内容为空的分组不是 Codex 的任何一种形态）。
 */
export function AppearanceSettings(): React.JSX.Element {
  return (
    <SettingsGroup>
      <SettingsGroup.Header title="Theme" />
      <SettingsGroup.Content className="gap-4">
        <ThemePicker />
      </SettingsGroup.Content>
    </SettingsGroup>
  )
}
