import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 悬浮卡片的打开/关闭延迟。
 *
 * 关闭延迟不是装饰:卡片渲染在行外面,鼠标从行滑向卡片的路上会短暂离开两者,
 * 立即关闭就永远滑不进去。200ms 是"划过即闪"和"滑得进去"之间的余量。
 */
const HOVER_OPEN_DELAY = 250
const HOVER_CLOSE_DELAY = 200

interface HoverCardState {
  /** 非 null 时卡片可见,值是行的 rect,卡片据此定位 */
  anchor: DOMRect | null
  scheduleOpen(): void
  scheduleClose(): void
  close(): void
}

/**
 * 行 → 悬浮卡片的开合时序。
 *
 * 项目行和会话行共用 —— Codex 两者都有悬浮面板(侧栏里 31 个元素带
 * data-hover-card-open-immediately),时序一致,没必要各写一份计时器。
 *
 * `blocked` 传菜单是否打开:菜单带全屏遮罩,卡片会被压在下面,所以菜单一开就收卡片。
 */
export function useHoverCard(
  rowRef: React.RefObject<HTMLElement | null>,
  blocked = false
): HoverCardState {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback((): void => {
    if (openTimer.current) clearTimeout(openTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    openTimer.current = null
    closeTimer.current = null
  }, [])

  const scheduleOpen = useCallback((): void => {
    clearTimers()
    openTimer.current = setTimeout(() => {
      const rect = rowRef.current?.getBoundingClientRect()
      if (rect) setAnchor(rect)
    }, HOVER_OPEN_DELAY)
  }, [clearTimers, rowRef])

  const scheduleClose = useCallback((): void => {
    clearTimers()
    closeTimer.current = setTimeout(() => setAnchor(null), HOVER_CLOSE_DELAY)
  }, [clearTimers])

  const close = useCallback((): void => {
    clearTimers()
    setAnchor(null)
  }, [clearTimers])

  // 卸载时清掉未触发的延迟
  useEffect(() => clearTimers, [clearTimers])

  // 菜单打开时让位
  useEffect(() => {
    if (!blocked) return
    clearTimers()
    // 菜单开合是外部事件,不是渲染派生
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnchor(null)
  }, [blocked, clearTimers])

  return { anchor, scheduleOpen, scheduleClose, close }
}
