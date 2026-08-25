import { useEffect, type ReactNode } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'
import { ResizeHandle } from '../layout/ResizeHandle'
import { usePanelResize } from '../../utils/usePanelResize'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH
} from '../../state/AppShellContext'

/**
 * 左栏的**几何外壳** —— 对齐 Codex 的 `yJr`（app shell 的 left panel 组件）。
 *
 * Codex 那个组件只有三层，一层不多：
 *
 *   motion.aside.app-shell-left-panel.pointer-events-auto.relative.flex
 *              .overflow-visible.browser:bg-token-main-surface-primary
 *              style: { width: <animated>, paddingTop }
 *   ├ motion.div.max-w-full.overflow-hidden
 *   │        style: { minWidth, width, opacity }        ← 插槽内容挂在这里
 *   └ ResizeHandle
 *
 * **`max-w-full.overflow-hidden` 这一层就是切分线**：它以上属于外壳，它的
 * children 属于"这条路由的左栏内容"。聊天侧栏那一大套（`[contain:layout_paint]`
 * 层、行内 token 层、`nav.codex-Navigation`、浮层 footer）全部在线下，是内容而
 * 不是外壳 —— 所以设置路由换掉的正是这些，宽度、折叠动画、拖拽手柄一律共用。
 *
 * 把宽度动画与拖拽放在外壳里也是 Codex 的分工：aside 的 width 由 MotionValue
 * 驱动，拖拽中直写 DOM 不过 React；收手才提交一次 state。
 */
export function LeftPanelFrame({
  width,
  onResize,
  children
}: {
  /** 当前宽度(px),0 = 折叠。Codex 用宽度表达折叠,没有单独的 collapsed 标志 */
  width: number
  onResize(desired: number): void
  children: ReactNode
}): React.JSX.Element {
  const widthMV = useMotionValue(width)
  const animatedWidth = useSpring(widthMV, { stiffness: 420, damping: 45 })
  // 非拖拽来源(开关、窗口变化)同步进 MotionValue,spring 顺带播开/关动画
  useEffect(() => {
    widthMV.set(width)
  }, [width, widthMV])
  const resize = usePanelResize({
    edge: 'right',
    size: width,
    onResize: (desired) => widthMV.set(Math.min(Math.max(desired, 0), SIDEBAR_MAX_WIDTH)),
    onResizeEnd: (final) => onResize(final < SIDEBAR_MIN_WIDTH ? 0 : final)
  })

  return (
    <motion.aside
      /*
       * 类名与 Codex 完全一致 —— 没有 h-full / w-full / flex-col。
       * 高度靠主行的 align-items:stretch;宽度走 MotionValue(Codex 也是
       * 内联 style,且由 motion 驱动)。
       * 折叠态 width:0 + overflow 由子层的 max-w-full.overflow-hidden 裁掉。
       */
      className="app-shell-left-panel pointer-events-auto relative flex overflow-visible browser:bg-token-main-surface-primary"
      style={{ paddingTop: 'var(--height-toolbar)', width: animatedWidth }}
    >
      {/* Codex 在这层写内联 min-width/width/opacity —— 折叠动画期间靠它裁剪,
          min-width 和 width 同值是为了不让内容把它挤宽 */}
      <div
        className="max-w-full overflow-hidden"
        style={{ minWidth: `${width}px`, width: `${width}px`, opacity: 1 }}
      >
        {children}
      </div>
      {/* Codex 的手柄是 aside 的最后一个子元素,不是外部分隔条。
          edge='right' = 贴右缘;拖拽状态由 usePanelResize 持有再回传。 */}
      <ResizeHandle
        edge="right"
        ariaLabel="Resize sidebar"
        currentSize={width}
        minimumSize={SIDEBAR_MIN_WIDTH}
        maximumSize={SIDEBAR_MAX_WIDTH}
        isResizing={resize.isResizing}
        onPointerDown={resize.onPointerDown}
        onClick={(e) => {
          // Codex Tkr:双击手柄复位到 defaultSize
          if (e.detail === 2) onResize(SIDEBAR_DEFAULT_WIDTH)
        }}
      />
    </motion.aside>
  )
}
