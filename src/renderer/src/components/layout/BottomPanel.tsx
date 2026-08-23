import { useEffect, useState, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useTransform, useReducedMotion } from 'framer-motion'
import { ResizeHandle } from './ResizeHandle'
import { usePanelResize } from '../../utils/usePanelResize'
import { useAppShell, useAppShellSlot } from '../../state/AppShellContext'
import { BottomPanelTabs } from '../panel/BottomPanelTabs'

/**
 * 底部面板外壳 —— 逐层复刻 Codex `YPr`(app-initial:216632)。
 *
 *   motion.div[data-app-shell-focus-area="bottom-panel"]
 *     .relative.z-30.min-h-0.w-full.shrink-0.overflow-visible
 *     style: opacity + height(动画值,同 UPr 语义:height = clamp01(progress) * 全高)
 *   ├ ResizeHandle(edge='top',defaultSize 280)
 *   └ div.absolute.inset-0.min-h-0.overflow-hidden
 *     └ div.absolute.inset-x-0.top-0.min-h-0.border-t.border-token-border-default
 *         .bg-token-main-surface-primary  style: height 钉住全高
 *       └ div.h-full.min-h-0.overflow-hidden.[contain:layout_paint]
 *         └ children + (activeTab == null ? outlet : BottomPanelTabs)   ← Codex `NYr`
 *
 * 与右面板同一套开合动画(UPr / WE 弹簧);常驻挂载,关闭动画播完才返回 null。
 */
export function BottomPanel({
  isOpen,
  height,
  onResize,
  onResizeEnd,
  children
}: {
  isOpen: boolean
  height: number
  onResize(desired: number): void
  /** 收手时回传最后一次目标高度 */
  onResizeEnd?(finalHeight: number): void
  children?: ReactNode
}): React.JSX.Element | null {
  const { bottomPanelController } = useAppShell()
  const outlet = useAppShellSlot('bottomPanelOutlet')
  const resize = usePanelResize({ edge: 'top', size: height, onResize, onResizeEnd })

  const reducedMotion = useReducedMotion() === true
  const progress = useMotionValue(isOpen ? 1 : 0)
  const animatedHeight = useTransform(progress, (p) => Math.max(0, Math.min(1, p)) * height)
  // 与右面板同一套 UPr 语义(见 RightPanel)
  const [, forceRender] = useState(0)
  useEffect(() => {
    const controls = reducedMotion
      ? null
      : animate(progress, isOpen ? 1 : 0, { type: 'spring', duration: 0.5, bounce: 0.1 })
    if (reducedMotion) progress.set(isOpen ? 1 : 0)
    const stop = progress.on('animationComplete', () => forceRender((x) => x + 1))
    const stopChange = progress.on('change', (v) => {
      if (!isOpen && v <= 0) forceRender((x) => x + 1)
    })
    return () => {
      controls?.stop()
      stop()
      stopChange()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- progress 是稳定的 motion value
  }, [isOpen, reducedMotion])

  const isMounted = isOpen || progress.get() > 0
  if (!isMounted) return null

  return (
    <motion.div
      data-app-shell-focus-area="bottom-panel"
      className="relative z-30 min-h-0 w-full shrink-0 overflow-visible"
      style={{ opacity: progress, height: animatedHeight }}
      transition={{ type: 'spring', duration: 0.5, bounce: 0.1 }}
    >
      <ResizeHandle
        edge="top"
        ariaLabel="Resize bottom panel"
        currentSize={height}
        minimumSize={160}
        isResizing={resize.isResizing}
        onPointerDown={resize.onPointerDown}
      />
      <div className="absolute inset-0 min-h-0 overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 min-h-0 border-t border-token-border-default bg-token-main-surface-primary"
          style={{ height }}
        >
          <div className="h-full min-h-0 overflow-hidden [contain:layout_paint]">
            {/* Codex `NYr`:有 activeTab 直接渲染 BottomPanelTabs(ewr),无则走 outlet 槽(yUn) */}
            {children}
            {bottomPanelController.activeTab == null ? outlet : <BottomPanelTabs />}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
