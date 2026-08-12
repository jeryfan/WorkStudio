import type { ChatReconnectContent } from '../model/content'
import { Collapsible } from './Collapsible'

/**
 * 流断开重连。
 *
 * 上游没有对应的 part —— VSCode 的断流会直接变成一条错误。本项目把"还会重试"
 * 与"已经放弃"分开：断流大多能自己恢复，先弹红字会让用户以为白跑了一轮，
 * 于是去按停止、重发，反而真的白跑。
 *
 * 挂在所属轮次而不是会话底部的全局横幅：后台可能有别的会话也在跑，全局横幅
 * 说不清是谁在重连。
 *
 * 复用 `.progress-container.shimmer-progress` 这套结构（同 ChatWorkingPart），
 * 于是"活动只用流光表达、不叠转圈图标"这条规则由共享 CSS 自动落实，不必在
 * 每个 part 里各写一遍。
 *
 * 失败详情收在折叠里。它通常是一串 HTTP 细节，对判断"要不要等"没有帮助，
 * 但排查时又必须能拿到。没有详情时不给折叠壳——一个点开是空的箭头更烦人。
 */
export function ChatReconnectPart({
  content
}: {
  content: ChatReconnectContent
}): React.JSX.Element {
  const text = content.serverOverloaded
    ? `Server is busy — retrying (${content.attempt}/${content.maxAttempts})`
    : `Connection lost — reconnecting (${content.attempt}/${content.maxAttempts})`

  const title = (
    <span className="progress-container shimmer-progress">
      <span className="rendered-markdown progress-step">
        <p className="chat-shimmer-text">{text}</p>
      </span>
    </span>
  )

  if (!content.detail) {
    return <div className="chat-reconnect-part">{title}</div>
  }

  return (
    <div className="chat-reconnect-part">
      <Collapsible title={title}>
        <div className="chat-reconnect-detail">{content.detail}</div>
      </Collapsible>
    </div>
  )
}
