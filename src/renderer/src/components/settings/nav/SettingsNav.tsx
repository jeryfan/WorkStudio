import { BackToAppIcon } from './backIcon'
import { NavGroup } from './NavGroup'
import { SETTINGS_SECTION_ICONS } from './sectionIconMap'
import { SidebarItem } from '../../sidebar/SidebarItem'
import { groupSettingsSections, SETTINGS_SECTIONS, SETTINGS_SECTION_TITLES } from '../sections'

/**
 * 设置的**专属侧栏** —— Codex `Yt`（对外是 `qt`）。
 *
 * 设置路由把左栏整块换成这个 nav，聊天侧栏不再渲染。层级逐字取自产物
 *（设置页传的是 `canCollapse: false`、`groupSettingsSections: true`，
 * 本地 host 下 `sidebarHostSelector` / `onClearHostFilter` 都是空）：
 *
 *   nav.flex.min-h-0.flex-1.flex-col.select-none.px-row-x   [aria-label="Settings"]
 *   └ div.flex.min-h-0.flex-1.flex-col
 *     ├ (折叠按钮 —— canCollapse=false 时为 null)
 *     ├ div[role=link].sidebar-item.group.relative.mb-2.flex.w-full.items-center
 *     │    .px-row-x.py-row-y.text-base.outline-none.gap-2
 *     │    .cursor-interaction.text-token-text-secondary.hover:bg-token-list-hover-background
 *     │    .focus-visible:ring-1.electron:opacity-75.shrink-0        ← Back to app
 *     ├ (host 选择器 —— 本地 host 下为 null)
 *     ├ (搜索框 —— 见下方"未实现")
 *     └ div.min-h-0.flex-1.overflow-y-auto.pb-2.flex.flex-col.gap-4
 *       └ 每组一个 NavGroup(className="gap-0", title=组标题) + 行
 *
 * 行是通用导航行（Codex `SOc`，本项目的 SidebarItem），设置侧栏传
 * `iconClassName="icon-sm inline-block align-middle"`、`weightClassName="font-normal"`、
 * `isActive` 表示当前分区、`data-settings-panel-slug` 供上下键跳转。
 *
 * **本轮未实现（Codex 有）**：分组上方的搜索框。它不是一个孤立输入框 ——
 * 背后是一整套设置搜索：293KB 的搜索文档目录（`settings-search-documents`
 * chunk，逐条描述每个面板里的每一项）、打分排序（`Ct`）、结果列表与键盘高亮
 * （`un` + `ee`）、以及 ⌘F 聚焦。只放一个输入框会得到一个按不出结果的死控件，
 * 所以整块留到后续轮次。
 *
 * **本轮未实现（Codex 有）**：折叠态（`canCollapse`，设置页传 false，
 * 所以这条路径在设置页里本来就走不到）、远端 host 过滤与 host 选择器、
 * 外链分区的箭头与 tooltip、"Not available in Alpha" 的 disabled 态。
 */
export function SettingsNav({
  activeSection,
  onSelect,
  onBack
}: {
  activeSection: string
  onSelect(slug: string): void
  onBack(): void
}): React.JSX.Element {
  const groups = groupSettingsSections(SETTINGS_SECTIONS)

  return (
    <nav className="flex min-h-0 flex-1 flex-col select-none px-row-x" aria-label="Settings">
      <div className="flex min-h-0 flex-1 flex-col">
        {/*
         * Back to app —— Codex 用的是 div[role=link] 而不是 button
         *（所以键盘处理要自己接 Enter / Space）。图标 icon-xs,文案
         * `settings.nav.back` = "Back to app"。
         */}
        <div
          role="link"
          tabIndex={0}
          className="sidebar-item group relative mb-2 flex w-full items-center px-row-x py-row-y text-base outline-none gap-2 cursor-interaction text-token-text-secondary hover:bg-token-list-hover-background focus-visible:ring-1 electron:opacity-75 shrink-0"
          onClick={onBack}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onBack()
            }
          }}
        >
          <BackToAppIcon className="icon-xs" />
          Back to app
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-2 flex flex-col gap-4">
          {groups.map((group) => (
            <NavGroup key={group.key} className="gap-0" title={group.heading}>
              {group.slugs.map((slug) => (
                <SidebarItem
                  key={slug}
                  ariaLabel={SETTINGS_SECTION_TITLES[slug]}
                  icon={SETTINGS_SECTION_ICONS[slug]}
                  iconClassName="icon-sm inline-block align-middle"
                  isActive={slug === activeSection}
                  dataSettingsPanelSlug={slug}
                  weightClassName="font-normal"
                  label={SETTINGS_SECTION_TITLES[slug]}
                  onClick={() => onSelect(slug)}
                />
              ))}
            </NavGroup>
          ))}
        </div>
      </div>
    </nav>
  )
}
