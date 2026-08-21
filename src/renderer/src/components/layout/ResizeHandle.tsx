import { useCallback, useRef } from 'react'

/**
 * 拖拽手柄 —— 复刻 Codex 的实测形态,两种放置共用一套配方。
 *
 * Codex 的手柄**不是独立的分隔条元素**,而是 absolute 贴在被调整面板自己身上:
 *
 *   侧栏(贴右缘,向外伸一半):
 *     group absolute flex touch-none select-none focus:outline-none
 *     z-20 -top-toolbar right-0 bottom-0 w-4 translate-x-2 cursor-col-resize active:cursor-col-resize
 *   右面板(贴左缘,向外伸一半):
 *     … z-40 top-0 bottom-0 left-0 w-4 -translate-x-2 …
 *
 * 里面只有一条线,**默认完全透明**,hover/active/focus 才淡入:
 *   sidebar-resize-handle-line pointer-events-none m-auto opacity-0 h-full w-px
 *   bg-gradient-to-b from-transparent via-token-foreground/25 to-transparent
 *   group-hover:opacity-100 group-active:opacity-100 group-focus-visible:opacity-100
 *
 * 三个容易做错的点:
 *
 * 1. **热区 16px**(w-4)+ translate 半个身位,所以命中区跨在边界两侧各 8px。
 *    之前用 react-resizable-panels 的 10px 兄弟分隔条,热区窄且位置偏。
 * 2. **没有常驻可见的线**。Codex 的边界感来自两侧背景色差 +
 *    MainContentSurface 的 box-shadow hairline,不是一条 border。
 *    之前那条常驻 `bg-token-border` 是多出来的。
 * 3. 侧栏手柄用 `-top-toolbar` 向上伸进工具栏区(top = -46px),
 *    这样紧贴窗口顶边也能拖 —— 少了它,顶部 46px 是拖不动的死区。
 *
 * `sidebar-resize-handle-line` 在 Codex 侧**没有任何 CSS 规则**(grep 编译产物为空),
 * 是个纯标记类;视觉全部来自同元素上的 Tailwind utility。保留它是为了和 Codex
 * 的 DOM 对得上,也方便按这个类名定位。
 */
export type ResizeHandlePlacement = 'sidebar-end' | 'panel-start'

interface ResizeHandleProps {
  placement: ResizeHandlePlacement
  /** 当前尺寸(px),拖拽以它为基准 */
  size: number
  /** 拖拽中回调:传入指针相对起点的位移量换算出的目标尺寸 */
  onResize(next: number): void
  onResizeEnd?(): void
  ariaLabel?: string
}

const PLACEMENT: Record<ResizeHandlePlacement, string> = {
  'sidebar-end': 'z-20 -top-toolbar right-0 bottom-0 w-4 translate-x-2',
  'panel-start': 'z-40 top-0 bottom-0 left-0 w-4 -translate-x-2'
}

export function ResizeHandle({
  placement,
  size,
  onResize,
  onResizeEnd,
  ariaLabel
}: ResizeHandleProps): React.JSX.Element {
  const drag = useRef<{ startX: number; startSize: number } | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      // 只响应主键,并且必须 setPointerCapture —— 否则指针移出手柄(16px 很窄)
      // 就丢事件,拖拽会在快速移动时断掉。
      if (e.button !== 0) return
      e.preventDefault()
      drag.current = { startX: e.clientX, startSize: size }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [size]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      const d = drag.current
      if (!d) return
      // sidebar-end:指针右移 = 变宽;panel-start:指针右移 = 变窄
      const delta = placement === 'sidebar-end' ? e.clientX - d.startX : d.startX - e.clientX
      onResize(d.startSize + delta)
    },
    [onResize, placement]
  )

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      if (!drag.current) return
      drag.current = null
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId)
      onResizeEnd?.()
    },
    [onResizeEnd]
  )

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`group absolute flex touch-none select-none focus:outline-none cursor-col-resize active:cursor-col-resize ${PLACEMENT[placement]}`}
    >
      <div className="sidebar-resize-handle-line pointer-events-none m-auto opacity-0 h-full w-px bg-gradient-to-b from-transparent via-token-foreground/25 to-transparent group-hover:opacity-100 group-active:opacity-100 group-focus-visible:opacity-100" />
    </div>
  )
}
