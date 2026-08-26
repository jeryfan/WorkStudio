import { useEffect, useState } from 'react'
import {
  animate,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue
} from 'framer-motion'

/**
 * 面板开合动画 —— Codex `UPr`(app-initial,配 spring 常量 `WE`:170205)。
 *
 * Codex 不给面板宽度上 spring,而是给一个 **0..1 的 progress** 上 spring,
 * 再让 `animatedSize = clamp01(progress) * size`：
 *
 *   { isMounted, animatedSize } = UPr({ animation, size, isVisible })
 *
 * 这个区分不是风格问题,它决定拖拽手感:
 * - 开/关时 progress 走弹簧,宽度从 0 弹到目标值(视觉上和「宽度上弹簧」一样);
 * - **拖拽中 progress 恒为 1,宽度 1:1 跟手**。若把弹簧挂在宽度上,拖动侧栏时
 *   面板边缘和 header 让位槽都会落在指针后面若干帧。
 *
 * `isMounted = isVisible || progress.get() > 0` 在**渲染期**求值(Codex 同),
 * 关闭动画播完才真正卸载 —— 所以要在 progress 归零时强制重渲染一次。
 * reduced-motion 下直接 set,不播弹簧(Codex `Ym` 分支)。
 */
export const PANEL_REVEAL_SPRING = { type: 'spring', duration: 0.5, bounce: 0.1 } as const

export function usePanelReveal({
  size,
  isVisible
}: {
  /** 目标尺寸(px)。折叠时**不要**传 0 —— 传 0 会让关闭动画瞬间跳完 */
  size: MotionValue<number>
  isVisible: boolean
}): {
  /** 0..1;面板 opacity 直接用它(Codex `style: { opacity: progress }`) */
  progress: MotionValue<number>
  /** clamp01(progress) × size */
  animatedSize: MotionValue<number>
  /** 关闭动画播完前保持 true */
  isMounted: boolean
} {
  const reducedMotion = useReducedMotion() === true
  const progress = useMotionValue(isVisible ? 1 : 0)
  const animatedSize = useTransform<number, number>(
    [progress, size],
    ([p, s]) => Math.max(0, Math.min(1, p)) * s
  )
  const [, forceRender] = useState(0)

  useEffect(() => {
    if (reducedMotion) progress.set(isVisible ? 1 : 0)
    const controls = reducedMotion
      ? null
      : animate(progress, isVisible ? 1 : 0, PANEL_REVEAL_SPRING)
    const stopComplete = progress.on('animationComplete', () => forceRender((x) => x + 1))
    // reduced-motion 下 set() 不触发 animationComplete,用 change 兜底
    const stopChange = progress.on('change', (v) => {
      if (!isVisible && v <= 0) forceRender((x) => x + 1)
    })
    return () => {
      controls?.stop()
      stopComplete()
      stopChange()
    }
  }, [isVisible, reducedMotion, progress])

  return { progress, animatedSize, isMounted: isVisible || progress.get() > 0 }
}
