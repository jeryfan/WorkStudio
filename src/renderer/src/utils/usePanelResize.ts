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
  /** 'right' = 拖右缘,指针右移变宽(侧栏);'left' = 拖左缘,指针右移变窄(右面板/文件树) */
  edge: 'left' | 'right'
  size: number
  onResize(next: number): void
  onResizeEnd?(): void
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

    // 上一次若因异常没收尾,这里先摘干净
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const startX = e.clientX
    const startSize = size
    const pointerId = e.pointerId
    setIsResizing(true)

    window.addEventListener(
      'pointermove',
      (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return
        const delta = edge === 'right' ? ev.clientX - startX : startX - ev.clientX
        onResize(startSize + delta)
      },
      { signal: ac.signal }
    )

    const finish = (): void => {
      ac.abort()
      abortRef.current = null
      setIsResizing(false)
      onResizeEnd?.()
    }
    window.addEventListener('pointerup', finish, { signal: ac.signal })
    window.addEventListener('pointercancel', finish, { signal: ac.signal })
  }

  return { isResizing, onPointerDown }
}
