import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface PopoverProps {
  /** 触发元素的 getBoundingClientRect()，弹层默认显示在其上方 */
  anchor: DOMRect
  /** 水平对齐方式：与触发元素左对齐 / 居中 / 右对齐（chat.html place() 的三种 align） */
  align?: 'start' | 'center' | 'end'
  width?: number
  height?: number
  onClose(): void
  ariaLabel?: string
  /** Codex:菜单列表(role=menu:模型/权限)与对话框(role=dialog:项目选择)两种 */
  role?: 'menu' | 'dialog'
  children: ReactNode
}

/**
 * Composer 弹层基础设施（chat.html 的 .pop + place()/closeAll() 逻辑）：
 * fixed 定位于触发元素上方 6px，水平按 align 对齐并夹紧在视口内；
 * 上方放不下时才落到触发元素下方。点击遮罩 / Escape 关闭。
 *
 * 必须 portal 到 body：Composer 外层带 `-translate-x-1/2`，而任何非 none 的
 * transform 都会成为其 fixed 后代的包含块。留在原地的话，这里按视口坐标算出的
 * left/top 会被套用到 Composer 那个 738px 的盒子上，弹层直接偏出屏幕，
 * 随后输入框获得焦点又会让浏览器滚动祖先容器去追它，表现为整个页面被顶上去。
 */
export function Popover({
  anchor,
  align = 'start',
  width,
  height,
  onClose,
  ariaLabel,
  role = 'dialog',
  children
}: PopoverProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let left: number
    if (align === 'end') left = anchor.right - rect.width
    else if (align === 'center') left = anchor.left + anchor.width / 2 - rect.width / 2
    else left = anchor.left
    left = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8))
    let top = anchor.top - rect.height - 6
    if (top < 8) {
      // 上方空间不足：改放触发元素下方，仍夹紧在视口内
      top = Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - rect.height - 8))
    }
    setPos({ left, top })
  }, [anchor, align])

  // 定位完成后再交首焦点：弹层首帧是 visibility:hidden（等测量），而隐藏元素
  // 不可聚焦，子组件自己在 effect 里 focus 会静默失败。preventScroll 是必须的，
  // 默认聚焦行为会滚动祖先容器去"追"输入框。
  useEffect(() => {
    if (!pos) return
    const input = ref.current?.querySelector('input')
    input?.focus({ preventScroll: true })
  }, [pos])

  // Escape 关闭（捕获阶段拦截，避免与全局浮层快捷键重复处理）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return createPortal(
    <>
      <div className="fixed inset-0 z-[49]" onMouseDown={onClose} />
      <div
        ref={ref}
        role={role}
        aria-label={ariaLabel}
        data-state="open"
        className="fixed no-drag z-50 m-px flex select-none flex-col overflow-y-auto px-1 py-1 bg-token-dropdown-background/90 text-token-foreground ring-token-border rounded-xl ring-[0.5px] shadow-xl-spread backdrop-blur-sm"
        style={{
          left: pos?.left ?? anchor.left,
          top: pos?.top ?? anchor.top,
          width,
          height,
          /*
           * Codex 的菜单内容带
           *   max-width:  min(available-width,  calc(100vw - 16px))
           *   max-height: min(available-height, calc(100vh - 16px))
           * （Radix 的 --radix-*-available-* 变量）。不设 width 的菜单（权限档）
           * 靠它把最长那行描述夹在视口内，否则内容一长就顶出屏幕。
           */
          maxWidth: 'calc(100vw - 16px)',
          maxHeight: 'calc(100vh - 16px)',
          // 布局测量完成前隐藏，避免在 (0,0) 闪一帧
          visibility: pos ? 'visible' : 'hidden'
        }}
      >
        {children}
      </div>
    </>,
    document.body
  )
}
