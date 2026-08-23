import type { ChatErrorContent } from '../model/content'
import { ActivitySystemErrorIcon } from '../../components/icons'
import { ActivityHeaderRow } from './activity'
import { ACTIVITY_ICON_CLASS } from './tool/ToolActivityIcon'
import { cx } from '../../utils/cx'

/**
 * 轮次级失败 / 警告 / 提示 —— 对应 Codex 的 `system-error` 与 `stream-error`
 * 条目,两者都是活动行(`Fg()` 里给的是圆圈感叹号 / wifi 图标)。
 *
 * 挂在它所属的那一轮内部,而不是会话底部的全局横幅:一轮跑挂之后,用户看到的
 * 是自己的消息后面什么都没有——那看起来像消息没发出去,而不是像出了错。
 *
 * **只有图标带语义色,文字不带**:断流、限流这类错误绝大多数重试一次就好,
 * 一片红会把"可以再试一次"渲染成"出大事了"。这条与 Codex 一致 ——
 * 它的 system-error 行也是普通的 `text-token-conversation-body`,
 * 只有图标用 `text-token-editor-error-foreground`。
 */
export function ChatErrorPart({ content }: { content: ChatErrorContent }): React.JSX.Element {
  const tone =
    content.level === 'error'
      ? 'text-token-editor-error-foreground'
      : content.level === 'warning'
        ? 'text-token-editor-warning-foreground'
        : 'text-token-conversation-body'

  return (
    <ActivityHeaderRow
      icon={<ActivitySystemErrorIcon aria-hidden className={cx(ACTIVITY_ICON_CLASS, tone)} />}
      summary={content.message}
    />
  )
}
