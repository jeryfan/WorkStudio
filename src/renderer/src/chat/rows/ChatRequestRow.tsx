import { memo } from 'react'
import type { ChatRequestRow as RequestRow } from '../model/rows'
import { MarkdownPart } from '../parts/MarkdownPart'

/**
 * 用户消息行 —— 对应上游的 `.interactive-item-container.interactive-request`。
 *
 * 结构上和回复行是**平级的两行**，不是"一轮"里的两个区域。这一点跟着上游：
 * 虚拟滚动按行测高度，一轮里如果有几十个工具调用，把它当成一整行会高得没法
 * 虚拟化，也没法只重渲染变化的那部分。
 */
export const ChatRequestRow = memo(function ChatRequestRow({
  row
}: {
  row: RequestRow
}): React.JSX.Element {
  return (
    <div className="interactive-item-container interactive-request">
      <div className="value">
        <MarkdownPart content={{ kind: 'markdownContent', content: row.text }} />
      </div>
    </div>
  )
})
