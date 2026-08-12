import type { ChatProgressMessageContent } from '../model/content'
import { Codicon } from './Codicon'

/**
 * 进度行 —— 对应上游的 chatProgressContentPart.ts。
 *
 * 两种形态二选一，不叠加：
 *   shimmer  文字走流光，转圈图标隐藏
 *   静止     显示对勾图标，文字实心
 *
 * 上游把这条规则写在 CSS 里（`.shimmer-progress > .codicon { display: none }`）。
 * 同时用两个动画表达同一件"正在进行"是噪音。
 */
export function ChatProgressMessagePart({
  content
}: {
  content: ChatProgressMessageContent
}): React.JSX.Element {
  return (
    <div className={`progress-container${content.shimmer ? ' shimmer-progress' : ''}`}>
      <Codicon name={content.shimmer ? 'loading' : 'check'} spin={content.shimmer} />
      <div className="rendered-markdown progress-step">
        <p className={content.shimmer ? 'chat-shimmer-text' : undefined}>{content.content}</p>
      </div>
    </div>
  )
}
