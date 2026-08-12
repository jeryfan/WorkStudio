import type { ChatSummary } from '../../services/chat/types'
import { useWorkspace } from '../../state/WorkspaceContext'
import { useChatRuntime } from '../../state/ChatRuntimeContext'
import { formatRelativeTime } from '../../utils/time'
import { ArchiveIcon, PinIcon, UnpinIcon } from '../icons'

interface ChatRowProps {
  chat: ChatSummary
}

/**
 * 侧栏会话行（sider/2.html 原型中的 .task-row）：
 * - hover 灰底；右侧时间 / 未读点 hover 时隐藏
 * - 悬浮操作（置顶/归档）从右侧淡入
 * - 置顶项 cursor: grab（可拖拽排序）
 */
export function ChatRow({ chat }: ChatRowProps): React.JSX.Element {
  const { setChatPinned, archiveChat } = useWorkspace()
  const { openChat, activeChatId } = useChatRuntime()
  const { id, title, updatedAt, pinned, status } = chat
  const timeAgo = formatRelativeTime(updatedAt)

  // 运行中的会话给一个状态点，让用户知道后台还在干活
  const running = status.type === 'active'
  const errored = status.type === 'systemError'
  const awaitingApproval =
    status.type === 'active' && status.activeFlags.some((f) => String(f).includes('pproval'))

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openChat(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openChat(id)
        }
      }}
      className={`group relative flex h-[30px] items-center gap-2 rounded-row px-2 text-sm hover:bg-row-hover ${
        activeChatId === id ? 'bg-row-hover' : ''
      }`}
      style={{ cursor: pinned ? 'grab' : 'pointer' }}
    >
      {/* hover actions */}
      <div className="absolute right-0 top-0 z-10 mr-0.5 flex h-full w-[52px] items-center justify-end gap-2 pr-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
        <button
          type="button"
          title={pinned ? 'Unpin chat' : 'Pin chat'}
          onClick={(e) => {
            e.stopPropagation()
            void setChatPinned(id, !pinned)
          }}
          className="flex size-5 shrink-0 items-center justify-center rounded text-ink-50 hover:text-ink [&_svg]:size-4"
        >
          {pinned ? <UnpinIcon /> : <PinIcon />}
        </button>
        <button
          type="button"
          title="Archive chat"
          onClick={(e) => {
            e.stopPropagation()
            void archiveChat(id)
          }}
          className="flex size-5 shrink-0 items-center justify-center rounded text-ink-50 hover:text-ink [&_svg]:size-4"
        >
          <ArchiveIcon />
        </button>
      </div>

      {/* content */}
      <div className="flex h-full w-full items-center text-sm leading-5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {!pinned && <div className="flex w-4 shrink-0 items-center justify-center" />}
          <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch text-ink">
            <span className="min-w-0 flex-1 select-none truncate">{title}</span>
          </div>
        </div>
        <div className="ml-[3px] flex min-w-[26px] items-center justify-end gap-1 transition-[min-width] duration-150 group-hover:min-w-12">
          {running || errored ? (
            <span
              className="-mr-1 flex size-5 shrink-0 items-center justify-center group-hover:hidden"
              title={
                errored ? 'Stopped with an error' : awaitingApproval ? 'Waiting for you' : 'Running'
              }
            >
              <span
                className={`size-2 rounded-full ${
                  errored
                    ? 'bg-red-500'
                    : awaitingApproval
                      ? 'bg-amber-500'
                      : 'animate-pulse bg-focus'
                }`}
              />
            </span>
          ) : (
            <span className="truncate text-right text-[13px] leading-[18px] text-desc [font-variant-numeric:tabular-nums] group-hover:hidden">
              {timeAgo}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
