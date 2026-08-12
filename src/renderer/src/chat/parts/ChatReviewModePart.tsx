import type { ChatReviewModeContent } from '../model/content'

/**
 * 进入 / 退出审阅模式。
 *
 * 上游没有对应的 part —— VSCode 没有这个概念。协议会推 `enteredReviewMode` /
 * `exitedReviewMode` 两条条目，不显示的话中间那段对话会显得莫名其妙：agent
 * 突然开始逐文件挑毛病，看不出它换了个身份。
 *
 * 与 `contextCompaction` 用同一种视觉语言（带标签的细线）：两者都是会话的
 * 结构性事件，不是 agent 的某一次动作，视觉权重要低于工具调用。
 */
export function ChatReviewModePart({
  content
}: {
  content: ChatReviewModeContent
}): React.JSX.Element {
  return (
    <div className="chat-context-compaction chat-review-mode">
      {content.entered ? 'Entered review mode' : 'Exited review mode'}
      {/* review 是审阅的题目，退出时重复一遍没有信息量 */}
      {content.entered && content.review && (
        <span className="chat-review-mode-target"> · {content.review}</span>
      )}
    </div>
  )
}
