import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cx } from '../../../utils/cx'
import { ActivityBody } from './ActivityBody'
import { DISCLOSURE_TRANSITION } from './transition'
import { useElementHeight } from './useElementHeight'

/**
 * 活动行展开体的动画外壳。
 *
 * Codex 里这段是**逐字重复**的 —— 推理块、patch 行、多 agent 动作、计划、
 * `ToolActivityDisclosure` 至少五处都是同一坨:
 *
 * ```
 * const {elementHeightPx, elementRef} = useElementHeight()
 * <motion.div
 *   initial={false}
 *   animate={{height: expanded ? elementHeightPx : 0, opacity: +!!expanded}}
 *   aria-hidden={!expanded} inert={!expanded}
 *   className={expanded ? 'overflow-visible' : 'overflow-hidden'}
 *   style={{pointerEvents: expanded ? 'auto' : 'none'}}
 *   transition={Qj}
 * >
 *   <ActivityBody ref={elementRef} …>{children}</ActivityBody>
 * </motion.div>
 * ```
 *
 * (它重复是因为 React Compiler 把每处都内联了 —— 抽成一个组件产出的 DOM 一样。)
 *
 * 四个细节都不能省:
 * - **`initial={false}`**:首次挂载不放动画。否则重开一条历史会话时,
 *   所有已完成的活动行会一起做一次收起动画。
 * - **`inert` + `aria-hidden`**:光靠 `height: 0` 的话里面的按钮/链接仍能被
 *   Tab 聚焦到,读屏器也会念。
 * - **`overflow-visible` 只在展开态**:收起时必须 hidden(否则内容溢出可见),
 *   展开后要 visible(hover 浮层、代码块的横向滚动条要能出格)。
 * - **`pointerEvents` 走 style 而不是类**:动画期间高度是中间值,
 *   这时候不该能点到半截内容。
 */
export function DisclosureBody({
  expanded,
  indent = false,
  variant = 'default',
  bodyClassName,
  children
}: {
  expanded: boolean
  indent?: boolean
  variant?: 'default' | 'grouped' | 'flush'
  bodyClassName?: string
  children: ReactNode
}): React.JSX.Element {
  const { elementHeightPx, elementRef } = useElementHeight()
  return (
    <motion.div
      initial={false}
      animate={{ height: expanded ? elementHeightPx : 0, opacity: expanded ? 1 : 0 }}
      aria-hidden={!expanded}
      inert={!expanded}
      className={cx(expanded ? 'overflow-visible' : 'overflow-hidden')}
      style={{ pointerEvents: expanded ? 'auto' : 'none' }}
      transition={DISCLOSURE_TRANSITION}
    >
      <ActivityBody ref={elementRef} indent={indent} variant={variant} className={bodyClassName}>
        {children}
      </ActivityBody>
    </motion.div>
  )
}
