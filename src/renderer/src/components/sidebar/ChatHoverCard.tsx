import { useLayoutEffect, useRef, useState } from 'react'
import type { ChatSummary } from '../../services/chat/types'
import { useWorkspace } from '../../state/WorkspaceContext'
import { formatRelativeTime } from '../../utils/time'
import { BranchIcon, FolderIcon } from '../icons'

interface ChatHoverCardProps {
  chat: ChatSummary
  /** 会话行的 getBoundingClientRect()，卡片显示在其右侧 */
  anchor: DOMRect
  onMouseEnter(): void
  onMouseLeave(): void
  onClose(): void
}

/**
 * 会话悬浮卡片 —— 规格实测自 Codex(224×86)。
 *
 * 和项目卡片同属 overlay-light 层级(15px 圆角 + blur(8px) + 90% 底色 + 无描边),
 * 但**宽度体系不同**:项目卡片固定 320,这个是内容自适应 ——
 *   w-fit  min-w-56(224)  max-w-[min(20rem,calc(100vw-16px))](320 上限,且留 8px 边距)
 *
 * 三行:
 *   1. 标题按钮(改名触发器)+ 相对时间
 *   2. 所属项目
 *   3. git 分支
 *
 * 注意相对时间在这里出现 —— Codex 把时间从会话行里移到了卡片中,行内只留标题。
 * 所以"Codex 不显示时间"是错的说法,准确是"不在行内显示"。
 *
 * 内联改名的三种收尾都关闭整个卡片(与项目卡片一致,实测行为):
 * Enter / 失焦 / Escape —— 卡片是 hover 打开的瞬时容器,确定性操作即终结它。
 */
export function ChatHoverCard({
  chat,
  anchor,
  onMouseEnter,
  onMouseLeave,
  onClose
}: ChatHoverCardProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: anchor.right + 6, top: anchor.top })
  const { projects, renameChat } = useWorkspace()
  const project = projects.find((p) => p.id === chat.projectId)

  const [draft, setDraft] = useState<string | null>(null)
  const editing = draft !== null

  const commitRename = (): void => {
    const next = (draft ?? '').trim()
    if (next && next !== chat.title) void renameChat(chat.id, next)
    setDraft(null)
    onClose()
  }

  // 视口边缘防溢出，与 DropdownMenu 同一套策略
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let left = anchor.right + 6
    let top = anchor.top
    if (left + rect.width > window.innerWidth - 8) {
      left = Math.max(8, anchor.left - rect.width - 6)
    }
    if (top + rect.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - rect.height - 8)
    }
    setPos({ left, top })
  }, [anchor])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${chat.title} details`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="overlay-light fixed z-40 m-px flex w-fit min-w-56 max-w-[min(20rem,calc(100vw-16px))] select-none flex-col whitespace-normal break-words bg-token-dropdown-background/90 p-2 text-sm text-token-foreground shadow-[0_0_0_0.5px_rgb(26_28_31/0.08),0_8px_16px_-4px_rgb(0_0_0/0.12)]"
      style={{ left: pos.left, top: pos.top }}
    >
      {/* 行 1：标题 + 相对时间 */}
      <div className="flex min-w-0 flex-col gap-1 pb-0.5">
        <div className="flex w-full min-w-0 items-center gap-3">
          {editing ? (
            <input
              aria-label="Chat name"
              value={draft ?? ''}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitRename()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setDraft(null)
                  onClose()
                }
              }}
              className="h-6 w-full min-w-0 rounded-md border border-token-focus-border bg-token-input-background px-1.5 text-base font-medium leading-6 text-token-input-foreground outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setDraft(chat.title)}
              className="no-drag -ms-0.5 min-w-0 cursor-interaction truncate rounded-md px-0.5 text-start text-base font-medium leading-6 text-token-foreground hover:bg-token-list-hover-background"
            >
              {chat.title}
            </button>
          )}
          {!editing && (
            <span className="shrink-0 text-sm leading-5 text-token-description-foreground [font-variant-numeric:tabular-nums]">
              {formatRelativeTime(chat.updatedAt)}
            </span>
          )}
        </div>
      </div>

      {/* 行 2：所属项目 */}
      {project && (
        <div className="flex h-5 min-w-0 items-center gap-1.5 text-sm leading-5 text-token-description-foreground">
          <FolderIcon className="icon-xs shrink-0" />
          <span className="block min-w-0 flex-1 overflow-hidden text-ellipsis leading-5">
            {project.name}
          </span>
        </div>
      )}

      {/* 行 3：git 分支 */}
      {chat.gitBranch && (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex h-5 min-w-0 items-center gap-1.5 text-sm leading-5 text-token-description-foreground">
            <BranchIcon className="icon-xs shrink-0" />
            <span className="block min-w-0 flex-1 overflow-hidden text-ellipsis leading-5">
              {chat.gitBranch}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
