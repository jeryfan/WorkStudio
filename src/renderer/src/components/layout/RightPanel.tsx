import { useEffect, useState, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useTransform, useReducedMotion } from 'framer-motion'
import { ResizeHandle } from './ResizeHandle'
import { usePanelResize } from '../../utils/usePanelResize'
import { useAppShell, useAppShellSlot } from '../../state/AppShellContext'
import { RightPanelTabs } from '../panel/RightPanelTabs'

/**
 * 右侧面板外壳 —— 逐层复刻 Codex `EJr`(app-initial:226772)。
 *
 * **常驻挂载**:Codex 的 EJr 由 shell 无条件渲染(keyed `right-panel:${threadId}`),
 * 面板关闭时不卸载整个组件,而是内部 `!isMounted && !isVisible ? null` ——
 * 关闭动画播完才真正返回 null。所以本组件必须**始终被渲染**,开关走 isOpen prop。
 *
 * 开合动画(`UPr` + `WE`):一个 0..1 的 progress motion value,开=animate 到 1、
 * 关=到 0,弹簧 `{type:'spring', duration:0.5, bounce:0.1}`(WE,170205);
 * aside 的 `opacity = progress`、`width = clamp01(progress) * 全宽`(WPr)——
 * 面板是**从 0 宽展开**的,不只是淡入。isMounted = isVisible || progress > 0,
 * 动画 completion 后再评估一次(UPr 里 listen 'animationComplete' 强制重渲染)。
 * reduced-motion(`Ym`)时 progress 直接 set,不播弹簧(rWn 的 n 分支)。
 *
 * 内容选择(EJr 的 `children: [e, c == null ? l : uDr]`):
 * 有 activeTab → RightPanelTabs(uDr);无 → outlet 槽(dUn,thread chrome 注册的
 * 也是 RightPanelTabs —— 分开走是为了 DetailPanel 能覆写 outlet,SXr/CXr)。
 *
 * 拖拽:手柄在 aside 左缘(ResizeHandle edge='left');拖拽中宽度 1:1 跟手
 * (progress 恒 1,width prop 直传),不进弹簧。Codex 还有「拖拽中保持挂载」的
 * m 状态(onResizingChange),WS 由动画生命周期覆盖,不单列。
 *
 * full-width 模式(widthMode === 'full'):**投影、手柄、border-l 全部撤掉**。
 */
export function RightPanel({
  isOpen,
  width,
  onResize,
  onResizeEnd,
  children
}: {
  isOpen: boolean
  width: number
  onResize(desired: number): void
  /** 收手时回传最后一次目标宽度(Codex Tkr onResizeEnd(e)) */
  onResizeEnd?(finalWidth: number): void
  children?: ReactNode
}): React.JSX.Element | null {
  const { rightPanelController, rightPanelWidthMode } = useAppShell()
  const outlet = useAppShellSlot('rightPanelOutlet')
  const isFullWidth = rightPanelWidthMode === 'full'
  const resize = usePanelResize({ edge: 'left', size: width, onResize, onResizeEnd })

  const reducedMotion = useReducedMotion() === true
  /** Codex `hWn` —— 开合动画的 0..1 motion value */
  const progress = useMotionValue(isOpen ? 1 : 0)
  const animatedWidth = useTransform(progress, (p) => Math.max(0, Math.min(1, p)) * width)
  /*
   * Codex `UPr` 的 isMounted 语义:isVisible || progress.get() > 0 —— **渲染期**计算,
   * 动画播完(progress 收到 0)时强制重渲染一次让它归零卸载(UPr 里就是
   * listen('animationComplete') 后 setState 强制重渲染)。
   */
  const [, forceRender] = useState(0)
  useEffect(() => {
    const controls = reducedMotion
      ? null
      : animate(progress, isOpen ? 1 : 0, { type: 'spring', duration: 0.5, bounce: 0.1 })
    if (reducedMotion) progress.set(isOpen ? 1 : 0)
    const stop = progress.on('animationComplete', () => forceRender((x) => x + 1))
    // reduced-motion 下 set() 不触发 animationComplete,用 change 兑底
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

  const activeTab = rightPanelController.activeTab

  return (
    <motion.aside
      data-app-shell-focus-area="right-panel"
      className="relative z-[41] h-full min-h-0 min-w-0 shrink-0 overflow-visible ltr:ms-auto rtl:me-auto"
      style={{ opacity: progress, width: animatedWidth }}
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
        {/* 内层锁死全宽:宽度动画时内容不跟着一帧一帧重排 */}
        <div
          className={`absolute top-0 bottom-0 left-0 min-w-0 bg-token-main-surface-primary${
            isFullWidth ? '' : ' border-l border-token-border-default'
          }`}
          style={{ minWidth: width, width }}
        >
          <div className="h-full min-h-0 min-w-0 overflow-hidden [contain:layout_paint] [--thread-content-top-inset:calc(var(--spacing)*8)]">
            {children}
            {activeTab == null ? outlet : <RightPanelTabs />}
          </div>
        </div>
      </div>
    </motion.aside>
  )
}
