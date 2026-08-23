import { useState } from 'react'
import { CheckIcon, CopyIcon } from '../../components/icons'
import { copyText } from '../../utils/clipboard'
import { cx } from '../../utils/cx'

/**
 * 回复的操作条 —— 照 Codex 的 ghost-icon 按钮。
 *
 * Codex 的按钮类名由它的 `Button` 组件按 `color` / `size` 组合出来
 * (app-initial 里那两张表),`color="ghost" size="icon"` 展开是:
 *
 * ```
 * no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none
 * focus:outline-none disabled:cursor-not-allowed disabled:opacity-40      ← 基座
 * text-token-text-tertiary enabled:hover:bg-token-list-hover-background
 * data-[state=open]:bg-token-list-hover-background border-transparent      ← ghost
 * electron:p-1 electron:[&>svg]:icon-sm flex items-center justify-center p-0.5  ← size=icon
 * ```
 *
 * 调用点再补一条 focus ring:
 * `focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:ring-offset-0`。
 *
 * **复制成功后 Codex 换的是整个按钮,不是只换图标** —— 已复制那版没有
 * `onClick`(点不了)、`aria-label` 是 "Copied"。这样读屏器会在焦点上直接
 * 读出结果,而不是要用户再去别处找反馈。
 *
 * 位置与可见性由 `ThreadAssistantMessage` 的 `actions` 槽决定
 * (`opacity-0 group-focus-within:opacity-100 group-hover:opacity-100`),
 * 不在这里管 —— 之前那版自己带 `.chat-footer-toolbar` 的显隐规则,
 * 与外层的 group hover 重复了一遍。
 *
 * 耗时/时间戳也不在这里:Codex 把发送时间放在
 * `span[data-assistant-message-sent-time]`,是 actions 的**兄弟**,
 * 已经由 `ThreadAssistantMessage` 渲染。
 */

const GHOST_ICON_BUTTON = cx(
  'no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none',
  'focus:outline-none disabled:cursor-not-allowed disabled:opacity-40',
  'text-token-text-tertiary enabled:hover:bg-token-list-hover-background border-transparent',
  'electron:p-1 electron:[&>svg]:icon-sm flex items-center justify-center p-0.5',
  'rounded-lg',
  'focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:ring-offset-0'
)

export function ChatResponseFooter({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  if (copied) {
    return (
      <button type="button" className={GHOST_ICON_BUTTON} aria-label="Copied">
        <CheckIcon aria-hidden className="icon-xs" />
      </button>
    )
  }

  return (
    <button
      type="button"
      className={GHOST_ICON_BUTTON}
      aria-label="Copy message"
      onClick={() => {
        void copyText(text).then((ok) => {
          if (!ok) return
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
    >
      <CopyIcon aria-hidden className="icon-xs" />
    </button>
  )
}
