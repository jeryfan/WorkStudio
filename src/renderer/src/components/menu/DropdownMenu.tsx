import { useLayoutEffect, useRef, useState } from 'react'
import { SubmenuChevronIcon } from '../icons'
import { isSeparator, type MenuEntry } from './types'

interface DropdownMenuProps {
  entries: MenuEntry[]
  /** 触发元素 rect，菜单显示在其下方左对齐 */
  anchor: DOMRect
  minWidth?: number
  width?: number
  onClose(): void
  onSelect?(id: string): void
}

/**
 * sider/2.html .dropdown-menu（第 865-964 行）：
 * 毛玻璃白底、15px 圆角、双边框阴影；菜单项 12.5px 圆角，hover 灰底。
 * fixed 定位于触发元素下方，自动防止超出右/下边缘。
 */
export function DropdownMenu({
  entries,
  anchor,
  minWidth = 160,
  width,
  onClose,
  onSelect
}: DropdownMenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 4 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let { left, top } = pos
    if (left + rect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - rect.width - 8)
    }
    if (top + rect.height > window.innerHeight - 8) {
      top = Math.max(8, anchor.top - rect.height - 4)
    }
    if (left !== pos.left || top !== pos.top) setPos({ left, top })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div className="fixed inset-0 z-[49]" onMouseDown={onClose} />
      <div
        ref={ref}
        role="menu"
        aria-orientation="vertical"
        /*
         * 对齐 Codex 实测(profile 菜单): 卡片 324×103, 圆角 15px,
         * bg 白色 90% 透明 + backdrop-blur(8px), **无 border** —— 边缘由
         * box-shadow 的 0.5px ring 给出。之前叠了 border-[0.5px] 又叠 ring,
         * 边缘比 Codex 重一层。
         */
        className="fixed z-50 flex select-none flex-col overflow-y-auto rounded-[15px] bg-token-dropdown-background/90 p-1 text-token-foreground shadow-[0_0_0_0.5px_rgb(26_28_31/0.08),0_8px_16px_-4px_rgb(0_0_0/0.12)] outline-none backdrop-blur-[8px]"
        /*
         * 不能钳 maxWidth。原来写死 240,把 menuDefs 里声明的 width 283 直接压掉,
         * 声明值形同无效 —— Codex 的 profile 菜单是 324 宽。
         */
        style={{ left: pos.left, top: pos.top, minWidth, width }}
      >
        {entries.map((entry, i) =>
          isSeparator(entry) ? (
            <div
              key={`sep-${i}`}
              className={entry.separator === 'thin' ? 'w-full px-2 py-1' : 'w-full px-2 pb-2 pt-1'}
            >
              <div className="h-px w-full bg-token-menu-border" />
            </div>
          ) : (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              disabled={entry.disabled}
              onClick={() => {
                onSelect?.(entry.id)
                onClose()
              }}
              className={`group/mi flex w-full flex-col rounded-[12.5px] px-2 py-[5px] text-left text-[13px] leading-[18.57px] text-token-foreground ${
                entry.disabled ? 'cursor-default opacity-50' : 'hover:bg-token-list-hover-background'
              }`}
            >
              <span className="flex w-full items-center gap-1.5">
                {entry.icon && (
                  <entry.icon className="size-4 shrink-0 opacity-75 group-hover/mi:opacity-100" />
                )}
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                {entry.shortcut && (
                  <span className="ml-2 shrink-0 text-xs text-token-description-foreground">{entry.shortcut}</span>
                )}
                {entry.submenu && (
                  <SubmenuChevronIcon className="size-4 shrink-0 text-token-description-foreground opacity-75" />
                )}
              </span>
            </button>
          )
        )}
      </div>
    </>
  )
}
