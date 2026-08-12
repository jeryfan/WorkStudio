import type { ChatWorkingContent } from '../model/content'

/**
 * "工作中" —— 移植自上游的 ChatWorkingProgressContentPart。
 *
 * DOM 与 `ChatProgressMessagePart` 完全一致（`.progress-container` +
 * `.progress-step`），因为上游它们本来就是同一个类：`ChatWorkingProgressContentPart
 * extends ChatProgressContentPart`，只是内容换成了一句随机的"工作中"文案。
 *
 * 固定带 `shimmer-progress`：这一行的存在本身就意味着"还在跑"。配套 CSS 会
 * 把图标隐藏掉（`.shimmer-progress > .codicon { display: none }`），所以这里
 * 连图标都不渲染——上游渲染一个 check 再用 CSS 藏起来，是因为它的部件基类
 * 要求有图标，我们没有这个包袱。
 */
export function ChatWorkingPart({ content }: { content: ChatWorkingContent }): React.JSX.Element {
  return (
    <div className="progress-container shimmer-progress chat-working-part">
      <div className="rendered-markdown progress-step">
        <p className="chat-shimmer-text">{content.label}</p>
      </div>
    </div>
  )
}
