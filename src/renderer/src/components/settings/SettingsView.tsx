import { SettingsPage } from './SettingsPage'
import { SETTINGS_SECTION_TITLES } from './sections'
import { AppearanceSettings } from './appearance/AppearanceSettings'

/**
 * 设置路由的内容侧分发点 —— Codex 里每个 section 是一个懒加载 chunk，
 * 外面统一套 `<DetailPage title={<SectionTitle slug={section}/>}>`
 *（`appearance-settings` chunk 就是这三行）。这里保持同一形状。
 *
 * 标题走 sections.ts 那张表（逐字取自 Codex 的 slug→标题 switch），
 * 所以未实现的分区也有正确的标题，只是正文为空 —— 这与"标题都没有"
 * 是两件事：前者能看出这一页确实存在、只是内容还没搬。
 */
export function SettingsView({ section }: { section: string }): React.JSX.Element {
  return (
    <SettingsPage title={SETTINGS_SECTION_TITLES[section] ?? null}>
      {section === 'appearance' ? <AppearanceSettings /> : null}
    </SettingsPage>
  )
}
