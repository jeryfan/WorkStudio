import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../../../utils/cx'

/** Codex 子菜单容器类(role=menu,与根菜单同一套菜单原语,逐字取自实测 DOM) */
export const SUBMENU_CLASS =
  'z-50 flex min-w-[180px] select-none flex-col overflow-y-auto m-px px-1 py-1 bg-token-dropdown-background/90 text-token-foreground ring-token-border rounded-xl ring-[0.5px] shadow-xl-spread backdrop-blur-sm'

/**
 * 菜单的右侧子菜单 —— 对齐 Codex（Radix `DropdownMenuSub`，实测
 * `data-side="right" data-align="start"`，popper wrapper 是
 * `position:fixed; z-index:50; transform: translate(x, y)`）。
 *
 * **必须做碰撞处理。** 之前这里只写了 `left = 父菜单.right; top = 父菜单.top`，
 * 没有翻边也没有夹紧：composer 在窗口右下角，父菜单右缘离视口右边只剩不到
 * 100px，280px 宽的模型子菜单直接甩出屏幕 184px —— 这就是"弹出的选择被挡住"。
 * Radix 是靠 `--radix-popper-available-width` 与 collision detection 自动翻到
 * 左侧的，形态上等价于下面这两条：
 *
 *   - 右侧放不下 → 翻到父菜单**左**侧（side 从 right 变 left）
 *   - 纵向超出 → 夹紧在视口内（Radix 的 shift middleware 同义）
 *
 * 边距 8px 与 Popover 用的是同一个值（Codex 的 max-height/max-width 也是
 * `calc(100vh - 16px)` / `calc(100vw - 16px)`，即上下左右各 8px）。
 */
export function Submenu({
  anchor,
  className,
  children,
  onPointerEnter,
  onPointerLeave
}: {
  /** 父菜单的 getBoundingClientRect()：子菜单贴它的右缘、顶边对齐 */
  anchor: DOMRect
  className?: string
  children: ReactNode
  onPointerEnter?(): void
  onPointerLeave?(): void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const margin = 8
    let left = anchor.right
    // 右侧放不下就翻到左侧（Radix 的 flip）；两侧都放不下时夹在视口里
    if (left + width > window.innerWidth - margin) left = anchor.left - width
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
    // 顶边与父菜单对齐，纵向溢出时夹紧（Radix 的 shift）
    const top = Math.max(margin, Math.min(anchor.top, window.innerHeight - height - margin))
    setPos({ left, top })
  }, [anchor])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-orientation="vertical"
      data-state="open"
      tabIndex={-1}
      className={cx(SUBMENU_CLASS, 'fixed', className)}
      style={{
        left: pos?.left ?? anchor.right,
        top: pos?.top ?? anchor.top,
        // 与 Popover 同理：测量完成前隐藏，避免在错位置闪一帧
        visibility: pos ? 'visible' : 'hidden'
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </div>,
    document.body
  )
}
