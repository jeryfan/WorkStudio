/**
 * 「安全三角」—— 鼠标从触发器滑向浮层的路上不关闭。
 *
 * Codex 的做法(bundle 里 `ntt`/`rtt`/`itt`):以指针当前位置为顶点、浮层
 * 靠近触发器那条边(上下各外扩 8px)为底边,构成一个三角形。指针只要还在
 * 三角形内就算「正在往浮层走」,继续保持打开;一离开三角形立刻关。
 *
 * 为什么不能用「延时关闭」代替:延时是时间维度的宽容,鼠标往**反方向**走
 * 也照样宽容,于是划过一排会话行时上一张卡片还挂着;三角形是方向维度的,
 * 走错方向立即收。两者可以叠加(handoff 定时器 100ms),但方向判断是主力。
 */
const SAFE_TRIANGLE_PADDING = 8

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left'

interface Point {
  x: number
  y: number
}

interface Triangle {
  start: Point
  endA: Point
  endB: Point
}

function isEmptyRect(rect: DOMRect): boolean {
  return rect.width <= 0 || rect.height <= 0
}

function buildTriangle(
  pointer: Point,
  destinationRect: DOMRect,
  destinationSide: TooltipSide,
  sourceRect: DOMRect
): Triangle | null {
  if (isEmptyRect(destinationRect) || isEmptyRect(sourceRect)) return null
  if (destinationSide === 'left' || destinationSide === 'right') {
    // 底边取浮层**靠触发器那一侧**的竖边
    const x = destinationSide === 'right' ? destinationRect.left : destinationRect.right
    return {
      start: pointer,
      endA: { x, y: destinationRect.top - SAFE_TRIANGLE_PADDING },
      endB: { x, y: destinationRect.bottom + SAFE_TRIANGLE_PADDING }
    }
  }
  const y = destinationSide === 'bottom' ? destinationRect.top : destinationRect.bottom
  return {
    start: pointer,
    endA: { x: destinationRect.left - SAFE_TRIANGLE_PADDING, y },
    endB: { x: destinationRect.right + SAFE_TRIANGLE_PADDING, y }
  }
}

function cross(p: Point, a: Point, b: Point): number {
  return (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y)
}

/** 点在三角形内(含边):三个叉积同号 */
function isInside(point: Point, t: Triangle): boolean {
  const a = cross(point, t.start, t.endA)
  const b = cross(point, t.endA, t.endB)
  const c = cross(point, t.endB, t.start)
  return !((a < 0 || b < 0 || c < 0) && (a > 0 || b > 0 || c > 0))
}

/**
 * 装上三角形守卫,返回卸载函数;`null` 表示两个矩形还没有尺寸、装不了。
 *
 * 监听挂在 document 的**捕获**阶段:浮层内容可能自己 stopPropagation,
 * 冒泡阶段会漏掉一部分移动。
 */
export function watchSafeTriangle({
  destinationElement,
  destinationSide,
  onEnterDestination,
  onMoveInsideTriangle,
  onMoveOutsideTriangle,
  pointer,
  sourceElement
}: {
  destinationElement: HTMLElement
  destinationSide: TooltipSide
  onEnterDestination(): void
  onMoveInsideTriangle(point: Point): void
  onMoveOutsideTriangle(): void
  pointer: Point
  sourceElement: HTMLElement
}): (() => void) | null {
  const triangle = buildTriangle(
    pointer,
    destinationElement.getBoundingClientRect(),
    destinationSide,
    sourceElement.getBoundingClientRect()
  )
  if (triangle == null) return null

  const doc = sourceElement.ownerDocument
  const onPointerMove = (event: PointerEvent): void => {
    const path = event.composedPath()
    if (path.includes(destinationElement) || path.includes(sourceElement)) {
      onEnterDestination()
      return
    }
    const point = { x: event.clientX, y: event.clientY }
    if (isInside(point, triangle)) {
      onMoveInsideTriangle(point)
      return
    }
    onMoveOutsideTriangle()
  }

  doc.addEventListener('pointermove', onPointerMove, true)
  return () => doc.removeEventListener('pointermove', onPointerMove, true)
}
