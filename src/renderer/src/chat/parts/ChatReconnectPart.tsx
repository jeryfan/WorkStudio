import { useState } from 'react'
import type { ChatReconnectContent } from '../model/content'
import { ActivityStreamErrorIcon } from '../../components/icons'
import { ActivityHeaderRow, DisclosureBody } from './activity'
import { ACTIVITY_ICON_CLASS } from './tool/ToolActivityIcon'
import { CadencedShimmer } from './CadencedShimmer'

/**
 * 流断开重连。
 *
 * Codex 有 `stream-error` 条目,图标是 **wifi 弧线**(不是错误图标)——
 * 它用"连接"而不是"出错"来表达断流,这个选择本身就说明了语义:
 * 还会自己恢复,先弹红字会让用户以为白跑了一轮,于是去按停止、重发,
 * 反而真的白跑。这里沿用它的图标。
 *
 * 摘要走流光,因为"还在重试"是进行中状态 —— 与工具行同一条规则。
 *
 * 失败详情收在折叠里。它通常是一串 HTTP 细节,对判断"要不要等"没有帮助,
 * 但排查时又必须能拿到。没有详情时不给折叠 —— `ActivityHeaderRow` 在没有
 * body 时自动退回不可点的 `div`,不需要调用方判断。
 */
export function ChatReconnectPart({
  content
}: {
  content: ChatReconnectContent
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const text = content.serverOverloaded
    ? `Server is busy — retrying (${content.attempt}/${content.maxAttempts})`
    : `Connection lost — reconnecting (${content.attempt}/${content.maxAttempts})`
  const hasDetail = content.detail != null && content.detail.length > 0

  return (
    <ActivityHeaderRow
      icon={<ActivityStreamErrorIcon aria-hidden className={ACTIVITY_ICON_CLASS} />}
      summary={
        <CadencedShimmer className="min-w-0 truncate text-size-chat text-token-conversation-summary-leading">
          {text}
        </CadencedShimmer>
      }
      disclosure={hasDetail ? { expanded, onToggle: () => setExpanded((v) => !v) } : undefined}
      body={
        hasDetail ? (
          <DisclosureBody expanded={expanded}>
            <div className="min-w-0 whitespace-pre-wrap break-words text-size-chat text-token-conversation-body">
              {content.detail}
            </div>
          </DisclosureBody>
        ) : undefined
      }
    />
  )
}
