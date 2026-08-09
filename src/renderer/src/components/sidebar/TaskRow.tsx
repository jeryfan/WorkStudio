import type { TaskItem } from '../../services/workspace/types'
import { ArchiveIcon, PinIcon, UnpinIcon } from '../icons'

interface TaskRowProps {
  task: TaskItem
}

/**
 * sider/2.html .task-row（第 407-555 行）：
 * - hover 灰底；右侧时间 / 未读点 hover 时隐藏
 * - 悬浮操作（置顶/归档）从右侧淡入
 * - pinned 任务 cursor: grab
 */
export function TaskRow({ task }: TaskRowProps): React.JSX.Element {
  const { title, timeAgo, unread, pinned } = task
  return (
    <div
      className="group relative flex h-[30px] items-center gap-2 rounded-row px-2 text-sm"
      style={{ cursor: pinned ? 'grab' : 'pointer' }}
    >
      {/* hover actions */}
      <div className="absolute right-0 top-0 z-10 mr-0.5 flex h-full w-[52px] items-center justify-end gap-2 pr-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
        <button
          type="button"
          title={pinned ? 'Unpin task' : 'Pin task'}
          className="flex size-5 shrink-0 items-center justify-center rounded text-ink-50 hover:text-ink [&_svg]:size-4"
        >
          {pinned ? <UnpinIcon /> : <PinIcon />}
        </button>
        <button
          type="button"
          title="Archive task"
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
          {unread ? (
            <span className="-mr-1 flex size-5 shrink-0 items-center justify-center group-hover:hidden">
              <span className="size-2 rounded-full bg-focus" />
            </span>
          ) : (
            timeAgo && (
              <span className="truncate text-right text-[13px] leading-[18px] text-desc [font-variant-numeric:tabular-nums] group-hover:hidden">
                {timeAgo}
              </span>
            )
          )}
        </div>
      </div>
    </div>
  )
}
