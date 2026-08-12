import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import type { ChatRow } from './model/rows'
import { rowKey } from './model/rows'
import { ChatRequestRow } from './rows/ChatRequestRow'
import { ChatResponseRow } from './rows/ChatResponseRow'
import { Codicon } from './parts/Codicon'
import './media/chat.css'
import './media/chatContentParts.css'
import './media/chatMarkdown.css'
import './media/codeBlockPart.css'
import './media/chatFooter.css'
import './media/chatCollapsible.css'
import './media/chatThinkingContent.css'
import './media/chatToolInvocation.css'
import './media/chatConfirmationWidget.css'
import './media/chatMiscParts.css'

/**
 * 对话列表。
 *
 * 上游用 monaco-list 做虚拟滚动，这里换成 react-virtuoso —— 它自带变高度测量与
 * 贴底跟随，不必自己维护高度缓存。
 *
 * 但有一处它**不管**，也是整个列表最容易出错的地方：
 *
 * `followOutput` 只在**条目数变化**时触发。流式输出期间条目数不变，是最后一行
 * 在不断长高——此时内容向下生长而视口不动，会一点点飘离底部，表现为"回答越长
 * 越看不见新内容"。所以下面用 `atBottom` + 显式 `scrollToIndex` 补上这一段。
 *
 * 反过来同样重要：只在用户本来就贴着底部时才跟随。往上翻历史时被强行拉回底部
 * 是最招人烦的交互之一。
 *
 * `footer` 是输入区。它渲染在 `.interactive-session` 内部、列表的**兄弟**位置，
 * 和上游的 DOM 一致：这样高度由 flex 自己分，输入区不需要定位也不会盖住内容。
 */
export function ChatList({
  rows,
  footer,
  placeholder
}: {
  rows: ChatRow[]
  /** 输入区 */
  footer?: ReactNode
  /** 列表为空时显示（加载中 / 新会话） */
  placeholder?: ReactNode
}): React.JSX.Element {
  const handle = useRef<VirtuosoHandle>(null)
  const [atBottom, setAtBottom] = useState(true)

  // Virtuoso 只接受 'auto' | 'smooth'（不含 CSS 的 'instant'）
  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    handle.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior })
  }, [])

  // 补 followOutput 管不到的那一段：最后一行长高时把视口拽回底部。
  // 依赖写 rows 而不是 rows.length —— 正是"长度没变但内容变了"这种情况需要它。
  useEffect(() => {
    if (atBottom) scrollToBottom()
  }, [rows, atBottom, scrollToBottom])

  return (
    <div className={`interactive-session${atBottom ? '' : ' show-scroll-down'}`}>
      <div className="interactive-list">
        <Virtuoso
          ref={handle}
          data={rows}
          computeItemKey={(_, row) => rowKey(row)}
          itemContent={(index, row) =>
            row.kind === 'request' ? (
              <ChatRequestRow row={row} />
            ) : (
              <ChatResponseRow row={row} isMostRecent={index === rows.length - 1} />
            )
          }
          // 初次进入历史会话时直接停在最新一轮，而不是从头开始滚
          initialTopMostItemIndex={Math.max(0, rows.length - 1)}
          followOutput={(isAtBottom) => (isAtBottom ? 'auto' : false)}
          atBottomStateChange={setAtBottom}
          // 贴底判定留一点余量：差几像素就当作在底部，否则流式输出时
          // 会在"贴底/未贴底"之间反复横跳
          atBottomThreshold={64}
          // 视口外多渲染一屏：折叠展开、代码块加载都会让高度突变，
          // 留出余量才不会在快速滚动时露出空白
          increaseViewportBy={{ top: 600, bottom: 600 }}
          style={{ height: '100%' }}
        />

        {rows.length === 0 && placeholder && (
          <div className="interactive-list-placeholder">{placeholder}</div>
        )}

        <button
          type="button"
          className="chat-scroll-down"
          aria-label="Scroll to bottom"
          onClick={() => scrollToBottom('smooth')}
        >
          <Codicon name="chevron-down" />
        </button>
      </div>

      {footer && <div className="interactive-input-part">{footer}</div>}
    </div>
  )
}
