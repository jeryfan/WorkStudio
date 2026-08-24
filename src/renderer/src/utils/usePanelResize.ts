import { useEffect, useRef, useState } from 'react'

/**
 * 面板拖拽 —— 手柄只抛 onPointerDown,拖拽过程由这里持有(Codex 的分工:
 * 它的 ResizeHandle props 里只有 onPointerDown / isResizing,没有目标尺寸)。
 *
 * 监听必须挂 window:手柄热区只有 16px,拖快了指针会移出去。
 *
 * 实现上刻意不做「引用稳定 + ref 存 cleanup」那套优化 —— 试过,连续拖拽时
 * cleanup ref 被后一次覆盖,前一次的监听摘不掉,多个 move 处理器拿着各自的
 * startSize 互相覆写,表现是宽度卡住不动。现在改成:一次拖拽 = 一个 AbortController,
 * 用 signal 一次性摘掉全部监听,不存任何跨拖拽状态。
 */
export function usePanelResize({
  edge,
  size,
  onResize,
  onResizeEnd
}: {
  /** 'right' = 拖右缘,指针右移变宽(侧栏);'left' = 拖左缘,指针右移变窄(右面板/文件树);
   *  'top' = 拖上缘,指针下移变矮(底部面板);'bottom' = 拖下缘 */
  edge: 'left' | 'right' | 'top' | 'bottom'
  size: number
  onResize(next: number): void
  /** 收手时回传**最后一次拖拽出的目标尺寸**(Codex Tkr 的 onResizeEnd(e));
   *  拖过折叠阈值时调用方据此跳过持久化 */
  onResizeEnd?(finalSize: number): void
}): {
  isResizing: boolean
  onPointerDown: React.PointerEventHandler<HTMLDivElement>
} {
  const [isResizing, setIsResizing] = useState(false)

  // 卸载时中止进行中的拖拽,避免 setState-after-unmount
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    // Codex Tkr:setPointerCapture —— 拖快了指针移出 16px 热区也不断线
    e.currentTarget.setPointerCapture?.(e.pointerId)

    // 上一次若因异常没收尾,这里先摘干净
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const startX = e.clientX
    const startY = e.clientY
    const startSize = size
    const pointerId = e.pointerId
    let lastSize = startSize
    // Codex `didMove`:没拖动的点击不触发 onResizeEnd(双击复位走 onClick)
    let didMove = false
    setIsResizing(true)

    window.addEventListener(
      'pointermove',
      (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return
        const delta =
          edge === 'right'
            ? ev.clientX - startX
            : edge === 'left'
              ? startX - ev.clientX
              : edge === 'top'
                ? startY - ev.clientY
                : ev.clientY - startY
        const next = startSize + delta
        if (next === lastSize) return
        didMove = true
        lastSize = next
        onResize(lastSize)
      },
      { signal: ac.signal }
    )

    const finish = (): void => {
      ac.abort()
      abortRef.current = null
      setIsResizing(false)
      if (didMove) onResizeEnd?.(lastSize)
    }
    window.addEventListener('pointerup', finish, { signal: ac.signal })
    window.addEventListener('pointercancel', finish, { signal: ac.signal })
  }

  return { isResizing, onPointerDown }
}
