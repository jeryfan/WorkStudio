import { cx } from '../../utils/cx'

/**
 * Composer 顶部菜单壳 —— Codex `_ComposerTopMenuShell`(`/`、`@` 触发与上下文
 * 建议共用的那个浮层),按运行时抓取的 DOM 逐层复刻:
 *
 *   div[data-composer-overlay-floating-ui].codex-ComposerTopMenuShell
 *       .absolute.left-0.right-0.bottom-full.mb-2.z-50      ← 锚在 composer 上方,非 portal
 *   └ div.border-token-border.bg-token-dropdown-background/90.relative.flex.w-full
 *       .flex-col.overflow-hidden.rounded-2xl.border.text-sm.backdrop-blur-sm.p-1.max-h-[320px]
 *     └ div.vertical-scroll-fade-mask.flex.w-full.flex-1.flex-col.overflow-y-auto
 *       └ div
 *         └ button[data-list-navigation-item][aria-selected]
 *             (.bg-token-list-hover-background.opacity-100 选中 / .opacity-75 未选)
 *           └ div.flex.w-full.items-center.gap-2
 *             ├ [icon svg]
 *             └ div.min-w-0.flex-1
 *               └ div.flex.w-full.min-w-0.items-center.gap-2
 *                 ├ div.truncate.max-w-[60%].flex-none
 *                 │   └ 标题 —— Codex 逐字符包 span(为输入高亮;实测无查询时全部 class="")
 *                 └ div.ms-auto.flex.min-w-0.items-center.gap-2
 *                     └ span.min-w-0.flex-1.truncate.text-sm.text-token-description-foreground
 *
 * 键盘导航不在这一层:激活检测与按键拦截在 RichTextInput 的 autocomplete 插件,
 * 这里只负责渲染 + 上报选中。aria-selected 与 data-list-navigation-item 是
 * Codex list-navigation 的钩子,照抄。
 */
export interface ComposerMenuItem {
  id: string
  title: string
  /** 右侧描述(Codex 的 ms-auto 槽);没有则不渲染该槽 */
  description?: string
  icon?: React.ReactNode
}

/** 分区(加号菜单的 Add/Plugins/Files;slash/@ 菜单无分区) */
export interface ComposerMenuSection {
  heading: string
  items: ComposerMenuItem[]
  /** 无条目时的占位文案(Codex:"Type to search for files") */
  emptyText?: string
}

/** 单个菜单项(Codex `data-list-navigation-item`;slash 与加号菜单的内骨架不同,按实测分开) */
function MenuItemButton({
  item,
  selected,
  layout,
  onSelect,
  onHoverItem
}: {
  item: ComposerMenuItem
  selected: boolean
  /** slash/@ 用 'slash'(max-w-[60%] + ms-auto),加号菜单用 'plus'(shrink-0 + flex-1) */
  layout: 'slash' | 'plus'
  onSelect(id: string): void
  onHoverItem(id: string): void
}): React.JSX.Element {
  const title = [...item.title].map((char, index) => (
    <span key={index} className="">
      {char}
    </span>
  ))
  return (
    <button
      type="button"
      data-list-navigation-item="true"
      aria-selected={selected}
      onMouseDown={(e) => {
        // mousedown 先于 blur:保持焦点在输入框,菜单不因失焦关闭
        e.preventDefault()
        onSelect(item.id)
      }}
      onMouseEnter={() => onHoverItem(item.id)}
      className={cx(
        'text-token-foreground outline-hidden focus:bg-token-list-hover-background cursor-interaction w-full shrink-0 overflow-hidden rounded-lg px-row-x py-row-y text-start text-sm',
        selected ? 'bg-token-list-hover-background opacity-100' : 'opacity-75'
      )}
    >
      {layout === 'slash' ? (
        <div className="flex w-full items-center gap-2">
          {item.icon}
          <div className="min-w-0 flex-1">
            <div className="flex w-full min-w-0 items-center gap-2">
              <div className="truncate max-w-[60%] flex-none">{title}</div>
              {item.description != null && (
                <div className="ms-auto flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-token-description-foreground">
                    {item.description}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex w-full min-w-0 items-center gap-2">
          {item.icon}
          {item.description != null ? (
            <>
              <span className="min-w-0 truncate shrink-0">{title}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-token-description-foreground">
                {item.description}
              </span>
            </>
          ) : (
            <span className="min-w-0 truncate">{title}</span>
          )}
        </div>
      )}
    </button>
  )
}

export function ComposerTopMenuShell({
  items,
  sections,
  activeId,
  onSelect,
  onHoverItem,
  marginBottom = 'mb-2'
}: {
  /** 平铺项(slash/@ 菜单);与 sections 二选一 */
  items?: ComposerMenuItem[]
  /** 分区项(加号菜单:Add/Plugins/Files,吸顶标题) */
  sections?: ComposerMenuSection[]
  /** 键盘导航的当前项(aria-selected) */
  activeId: string | null
  onSelect(id: string): void
  onHoverItem(id: string): void
  /** Codex 实测:slash/@ 是 mb-2,加号菜单是 mb-1 */
  marginBottom?: 'mb-1' | 'mb-2'
}): React.JSX.Element {
  return (
    <div
      data-composer-overlay-floating-ui="true"
      className={cx(
        'codex-ComposerTopMenuShell absolute left-0 right-0 bottom-full z-50',
        marginBottom
      )}
    >
      <div className="border-token-border bg-token-dropdown-background/90 relative flex w-full flex-col overflow-hidden rounded-2xl border text-sm backdrop-blur-sm p-1 max-h-[320px]">
        <div className="vertical-scroll-fade-mask flex w-full flex-1 flex-col overflow-y-auto">
          <div>
            {sections != null
              ? sections.map((section) => (
                  <div key={section.heading}>
                    <div className="text-token-description-foreground sticky top-0 z-10 px-row-x py-1 text-sm bg-token-dropdown-background/95 backdrop-blur-sm">
                      {section.heading}
                    </div>
                    {section.items.map((item) => (
                      <MenuItemButton
                        key={item.id}
                        item={item}
                        selected={item.id === activeId}
                        layout="plus"
                        onSelect={onSelect}
                        onHoverItem={onHoverItem}
                      />
                    ))}
                    {section.emptyText != null && section.items.length === 0 && (
                      <div className="px-row-x py-row-y text-sm text-token-input-placeholder-foreground">
                        {section.emptyText}
                      </div>
                    )}
                  </div>
                ))
              : (items ?? []).map((item) => (
                  <MenuItemButton
                    key={item.id}
                    item={item}
                    selected={item.id === activeId}
                    layout="slash"
                    onSelect={onSelect}
                    onHoverItem={onHoverItem}
                  />
                ))}
          </div>
        </div>
      </div>
    </div>
  )
}
