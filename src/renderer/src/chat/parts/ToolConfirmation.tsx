import { useEffect, useRef, useState } from 'react'
import type { ToolInvocation } from '../model/toolInvocation'
import type { ApprovalDecision } from '../model/approval'
import { ActivityPatchIcon, ActivityTerminalIcon, SubmenuChevronIcon } from '../../components/icons'
import { ActivityHeaderRow } from './activity'
import { ACTIVITY_ICON_CLASS } from './tool/ToolActivityIcon'
import { cx } from '../../utils/cx'

/**
 * 审批确认 —— "工具打算干这件事,批不批"。
 *
 * ## 取证状态:Codex 的这个界面没找到
 *
 * bundle 里确实有 `localConversation.automaticApprovalReview.*`(7 个 title +
 * 5 个 actionSummary)与 `localConversation.approvalRequest.inProgress`,但那些是
 * **对自动审批结果的回顾**(approved / denied / timedOut / aborted),不是给用户
 * 点的 allow/deny 提示;`permission-request` 那个分支渲染的组件(`TO`)在 dump 里
 * 是空壳。翻遍 4714 个 chunk 也没找到命令审批的按钮文案。
 *
 * 所以这里**只对齐能对齐的部分**:
 * - 外壳用 Codex 的活动行(`ActivityHeaderRow` + 图标 + 摘要)
 * - 按钮类名逐字用 Codex `Button` 那两张表展开(`primary` / `secondary` / `ghost`
 *   + `size="compact"`),不自造样式
 * - 语义(Allow / Allow for this session / Skip)沿用 WS 协议的三个决定
 *
 * 主按钮带下拉:"Allow" 和 "Allow for this session" 长得像、后果差很多,
 * 并排放着按错的代价不对称。
 *
 * 仍然不实现的:**策略修订**(execpolicy / network policy amendment)。协议
 * 支持在批准的同时提交一条"以后这类命令都放行"的规则,那需要一个规则编辑器。
 *
 * 也没有 cancel 按钮:cancel 不是用户意图,而是"这条审批作废了"(切换会话、
 * 轮次被中断),由运行时代发,不该出现在界面上。
 */

/** Codex `Button` 的基座 —— 两张表都在 app-initial 里,这里是展开后的结果 */
const BTN_BASE = cx(
  'no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none',
  'focus:outline-none disabled:cursor-not-allowed disabled:opacity-40',
  'focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:ring-offset-0',
  'flex rounded-lg',
  // size="compact"
  'h-6 px-2 py-0 text-xs leading-4'
)
const BTN_PRIMARY =
  'border-token-border bg-token-foreground enabled:hover:bg-token-foreground/80 text-token-dropdown-background'
const BTN_SECONDARY =
  'text-token-foreground bg-token-foreground/5 enabled:hover:bg-token-foreground/10 border-transparent'
const BTN_GHOST =
  'text-token-text-tertiary enabled:hover:bg-token-list-hover-background border-transparent'

export function ToolConfirmation({
  invocation,
  requestKey,
  reason,
  onDecide,
  children
}: {
  invocation: ToolInvocation
  requestKey: string
  /** 服务端给的解释,如"需要网络访问" */
  reason: string | null
  onDecide(requestKey: string, decision: ApprovalDecision): void
  /** 要用户过目的内容:命令行、补丁 */
  children: React.ReactNode
}): React.JSX.Element {
  // 点过之后立刻锁住:应答要走一趟 IPC,这期间按钮还能点就会重复应答
  const [decided, setDecided] = useState<ApprovalDecision | null>(null)
  const [open, setOpen] = useState(false)
  const dropdown = useRef<HTMLDivElement>(null)

  // 点到别处 / 按 Esc 就收起下拉。不这么做,下拉会一直挂在那里挡住后面的内容
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
    <ActivityHeaderRow
      icon={
        isEdit ? (
          <ActivityPatchIcon aria-hidden className={ACTIVITY_ICON_CLASS} />
        ) : (
          <ActivityTerminalIcon aria-hidden className={ACTIVITY_ICON_CLASS} />
        )
      }
      summary={isEdit ? 'Apply these changes?' : 'Run this command?'}
      body={
        <div className="flex min-w-0 flex-col gap-2 pt-2">
          {reason && (
            <p className="text-size-chat text-token-conversation-summary-trailing">{reason}</p>
          )}
          {children}
          {decided == null && (
            <div className="flex items-center gap-1.5">
              <div className="relative flex items-center" ref={dropdown}>
                <button
                  type="button"
                  className={cx(BTN_BASE, BTN_PRIMARY, 'rounded-e-none')}
                  onClick={() => decide('accept')}
                >
                  Allow
                </button>
                <button
                  type="button"
                  className={cx(BTN_BASE, BTN_PRIMARY, 'rounded-s-none border-s-0 !px-1')}
                  aria-label="More approval options"
                  aria-expanded={open}
                  onClick={() => setOpen((v) => !v)}
                >
                  <SubmenuChevronIcon aria-hidden className="icon-2xs rotate-90" />
                </button>
                {open && (
                  <div
                    role="menu"
                    className="absolute top-full left-0 z-10 mt-1 min-w-max rounded-lg border border-token-border bg-token-dropdown-background p-1 shadow-md-strong"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className={cx(BTN_BASE, BTN_GHOST, 'w-full justify-start')}
                      onClick={() => decide('acceptForSession')}
                    >
                      Allow for this session
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                className={cx(BTN_BASE, BTN_SECONDARY)}
                onClick={() => decide('decline')}
              >
                Skip
              </button>
            </div>
          )}
        </div>
      }
    />
  )
}
