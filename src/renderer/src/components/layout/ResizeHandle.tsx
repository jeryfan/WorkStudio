import { cx } from '../../utils/cx'

/**
 * 拖拽手柄 —— 从 Codex 产物里逆出的**完整组件形态**,props 与类名逐项照抄。
 *
 * 源码位置:`app-initial-Biw83Aiz.js` 里渲染 `sidebar-resize-handle-line` 的那个函数。
 * 它的 props 是:
 *   { ariaLabel, currentSize, edge, isKeyboardResizable, isResizing,
 *     maximumSize, minimumSize, onClick, onKeyDown, onPointerDown }
 *
 * 四个 edge 各自的定位(照抄,不要自创 placement 之类的命名):
 *   right  → z-20  -top-toolbar right-0 bottom-0 w-4 translate-x-2      (侧栏右缘)
 *   left   → z-40  top-0 bottom-0 left-0 w-4 -translate-x-2             (右面板左缘)
 *   top    →       top-0 right-0 left-0 h-4 -translate-y-2
 *   bottom →       right-0 bottom-0 left-0 h-4 translate-y-2            (底部面板上缘)
 *
 * 几个只有读源码才知道的点:
 *
 * 1. **手柄自己不管拖拽状态**。它只往外抛 `onPointerDown`,拖拽过程由父级持有,
 *    再通过 `isResizing` 回传 —— 拖拽中线是 `opacity-100`(常亮),
 *    否则才是 hover/active/focus 才显现。之前我把拖拽逻辑塞在手柄内部,
 *    导致拖拽中线会因为指针移出 16px 热区而闪。
 * 2. **键盘可调整是可选的**(`isKeyboardResizable`)。开启时才有
 *    `tabIndex=0` / `aria-label` / `aria-valuemin|max|now` / `onKeyDown` /
 *    `focus-visible:ring-1 ring-token-focus-border ring-inset`;
 *    关闭时这些**全部是 undefined**,不是给个默认值。
 * 3. `aria-orientation` 由 edge 推导:left/right → vertical,top/bottom → horizontal。
 * 4. 线的渐变方向也跟着 edge 变:纵向 `w-px bg-gradient-to-b`,横向 `h-px bg-gradient-to-r`。
 */
export type ResizeHandleEdge = 'left' | 'right' | 'top' | 'bottom'

interface ResizeHandleProps {
  edge: ResizeHandleEdge
  ariaLabel?: string
  currentSize?: number
  minimumSize?: number
  maximumSize?: number
  isKeyboardResizable?: boolean
  isResizing?: boolean
  onClick?: React.MouseEventHandler<HTMLDivElement>
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>
}

export function ResizeHandle({
  edge,
  ariaLabel,
  currentSize,
  minimumSize,
  maximumSize,
  isKeyboardResizable = false,
  isResizing = false,
  onClick,
  onKeyDown,
  onPointerDown
}: ResizeHandleProps): React.JSX.Element {
  const vertical = edge === 'left' || edge === 'right'

  return (
    <div
      role="separator"
      aria-label={isKeyboardResizable ? ariaLabel : undefined}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuemax={isKeyboardResizable ? maximumSize : undefined}
      aria-valuemin={isKeyboardResizable ? minimumSize : undefined}
      aria-valuenow={isKeyboardResizable ? currentSize : undefined}
      tabIndex={isKeyboardResizable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={isKeyboardResizable ? onKeyDown : undefined}
      onPointerDown={onPointerDown}
      className={cx(
        'group absolute flex touch-none select-none focus:outline-none',
        edge === 'left' ? 'z-40' : 'z-20',
        edge === 'right' && '-top-toolbar right-0 bottom-0 w-4 translate-x-2',
        edge === 'left' && 'top-0 bottom-0 left-0 w-4 -translate-x-2',
        edge === 'top' && 'top-0 right-0 left-0 h-4 -translate-y-2',
        edge === 'bottom' && 'right-0 bottom-0 left-0 h-4 translate-y-2',
        vertical
          ? 'cursor-col-resize active:cursor-col-resize'
          : 'cursor-row-resize active:cursor-row-resize',
        isKeyboardResizable &&
          'focus-visible:ring-1 focus-visible:ring-token-focus-border focus-visible:ring-inset'
      )}
    >
      <div
        className={cx(
          'sidebar-resize-handle-line pointer-events-none m-auto opacity-0',
          vertical
            ? 'h-full w-px bg-gradient-to-b from-transparent via-token-foreground/25 to-transparent'
            : 'h-px w-full bg-gradient-to-r from-transparent via-token-foreground/25 to-transparent',
          isResizing
            ? 'opacity-100'
            : 'group-hover:opacity-100 group-active:opacity-100 group-focus-visible:opacity-100'
        )}
      />
    </div>
  )
}
