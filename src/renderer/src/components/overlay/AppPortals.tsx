import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * 应用级 portal 层 —— Codex 在 `<body>` 下挂两个,是 `#root` 的**兄弟**。
 *
 *   div.pointer-events-none.fixed.z-[60]              ← 浮动 composer / DragOverlay
 *   └ span.absolute.inset-y-0.start-0.mx-auto.my-2.flex
 *       .max-w-(--composer-adjacent-max-width).flex-col.items-center.justify-start.md:pb-5
 *   div.pointer-events-none.fixed.top-2.z-[55].flex.justify-end   ← toast
 *   └ div
 *
 * 为什么必须是 body 的子元素而不能放在 #root 里:
 * `#root > div.relative.flex.flex-col` 上有 `zoom: var(--codex-window-zoom)`,
 * 而 `zoom` 会给后代建立新的包含块 —— 放在里面的 `fixed` 元素会相对那一层定位
 * 而不是视口,窗口缩放时浮层会跟着漂。
 *
 * z 轴次序固定:z-[60](拖拽克隆体,必须盖住一切)> z-[55](toast)>
 * z-40(thread 浮动面板)> z-30(header)> z-20(侧栏 footer / resize 手柄)。
 *
 * 两层都是 `pointer-events-none`,内容自己按需开 auto —— 否则整屏都点不动。
 */
export function AppPortals({
  floating,
  toast
}: {
  /** 浮动层内容(拖拽克隆体、贴着 composer 的浮层) */
  floating?: ReactNode
  toast?: ReactNode
}): React.JSX.Element {
  return (
    <>
      {createPortal(
        <div className="pointer-events-none fixed z-[60]">
          <span className="absolute inset-y-0 start-0 mx-auto my-2 flex max-w-(--composer-adjacent-max-width) flex-col items-center justify-start md:pb-5">
            {floating}
          </span>
        </div>,
        document.body
      )}
      {createPortal(
        <div className="pointer-events-none fixed top-2 z-[55] flex justify-end">
          <div>{toast}</div>
        </div>,
        document.body
      )}
    </>
  )
}

/**
 * a11y announcer —— Codex 在 `#root` 里放两个 span 夹住应用:
 *   span[aria-hidden="true"][hidden]   (首)
 *   span.hidden                        (尾)
 *
 * 它们是 aria-live 播报的宿主(拖拽状态、异步完成之类)。结构留着,
 * 内容由具体功能往里填 —— 少了它们,屏幕阅读器读不到状态变更。
 */
export function AccessibilityAnnouncerHead(): React.JSX.Element {
  return <span aria-hidden="true" hidden />
}

export function AccessibilityAnnouncerTail(): React.JSX.Element {
  return <span className="hidden" />
}
