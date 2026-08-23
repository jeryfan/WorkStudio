import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ResizeHandle } from './ResizeHandle'
import { usePanelResize } from '../../utils/usePanelResize'
import { usePanels } from '../../state/PanelContext'

/**
 * 右侧面板外壳 —— 逐层复刻 Codex 实测形态(bundle `EJr`,app-initial:226772)。
 *
 * 四个细节都是实测出来的,别按直觉改:
 *
 * 1. **左缘是投影不是边框**:`div.w-px.shadow-[-8px_0_16px_-8px_rgb(0_0_0/0.18)]`
 *    单独一个 1px 元素扛投影;真正的 `border-l` 在最内层那个 div 上。两者都有。
 * 2. **内层用 absolute + 同值 min-width/width**。宽度动画时外层 aside 的 width 在变,
 *    内层锁死自己的宽度,内容才不会跟着一帧一帧重排。
 * 3. `ltr:ms-auto` 把面板推到行尾 —— 主区 MainContentViewport 是 flex-1,
 *    但面板折叠时(不渲染)不留空隙,靠 auto margin 而不是 justify-end。
 * 4. `z-[41]` / 手柄 `z-40` / 投影 `z-30` 三层次序固定,手柄必须压在投影之上
 *    才能接到指针。
 *
 * full-width 模式(Codex `widthMode === 'full'`,Expand panel 后):
 * **投影、手柄、border-l 全部撤掉**(`!_ &&` 三个条件渲染),宽度 = 主区全宽。
 *
 * 动画:Codex 用 framer-motion 的 motion value 驱动 aside 的 opacity/width
 * (`UPr({animation, size, isVisible})`,spring 0.5s/bounce 0.1)。这里用
 * motion.aside + animate 属性等价表达;拖拽中的宽度由父级 state 直传,
 * 不经过 spring(拖拽要 1:1 跟手)。
 */
export function RightPanel({
  width,
  onResize,
  onResizeEnd,
  children
}: {
  width: number
  onResize(desired: number): void
  onResizeEnd?(): void
  children: ReactNode
}): React.JSX.Element {
  const { rightPanelWidthMode } = usePanels()
  const isFullWidth = rightPanelWidthMode === 'full'
  const resize = usePanelResize({ edge: 'left', size: width, onResize, onResizeEnd })

  return (
    <motion.aside
      data-app-shell-focus-area="right-panel"
      className="relative z-[41] h-full min-h-0 min-w-0 shrink-0 overflow-visible ltr:ms-auto rtl:me-auto"
      style={{ width }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', duration: 0.5, bounce: 0.1 }}
    >
      {!isFullWidth && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-30 w-px shadow-[-8px_0_16px_-8px_rgb(0_0_0/0.18)]"
        />
      )}
      {!isFullWidth && (
        <ResizeHandle
          edge="left"
          ariaLabel="Resize side panel"
          currentSize={width}
          minimumSize={320}
          isResizing={resize.isResizing}
          onPointerDown={resize.onPointerDown}
        />
      )}
      <div className="absolute inset-0 min-h-0 min-w-0 overflow-hidden">
        <motion.div
          className={`absolute top-0 bottom-0 left-0 min-w-0 bg-token-main-surface-primary${
            isFullWidth ? '' : ' border-l border-token-border-default'
          }`}
          style={{ minWidth: width, width }}
        >
          <div className="h-full min-h-0 min-w-0 overflow-hidden [contain:layout_paint] [--thread-content-top-inset:calc(var(--spacing)*8)]">
            {children}
          </div>
        </motion.div>
      </div>
    </motion.aside>
  )
}
