import { memo } from 'react'
import type { ChatResponseRow as ResponseRow } from '../model/rows'
import { ChatContentPart } from '../parts/ChatContentPart'
import { ChatResponseFooter } from '../parts/ChatResponseFooter'
import { contentKey } from '../model/contentKey'
import { responsePlainText } from '../model/responseText'

/**
 * 助手回复行 —— 对应上游的 `.interactive-item-container.interactive-response`。
 *
 * 内容块按到达顺序平铺，不做跨块分组。这与旧实现（逆向 Codex 得来的"探索合并"
 * + "Worked for X"分隔）不同，是对齐 VSCode 的直接结果：上游每个工具调用独立
 * 一行、推理块自己可折叠，不做跨条目合并。
 */
export const ChatResponseRow = memo(function ChatResponseRow({
  row,
  isMostRecent
}: {
  row: ResponseRow
  /** 最新一条的底部工具栏常驻显示，其余 hover 才出现 */
  isMostRecent: boolean
}): React.JSX.Element {
  const text = responsePlainText(row)

  return (
    <div
      className={`interactive-item-container interactive-response${
        isMostRecent ? ' chat-most-recent-response' : ''
      }`}
    >
      <div className="value">
        {row.content.map((content, index) => (
          <ChatContentPart key={contentKey(content, index)} content={content} />
        ))}
      </div>

      {/* 流式期间不给工具栏：此时复制会拿到半截内容 */}
      {row.isComplete && text.length > 0 && (
        <ChatResponseFooter
          text={text}
          startedAtMs={row.startedAtMs}
          completedAtMs={row.completedAtMs}
        />
      )}
    </div>
  )
})
