import type { ChatReviewModeContent } from '../model/content'
import { ActivityHeader, ActivityRow } from './activity'

/**
 * 进入 / 退出审阅模式。
 *
 * **Codex 没有这个条目类型**(协议特有)。不显示的话中间那段对话会显得莫名其妙:
 * agent 突然开始逐文件挑毛病,看不出它换了个身份。
 *
 * 与 `ChatContextCompactionPart` 用同一种形态(一行不可展开的活动摘要):
 * 两者都是会话的结构性事件,不是 agent 的某一次动作,视觉权重要低于工具调用。
 * 不给图标 —— `Fg()` 里没有这一档,挑一个 Codex 图标代表它会造出不存在的语义。
 */
export function ChatReviewModePart({
  content
}: {
  content: ChatReviewModeContent
}): React.JSX.Element {
  return (
    <ActivityRow
      header={
        <ActivityHeader>
          <span className="min-w-0 truncate text-size-chat text-token-conversation-summary-leading">
            {content.entered ? 'Entered review mode' : 'Exited review mode'}
            {/* review 是审阅的题目,退出时重复一遍没有信息量 */}
            {content.entered && content.review && (
              <span className="text-token-conversation-summary-trailing"> · {content.review}</span>
            )}
          </span>
        </ActivityHeader>
      }
    />
  )
}
