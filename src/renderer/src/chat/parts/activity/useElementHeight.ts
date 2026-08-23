import { useCallback, useRef, useState } from 'react'

/**
 * 测量元素的**内容高度**,给展开动画用 —— 对应 Codex
 * `tool-activity-disclosure` 里的 `useElementHeight`(源码 `B`)。
 *
 * 为什么需要它:Codex 的展开动画是 framer-motion 从 `height: 0` 动到
 * `height: <测出来的像素>`,不是 `height: auto`(motion 动不了 auto),也不是
 * `max-height`(要猜一个上限:猜小了截断,猜大了收起时前半段是空等)。
 * 所以必须先把内容的实际高度量出来。
 *
 * 三个照抄的细节:
 *
 * 1. **`elementRef` 是回调 ref,不是对象 ref**。挂上的那一刻先用
 *    `el.scrollHeight` 立刻写一次高度 —— 不这么做,首帧的目标高度是 0,
 *    "运行中默认展开"的活动行会先塌一下再弹开。
 * 2. **优先读 `borderBoxSize[0].blockSize`**,退回 `contentRect.height`。
 *    contentRect 不含 padding/border,活动体上有 `pt-2 pb-1`,只读它会矮几像素。
 * 3. **同值不 setState**。ResizeObserver 在流式输出期间每帧都触发,
 *    不去重会让整棵子树每帧重渲染。
 *
 * 与 Codex 的**一处实现差异**:Codex 全应用共用一个 ResizeObserver
 * (`useResizeObserver` + `ResizeObserverProvider`,一个 observer 观察成百上千个
 * 元素);这里给每个元素单开一个。可观察行为相同,差在 observer 实例数 ——
 * 引入一套全局 observer 注册表不属于本轮范围,先记下来。
 */
export function useElementHeight(): {
  elementHeightPx: number
  elementRef: (el: HTMLElement | null) => void
} {
  const [elementHeightPx, setHeight] = useState(0)
  const observer = useRef<ResizeObserver | null>(null)

  const set = useCallback((next: number) => {
    setHeight((prev) => (prev === next ? prev : next))
  }, [])

  const elementRef = useCallback(
    (el: HTMLElement | null) => {
      observer.current?.disconnect()
      observer.current = null
      if (el == null) return
      set(el.scrollHeight)
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) set(blockSize(entry))
      })
      ro.observe(el)
      observer.current = ro
    },
    [set]
  )

  return { elementHeightPx, elementRef }
}

/** Codex 的 `V`:borderBoxSize 优先,退回 contentRect */
function blockSize(entry: ResizeObserverEntry): number {
  if (entry.borderBoxSize) {
    const box = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize
    if (box?.blockSize != null) return box.blockSize
  }
  return entry.contentRect.height
}
