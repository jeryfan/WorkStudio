import { useEffect, useRef, useState } from 'react'
import type { ToolInvocation } from '../model/toolInvocation'
import type { ApprovalDecision } from '../model/approval'
import { Codicon } from './Codicon'

/**
 * 审批确认 —— 移植自上游的 chatConfirmationWidget.ts（widget2 形态）。
 *
 * DOM 结构照搬，好让移植过来的 CSS 原样生效：
 *
 *   .chat-confirmation-widget-container
 *     .chat-confirmation-widget2
 *       .chat-confirmation-widget-title  → .chat-title
 *       .chat-confirmation-widget-message
 *       .chat-confirmation-widget-buttons → .chat-buttons
 *
 * 主按钮带下拉（上游的 `ButtonWithDropdown`）：常用的那一个直接点，"本次会话
 * 内都批准"这种一次性决定收进下拉里。上游把它们摊平过一版又收回去了，原因很
 * 实在——"Allow" 和 "Allow for this session" 长得像、后果差很多，并排放着按
 * 错的代价不对称。
 *
 * 仍然不实现的：**策略修订**（execpolicy / network policy amendment）。协议
 * 支持在批准的同时提交一条"以后这类命令都放行"的规则，那需要一个规则编辑器。
 *
 * 也没有 cancel 按钮：cancel 不是用户意图，而是"这条审批作废了"（切换会话、
 * 轮次被中断），由运行时代发，不该出现在界面上。
 */
export function ToolConfirmation({
  invocation,
  requestKey,
  reason,
  onDecide,
  children
}: {
  invocation: ToolInvocation
  requestKey: string
  /** 服务端给的解释，如"需要网络访问" */
  reason: string | null
  onDecide(requestKey: string, decision: ApprovalDecision): void
  /** 要用户过目的内容：命令行、补丁 */
  children: React.ReactNode
}): React.JSX.Element {
  // 点过之后立刻锁住：应答要走一趟 IPC，这期间按钮还能点就会重复应答
  const [decided, setDecided] = useState<ApprovalDecision | null>(null)
  const [open, setOpen] = useState(false)
  const dropdown = useRef<HTMLDivElement>(null)

  // 点到别处 / 按 Esc 就收起下拉。不这么做，下拉会一直挂在那里挡住后面的内容
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!dropdown.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const decide = (decision: ApprovalDecision): void => {
    if (decided) return
    setOpen(false)
    setDecided(decision)
    onDecide(requestKey, decision)
  }

  const isEdit = invocation.data.kind === 'fileEdit'

  return (
    <div className={`chat-confirmation-widget-container${decided ? ' hideButtons' : ''}`}>
      <div className="chat-confirmation-widget2">
        <div className="chat-confirmation-widget-title">
          <div className="chat-title">
            <Codicon name={isEdit ? 'edit' : 'terminal'} />
            {isEdit ? 'Apply these changes?' : 'Run this command?'}
          </div>
        </div>

        <div className="chat-confirmation-widget-message">
          {reason && <p className="chat-confirmation-reason">{reason}</p>}
          {children}
        </div>

        <div className="chat-confirmation-widget-buttons">
          <div className="chat-buttons">
            <div className="monaco-button-dropdown" ref={dropdown}>
              <button type="button" className="monaco-button" onClick={() => decide('accept')}>
                Allow
              </button>
              <button
                type="button"
                className="monaco-button monaco-dropdown-button"
                aria-label="More approval options"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
              >
                <Codicon name="chevron-down" />
              </button>

              {open && (
                <div className="chat-approval-dropdown" role="menu">
                  <button type="button" role="menuitem" onClick={() => decide('acceptForSession')}>
                    Allow for this session
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className="monaco-button secondary"
              onClick={() => decide('decline')}
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
