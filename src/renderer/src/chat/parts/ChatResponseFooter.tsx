import { useState } from 'react'
import { copyText } from '../../utils/clipboard'
import { Codicon } from './Codicon'

/**
 * 回复底部的工具栏 —— 对应上游的 `.chat-footer-toolbar`。
 *
 * 两个可见性规则都来自上游，都有道理：
 *
 * 1. **只在回复完成后出现**。流式期间正文还在长，此时给"复制"按钮会复制到
 *    半截内容。
 * 2. **最新一条常驻，其余 hover 才出现**。最新一条是用户马上要操作的对象；
 *    历史回复每条都挂一排按钮会让整个会话看起来像个工具箱。
 *
 * 耗时用"翻转"而不是并排显示：两条信息（何时完成、花了多久）大多数时候只关心
 * 一条，并排会让本来就次要的一行更挤。做法是把两行文字叠在同一个 grid 格里，
 * hover 时上下位移互换。
 */

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  return `${m}m ${Math.round(s % 60)}s`
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function ChatResponseFooter({
  text,
  startedAtMs,
  completedAtMs
}: {
  /** 复制的目标：这条回复的纯文本 */
  text: string
  startedAtMs: number | null
  completedAtMs: number | null
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const duration =
    startedAtMs != null && completedAtMs != null && completedAtMs > startedAtMs
      ? formatDuration(completedAtMs - startedAtMs)
      : null

  return (
    <div className="chat-footer-toolbar">
      <button
        type="button"
        className="chat-footer-action"
        aria-label={copied ? 'Copied' : 'Copy'}
        title={copied ? 'Copied' : 'Copy'}
        onClick={() => {
          void copyText(text).then((ok) => {
            if (!ok) return
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          })
        }}
      >
        <Codicon name={copied ? 'check' : 'copy'} />
      </button>

      {completedAtMs != null && (
        <div className="chat-footer-details" tabIndex={0}>
          <span className={`chat-response-timing${duration ? ' has-alternate' : ''}`}>
            <span className="chat-response-completed-at">{formatTime(completedAtMs)}</span>
            {duration && <span className="chat-response-alternate">{duration}</span>}
          </span>
        </div>
      )}
    </div>
  )
}
