import { useState, type ReactNode } from 'react'
import { Codicon } from './Codicon'

/**
 * 可折叠块 —— 对应上游的 chatCollapsibleContentPart.ts。
 *
 * 思考块、工具调用、待办清单都建在它上面，所以单独成组件。
 *
 * 两个从上游照搬的细节：
 *
 * 1. **chevron 平时不显示**，hover 或展开后才出现。一列常驻的小箭头会让回复
 *    看起来像个树控件，而这些块大多数时候只是给人扫一眼的流水。
 *
 * 2. **展开动画用 `grid-template-rows: 0fr → 1fr`**，不是 max-height。
 *    max-height 需要猜一个上限：猜小了内容被截断，猜大了收起时前半段是空等。
 *    grid 的 fr 过渡能对任意高度都精确。
 */
export function Collapsible({
  title,
  icon,
  defaultExpanded = false,
  expanded: controlled,
  onToggle,
  className,
  bodyRef,
  bodyStyle,
  onBodyScroll,
  children
}: {
  /** 标题行内容。传节点而不是字符串：思考块要在标题里放 shimmer */
  title: ReactNode
  /** 标题左侧的 codicon 名 */
  icon?: string
  defaultExpanded?: boolean
  /**
   * 受控展开态。传了就由调用方说了算——思考块在流式期间必须是展开的
   * （上游默认的 fixedScrolling 模式），那个状态不属于这个组件。
   */
  expanded?: boolean
  onToggle?(next: boolean): void
  /** 附加在最外层的类名，用于各 part 的专属样式 */
  className?: string
  /** 内容容器的 ref / 内联样式 / 滚动回调，供需要自己控制滚动与高度的调用方使用 */
  bodyRef?: React.Ref<HTMLDivElement>
  bodyStyle?: React.CSSProperties
  onBodyScroll?(e: React.UIEvent<HTMLDivElement>): void
  children: ReactNode
}): React.JSX.Element {
  const [uncontrolled, setUncontrolled] = useState(defaultExpanded)
  const expanded = controlled ?? uncontrolled

  const toggle = (): void => {
    const next = !expanded
    if (controlled === undefined) setUncontrolled(next)
    onToggle?.(next)
  }

  return (
    <div
      className={[
        'chat-used-context',
        'chat-collapsible-content-animatable',
        'chat-collapsible-content-animated',
        expanded ? null : 'chat-used-context-collapsed',
        className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="chat-used-context-label">
        <button type="button" aria-expanded={expanded} onClick={toggle}>
          {icon && <Codicon name={icon} />}
          <span className="collapsible-title">{title}</span>
          <Codicon
            name="chevron-right"
            className={`chat-collapsible-hover-chevron${expanded ? ' expanded' : ''}`}
          />
        </button>
      </div>

      {/*
       * 内容常驻挂载、靠 grid 收起，而不是卸载。
       * 卸载会让展开时重新创建 Monaco 实例、丢掉滚动位置，
       * 也会让流式内容在收起期间停止累积。
       */}
      <div className="chat-collapsible-content-animation">
        <div
          className="chat-collapsible-content-animation-inner"
          ref={bodyRef}
          style={bodyStyle}
          onScroll={onBodyScroll}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
