import { cx } from '../../utils/cx'
import { CadencedShimmer } from './CadencedShimmer'
import { ConversationItem } from './activity'

/**
 * 轮次状态行 —— Codex `local-conversation-turn` 的 `thinking-placeholder`
 *(`Po`/`No`)。
 *
 * turn 还在跑、但没有别的进度表达(没有正在执行的工具、回答还没开始流式)时,
 * 显示在轮次末尾的一行:"Thinking" 或最新一条推理的最后一行
 * (`thinkingFallbackMessage`)。
 *
 * ## 与上一版(ChatWorkingPart)的差异
 *
 * - 文案固定,**没有轮换词表**(Thinking/Reasoning/Considering 那六个是
 *   VS Code 的 `defaultThinkingMessages`,Codex 没有)
 * - 不是内容流里的一条,而是 **turn 的兄弟段**:在可折叠的过程段之外,
 *  过程段折叠时它还在(Codex 的 `q('thinking-placeholder', …)` 与
 *  `agent-activity-collapsible` 平级)
 * - 结构照 `No`:左边一条 `h-4 w-0` 的间隔槽(与活动行的图标位对齐),
 *  文字走 cadencedShimmer
 *
 * ## `visible=false` 是「占位但不可见」,不是「不流光」
 *
 * `No` 的两行是 `c = !isVisible`(→ `aria-hidden`)与
 * `l = !isVisible && 'invisible'` —— 流光组件**照常挂载并照常打拍子**,
 * 只是整块被 `invisible` 藏起来、对屏幕阅读器隐藏。这样底部不会在
 * "在想"与"不在想"之间抽动一次高度。上一版把 `visible` 当成 shimmer 的
 * `active` 传下去,不可见时连流光结构一起摘掉了 —— 再显示出来时会重新
 * 走一遍 600ms 的首次延时。
 */
export function ThinkingPlaceholder({
  message,
  visible = true
}: {
  /** 推理标题;没有时显示 "Thinking"(Codex `thinkingShimmer.default`) */
  message?: string | null
  visible?: boolean
}): React.JSX.Element {
  return (
    <ConversationItem padding="offset">
      <div className="group/thread-details flex items-center justify-between gap-2">
        <div className="inline-flex max-w-full min-w-0 items-center overflow-hidden text-token-conversation-body [&_*:not(button)]:!text-token-conversation-body">
          <span aria-hidden="true" className="h-4 w-0 shrink-0" />
          <CadencedShimmer
            ariaHidden={!visible}
            className={cx('min-w-0 flex-1 truncate select-none', !visible && 'invisible')}
          >
            {message ?? 'Thinking'}
          </CadencedShimmer>
        </div>
      </div>
    </ConversationItem>
  )
}
