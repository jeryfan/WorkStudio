import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ResizeHandle } from './ResizeHandle'
import { usePanelResize } from '../../utils/usePanelResize'
import { useAppShell, useAppShellSlot } from '../../state/AppShellContext'
import { RightPanelTabs } from '../panel/RightPanelTabs'

/**
 * 右侧面板外壳 —— 逐层复刻 Codex `EJr`(app-initial:226772)。
 *
 * **常驻挂载**:Codex 的 EJr 由 shell 无条件渲染(keyed `right-panel:${threadId}`),
 * 面板关闭时不卸载整个组件,而是内部 `!isMounted && !isVisible ? null` ——
 * 关闭动画播完才真正返回 null。所以本组件必须**始终被渲染**,开关状态从 AppShell
 * store 读(`rightPanelMounted`),不走 prop —— Codex 的 EJr 同样是读全局状态。
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
  width,
  onResize,
  onResizeEnd,
  children
}: {
  width: number
  onResize(desired: number): void
  /** 收手时回传最后一次目标宽度(Codex Tkr onResizeEnd(e)) */
  onResizeEnd?(finalWidth: number): void
  children?: ReactNode
}): React.JSX.Element | null {
  /*
   * progress / animatedWidth / isMounted 三件都在 AppShell store 里
   * (Codex 的 progress 是全局 motion value `hWn`,animatedWidth 由 `kJr` 算)——
   * header 的右槽要读同一份 `rightPanelAnimatedWidth` 给标题让位,
   * 组件私有一份的话面板展开时标题不会跟着收。
   */
  const {
    rightPanelController,
    rightPanelWidthMode,
    rightPanelProgress,
    rightPanelAnimatedWidth,
    rightPanelMounted
  } = useAppShell()
  const outlet = useAppShellSlot('rightPanelOutlet')
  const isFullWidth = rightPanelWidthMode === 'full'
  const resize = usePanelResize({ edge: 'left', size: width, onResize, onResizeEnd })

  if (!rightPanelMounted) return null

  const activeTab = rightPanelController.activeTab

  return (
    <motion.aside
      data-app-shell-focus-area="right-panel"
      className="relative z-[41] h-full min-h-0 min-w-0 shrink-0 overflow-visible ltr:ms-auto rtl:me-auto"
      style={{ opacity: rightPanelProgress, width: rightPanelAnimatedWidth }}
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
