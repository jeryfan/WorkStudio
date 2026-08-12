import type { ChatErrorContent } from '../model/content'
import { Codicon } from './Codicon'

/**
 * 错误 / 警告 / 提示卡片 —— 对应上游的 chatErrorContentPart.ts。
 *
 * 挂在它所属的那一轮内部，而不是会话底部的全局横幅：一轮跑挂之后，用户看到的
 * 是自己的消息后面什么都没有——那看起来像消息没发出去，而不是像出了错。
 *
 * 用中性描边卡片而不是红底红字：断流、限流这类错误绝大多数重试一次就好，
 * 一片红会把"可以再试一次"渲染成"出大事了"。只有图标带语义色。
 */

const ICON = {
  error: { name: 'error', wrapper: 'chat-error-codicon' },
  warning: { name: 'warning', wrapper: 'chat-warning-codicon' },
  info: { name: 'info', wrapper: 'chat-info-codicon' }
} as const

export function ChatErrorPart({ content }: { content: ChatErrorContent }): React.JSX.Element {
  const icon = ICON[content.level]
  return (
    <div className="chat-notification-widget" tabIndex={0}>
      <div className={icon.wrapper}>
        <Codicon name={icon.name} />
        <div className="rendered-markdown">
          <p>{content.message}</p>
        </div>
      </div>
    </div>
  )
}
