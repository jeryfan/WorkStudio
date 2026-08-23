import type { ReactNode } from 'react'
import type { Project } from '../../services/workspace/types'
import { useOverlay } from '../../state/OverlayContext'
import { useWorkspace } from '../../state/WorkspaceContext'
import { ChatBubbleIcon, FolderIcon, RevealIcon, SettingsIcon, UnpinIcon } from '../icons'
import { cx } from '../../utils/cx'
import { HoverCardTitle } from './HoverCardParts'

/** 绝对路径缩写为 ~/… 展示(与 Codex 一致) */
function displayPath(absPath: string): string {
  const home = window.api.homeDir
  return home && absPath.startsWith(home) ? `~${absPath.slice(home.length)}` : absPath
}

/**
 * 项目悬浮卡片的**内容** —— 外壳归 `Tooltip variant="rich"`。
 *
 * 这一份不是照 bundle 猜的:Codex 的项目悬浮卡片在本机**能弹**(只有会话卡片
 * 被 `hoverCardProjectLabel == null` 关掉了),所以下面每个类名都是 hover
 * 项目行 800ms 后从运行时 DOM 抄下来的,实测 320×130。
 *
 * ```
 * div.flex.w-[min(21rem,calc(100vw-16px))].min-w-72.flex-col.gap-1.5.px-row-x.py-2.text-token-foreground
 * ├ div.flex.min-w-0.flex-col.gap-1                 头部块
 * │ ├ [row] marker 按钮 + 项目名(可改名) + Unpin
 * │ └ [row] «N tasks»
 * ├ div.…border-t.border-token-border.pt-1.5        源目录块
 * │ └ [row button] 路径 + 尾部 reveal 图标(hover 才显)
 * └ div.…border-t.border-token-border.pt-1.5        Edit project
 * ```
 *
 * 注意宽度:内层写的是 21rem(336),但**外壳的 max-width 是 20rem(320)**,
 * 所以量出来永远是 320。两个值都要照抄 —— 只写 320 的话窗口窄到 <336 时
 * 收缩行为不一样。
 *
 * 行不是 flex 而是 **grid**,列宽 `[1rem_minmax(0,1fr)]`(带尾槽的那行是
 * `[1rem_minmax(0,1fr)_1.25rem]`)。用 flex 拼看着像,但图标列宽度会随内容浮动,
 * 三行的文字左边缘对不齐。
 */
const ROW_GRID = 'group/project-hover-card-row grid min-w-0 items-center gap-x-1.5 rounded-md'

function ProjectHoverCardRow({
  ariaLabel,
  children,
  icon,
  onClick,
  trailing
}: {
  ariaLabel?: string
  children: ReactNode
  icon: ReactNode
  onClick?(): void
  trailing?: ReactNode
}): React.JSX.Element {
  const cols =
    trailing == null ? 'grid-cols-[1rem_minmax(0,1fr)]' : 'grid-cols-[1rem_minmax(0,1fr)_1.25rem]'
  const body = (
    <>
      <span className="flex h-5 w-4 shrink-0 items-center justify-center text-token-description-foreground [&svg]:icon-xs">
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
      {trailing}
    </>
  )
  if (onClick == null) return <div className={cx(ROW_GRID, cols)}>{body}</div>
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cx(
        ROW_GRID,
        cols,
        'cursor-interaction text-start hover:bg-token-list-hover-background focus-visible:bg-token-list-hover-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'
      )}
    >
      {body}
    </button>
  )
}

export function ProjectHoverCard({ project }: { project: Project }): React.JSX.Element {
  const { chats, pinnedProjects, renameProject, setProjectPinned } = useWorkspace()
  const { setCreateProjectOpen } = useOverlay()
  const taskCount = chats.filter((c) => c.projectId === project.id).length
  const isPinned = pinnedProjects.some((p) => p.id === project.id)

  return (
    <div className="flex w-[min(21rem,calc(100vw-16px))] min-w-72 flex-col gap-1.5 px-row-x py-2 text-token-foreground">
      <div className="flex min-w-0 flex-col gap-1">
        <ProjectHoverCardRow
          icon={
            <button
              type="button"
              aria-label={`Change marker for ${project.name}`}
              aria-haspopup="dialog"
              className="no-drag flex h-5 w-4 cursor-interaction items-center justify-center rounded-md border border-transparent p-0.5 text-token-foreground select-none hover:bg-token-list-hover-background focus:outline-none data-[state=open]:bg-token-list-hover-background"
            >
              <FolderIcon className="icon-xs shrink-0" />
            </button>
          }
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1">
              <HoverCardTitle
                className="max-w-full truncate"
                title={project.name}
                titleValue={project.name}
                onRename={(next) => void renameProject(project.id, next)}
              />
            </span>
            {/* Codex 只在置顶项目上给 Unpin,未置顶项目这一格是空的 */}
            {isPinned && (
              <button
                type="button"
                aria-label="Unpin project"
                onClick={() => void setProjectPinned(project.id, false)}
                className="flex h-5 w-5 items-center justify-center leading-none sidebar-hover-icon-tint"
              >
                <UnpinIcon className="icon-2xs block shrink-0" />
              </button>
            )}
          </div>
        </ProjectHoverCardRow>

        <ProjectHoverCardRow icon={<ChatBubbleIcon className="icon-xs" />}>
          {/*
           * 计数用 "tasks" —— Codex 并非全局统一用 task:面向用户的动作文案
           * 仍是 chat(Pin chat / Archive chat / Start new chat in X),
           * 只有计数与内部模型叫 task。
           */}
          <span className="flex min-w-0 flex-1 flex-wrap text-sm leading-5 text-token-foreground">
            <span className="whitespace-nowrap">{taskCount} tasks</span>
          </span>
        </ProjectHoverCardRow>
      </div>

      {project.rootPaths.length > 0 && (
        <div className="flex min-w-0 flex-col gap-1 border-t border-token-border pt-1.5">
          {project.rootPaths.map((path) => (
            <ProjectHoverCardRow
              key={path}
              ariaLabel={`Open ${displayPath(path)}`}
              icon={<FolderIcon />}
              onClick={() => void window.api.openProjectPath(project.id)}
              trailing={
                <span className="flex h-5 w-5 items-center justify-center opacity-0 sidebar-hover-icon-tint group-hover/project-hover-card-row:opacity-100 group-focus-visible/project-hover-card-row:opacity-100">
                  <RevealIcon aria-hidden="true" className="icon-2xs" />
                </span>
              }
            >
              <span className="flex min-w-0 items-baseline text-sm leading-5">
                <span className="min-w-0 flex-1 break-all text-token-foreground">
                  {displayPath(path)}
                </span>
              </span>
            </ProjectHoverCardRow>
          ))}
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-1 border-t border-token-border pt-1.5">
        <ProjectHoverCardRow
          ariaLabel="Edit project"
          icon={<SettingsIcon className="icon-xs" />}
          onClick={() => setCreateProjectOpen(true)}
        >
          <span className="min-w-0 truncate text-sm leading-5 text-token-foreground">
            Edit project
          </span>
        </ProjectHoverCardRow>
      </div>
    </div>
  )
}
