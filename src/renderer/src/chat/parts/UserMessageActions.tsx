import { useRef, useState } from 'react'
import { CopyIcon, EditIcon, CheckIcon } from '../../components/icons'
import { copyText } from '../../utils/clipboard'
import { RichTextInput, type ComposerDraft } from '../../components/composer/RichTextInput'

/**
 * 用户消息的悬浮操作 —— Codex 实测:«Aug 16, 2:28 PM» 时间戳 +
 * [Copy message] + [Edit message] 两个 ghost/icon 按钮(与代码块动作栏同一档)。
 *
 * Edit 只在「最新一轮 + 轮次不在跑 + 非只读」时出现
 * (Codex 的 `onEditUserMessage` 在 inProgress / 无宿主 handler 时是 undefined,
 * 按钮跟着不存在)。
 */

const ACTION_BUTTON =
  'no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-full electron:rounded-md text-token-text-tertiary enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent electron:p-1 electron:[&>svg]:icon-sm flex items-center justify-center p-0.5 focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:ring-offset-0'

export function UserMessageActions({
  text,
  onEdit
}: {
  text: string
  /** 传了才有 Edit 按钮 */
  onEdit?: () => void
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label="Copy message"
        className={ACTION_BUTTON}
        onClick={() => {
          void copyText(text).then((ok) => {
            if (!ok) return
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          })
        }}
      >
        {copied ? (
          <CheckIcon aria-hidden className="icon-xs" />
        ) : (
          <CopyIcon aria-hidden className="icon-xs" />
        )}
      </button>
      {onEdit != null && (
        <button type="button" aria-label="Edit message" className={ACTION_BUTTON} onClick={onEdit}>
          <EditIcon aria-hidden className="icon-xs" />
        </button>
      )}
    </>
  )
}

/**
 * 用户消息的行内编辑表单 —— Codex 实测(编辑态):
 *
 * ```
 * div.w-full.p-px
 * └ form.relative.flex.w-full.flex-col.rounded-3xl.bg-token-foreground/5
 *   └ div.relative.z-10.flex.min-h-0.flex-1.flex-col
 *     ├ div.mb-2.flex-grow.overflow-y-auto.px-3.pt-3 > RichTextInput(text-base)
 *     └ div.flex.justify-end.gap-1.5.px-3.pb-3 > [Cancel outline] + [Send primary]
 * ```
 *
 * Enter 提交(Codex 的 `onSubmit → v()`),Escape 取消。Send 走
 * `onSubmit(text)` —— 由调用方接 `editUserMessage`(回滚 + 重发)。
 */
export function UserMessageEditForm({
  initialText,
  onCancel,
  onSubmit
}: {
  initialText: string
  onCancel(): void
  onSubmit(text: string): void
}): React.JSX.Element {
  const [draft, setDraft] = useState(initialText)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)

  const submit = (d: ComposerDraft): void => {
    const text = d.text.trim()
    if (text.length === 0 || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    onSubmit(text)
  }

  return (
    <div className="w-full p-px">
      <form
        className="relative flex w-full flex-col rounded-3xl bg-token-foreground/5"
        onSubmit={(e) => {
          e.preventDefault()
          submit({ text: draft, inputs: [] })
        }}
      >
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div className="mb-2 flex-grow overflow-y-auto px-3 pt-3">
            <RichTextInput
              value={draft}
              placeholder="Edit message"
              ariaLabel="Edit message"
              onChange={(d) => setDraft(d.text)}
              onSubmit={submit}
              onAutocompleteChange={() => {}}
              onAutocompleteCommand={() => {}}
              plusMenuOpen={false}
              onMenuEscape={onCancel}
            />
          </div>
          <div className="flex justify-end gap-1.5 px-3 pb-3">
            <button
              type="button"
              disabled={sending}
              onClick={onCancel}
              className="no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-full electron:rounded-md text-token-foreground border-token-border bg-transparent hover:bg-token-list-hover-background px-3 py-1 text-size-chat"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || draft.trim().length === 0}
              className="no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-full electron:rounded-md text-token-inverse-background-foreground bg-token-foreground hover:bg-token-foreground/90 border-transparent px-3 py-1 text-size-chat"
            >
              Send
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
