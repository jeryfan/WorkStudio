import { useLayoutEffect, useRef, useState } from 'react'

/** 测量元素尺寸（arborist Tree 需要数值宽高） */
export function useElementSize<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>
  width: number
  height: number
} {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setSize({ width: rect.width, height: rect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { ref, width: size.width, height: size.height }
}
