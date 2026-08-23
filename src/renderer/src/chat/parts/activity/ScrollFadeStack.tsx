import type { ReactNode } from 'react'
import { cx } from '../../../utils/cx'

/**
 * `ScrollFadeStack`(Codex 会话里的滚动淡出栈,源码 `OT`) ——
 * 推理正文那个固定高度、自动贴底、上下淡出的窗口。
 *
 * 整个组件只有两层 div,**没有一行 JS 滚动逻辑**:
 *
 * 1. **贴底跟随 = `flex flex-col-reverse`**。反向 flex 把"滚动原点"放到底部,
 *    内容长高时浏览器自动保持贴底。与 `ThreadScrollContainer` 同一个手法。
 *    这也解释了 `autoScrollToBottom` 为什么是个纯类名开关。
 * 2. **上下淡出 = `vertical-scroll-fade-mask`**。那个类走
 *    `animation-timeline: scroll(self y)`(滚动驱动动画)去插值
 *    `--top-fade` / `--bottom-fade`,所以遮罩自己跟着滚动位置变 ——
 *    贴顶时不淡上边,贴底时不淡下边。
 *
 * 我之前那版 ThinkingPart 用 ResizeObserver + `scrollTop` 手写贴底、
 * 再用 `onScroll` 算上下淡出的开关类:行为接近但不等价(流式时会抖),
 * 而且和 Codex 的 DOM 完全不一样。现在这两件事都交给 CSS。
 *
 * `maxHeightByState` 三档由调用方给。推理正文三档都是
 * `{preview: '8.75rem', expanded: '8.75rem', collapsed: '0px'}` —— 也就是
 * 140px,不是我之前照 VS Code 抄的 200px。
 */
export function ScrollFadeStack({
  items,
  className,
  contentClassName,
  maxHeightByState,
  viewState = 'preview',
  autoScrollToBottom = true,
  disableMaxHeight = false,
  allowHorizontalScroll = false
}: {
  items: { key: string; node: ReactNode }[]
  className?: string
  contentClassName?: string
  maxHeightByState: { preview: string; expanded: string; collapsed: string }
  viewState?: 'preview' | 'expanded' | 'collapsed'
  autoScrollToBottom?: boolean
  disableMaxHeight?: boolean
  allowHorizontalScroll?: boolean
}): React.JSX.Element {
  const maxHeight =
    viewState === 'expanded'
      ? maxHeightByState.expanded
      : viewState === 'collapsed'
        ? maxHeightByState.collapsed
        : maxHeightByState.preview

  return (
    <div
      className={cx(
        'vertical-scroll-fade-mask [--edge-fade-distance:1.5rem] overflow-y-auto',
        autoScrollToBottom && 'flex flex-col-reverse',
        !allowHorizontalScroll && 'overflow-x-hidden',
        className
      )}
      style={disableMaxHeight ? undefined : { maxHeight }}
    >
      <div
        className={cx('flex flex-col gap-1', contentClassName, viewState === 'preview' && 'pb-1')}
      >
        {viewState === 'collapsed'
          ? null
          : items.map((item) => <div key={item.key}>{item.node}</div>)}
      </div>
    </div>
  )
}
