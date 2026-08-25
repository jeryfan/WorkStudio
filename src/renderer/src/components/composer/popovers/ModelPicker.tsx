import { useRef, useState } from 'react'
import { useSession } from '../../../state/SessionContext'
import { CheckIcon, ChevronIcon } from '../../icons'
import { cx } from '../../../utils/cx'
import { formatEffort } from '../../../services/model/types'
import { Submenu } from './Submenu'

/** Codex 菜单项基类(与运行时逐项一致) */
const MENU_ITEM_CLASS =
  'no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-foreground group hover:bg-token-list-hover-background focus:bg-token-list-hover-background cursor-interaction flex flex-col'

/**
 * 模型/effort 选择 —— Codex 的双子菜单(运行时实测):
 *
 *   根菜单(w-56)
 *   ├ div[role=menuitem][aria-haspopup=menu][aria-label="Model …"]   ← 子菜单触发行
 *   │ └ div.flex.w-full.min-w-0.items-center.gap-3
 *   │   ├ span > span[data-model-picker-model-row] "Model"
 *   │   ├ span.flex.min-w-0.flex-1.justify-end.text-token-text-tertiary > 当前模型名
 *   │   └ [chevron]
 *   └ div[role=menuitem][aria-label="Effort …"]                      ← 同上,值是当前 effort
 *
 *   悬停行 → 右侧子菜单(side=right,与父菜单顶对齐):
 *   ├ div[header] "Model" / "Effort"
 *   └ 单选列表,选中项带 check(effort 项带 data-reasoning-selected="true")
 *
 * 选择结果存入 SessionContext,随 turn/start 下发。Codex 每档选择即关闭;
 * 悬停打开的子菜单在指针离开根菜单 + 子菜单区域后收回。
 */
export function ModelPicker({ onClose }: { onClose(): void }): React.JSX.Element {
  const { models, model, effort, selectModel, selectEffort } = useSession()
  const [submenu, setSubmenu] = useState<'model' | 'effort' | null>(null)
  const [submenuAnchor, setSubmenuAnchor] = useState<DOMRect | null>(null)
  const closeTimer = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const openSubmenu = (kind: 'model' | 'effort', row: HTMLElement): void => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    // 与 Codex 一致:子菜单贴父菜单右缘、顶边对齐(side=right align=start)。
    // 放不下时的翻边与夹紧由 Submenu 自己做 —— 位置必须在**量过子菜单尺寸之后**
    // 才能算，所以这里只把父菜单的矩形交出去。
    const dialog = row.closest('[role=dialog], [role=menu]') ?? rootRef.current
    const rect = dialog?.getBoundingClientRect()
    if (rect) setSubmenuAnchor(rect)
    setSubmenu(kind)
  }

  const scheduleClose = (): void => {
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setSubmenu(null), 120)
  }

  const cancelClose = (): void => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  return (
    <div ref={rootRef} className="contents" onPointerLeave={scheduleClose}>
      {/* Model 行 */}
      <div
        role="menuitem"
        tabIndex={-1}
        aria-haspopup="menu"
        aria-expanded={submenu === 'model'}
        aria-label={`Model ${model?.id ?? ''}`}
        className={cx(MENU_ITEM_CLASS, 'flex w-full items-center')}
        onPointerEnter={(e) => openSubmenu('model', e.currentTarget)}
        onClick={(e) => openSubmenu('model', e.currentTarget)}
      >
        <div className="flex w-full min-w-0 items-center gap-3">
          <span>
            <span data-model-picker-model-row="true">Model</span>
          </span>
          <span className="flex min-w-0 flex-1 justify-end text-token-text-tertiary">
            <span className="min-w-0 truncate">
              <span className="flex min-w-0 items-center gap-1 tabular-nums">
                <span className="truncate whitespace-nowrap">{model?.displayName ?? '…'}</span>
              </span>
            </span>
          </span>
          <ChevronIcon className="icon-xs shrink-0 -rotate-90" />
        </div>
      </div>
      {/* Effort 行 */}
      <div
        role="menuitem"
        tabIndex={-1}
        aria-haspopup="menu"
        aria-expanded={submenu === 'effort'}
        aria-label={`Effort ${effort ?? ''}`}
        className={cx(MENU_ITEM_CLASS, 'flex w-full items-center')}
        onPointerEnter={(e) => openSubmenu('effort', e.currentTarget)}
        onClick={(e) => openSubmenu('effort', e.currentTarget)}
      >
        <div className="flex w-full min-w-0 items-center gap-3">
          <span>Effort</span>
          <span className="flex min-w-0 flex-1 justify-end text-token-text-tertiary">
            <span className="min-w-0 truncate">{effort != null ? formatEffort(effort) : '…'}</span>
          </span>
          <ChevronIcon className="icon-xs shrink-0 -rotate-90" />
        </div>
      </div>

      {submenu != null && submenuAnchor != null && (
        <Submenu
          anchor={submenuAnchor}
          className={submenu === 'model' ? 'w-[280px]' : undefined}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
        >
          <div dir="ltr">
            <div className="text-token-description-foreground flex min-h-6 items-center truncate px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm leading-4">
              {submenu === 'model' ? 'Model' : 'Effort'}
            </div>
            {submenu === 'model' ? (
              <div className="vertical-scroll-fade-mask flex max-h-[250px] flex-col overflow-y-auto">
                {models.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => {
                      selectModel(m.id)
                      onClose()
                    }}
                    className={MENU_ITEM_CLASS}
                  >
                    <div className="flex w-full items-center gap-1.5">
                      <span className="flex-1 min-w-0 truncate">{m.displayName}</span>
                      {m.id === model?.id && <CheckIcon className="size-4 shrink-0" />}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              (model?.efforts ?? []).map((level) => (
                <button
                  key={level}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  data-reasoning-selected={level === effort ? 'true' : undefined}
                  onClick={() => {
                    selectEffort(level)
                    onClose()
                  }}
                  className={MENU_ITEM_CLASS}
                >
                  <div className="flex w-full items-center gap-1.5">
                    <span className="flex-1 min-w-0 truncate">{level}</span>
                    {level === effort && <CheckIcon className="size-4 shrink-0" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </Submenu>
      )}
    </div>
  )
}
