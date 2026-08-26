import { useState, type ReactNode } from 'react'
import type { Project } from '../../services/workspace/types'
import { useOverlay } from '../../state/OverlayContext'
import { useWorkspace } from '../../state/WorkspaceContext'
import { ChatBubbleIcon, FolderIcon, PinIcon, RevealIcon, SettingsIcon, UnpinIcon } from '../icons'
import { cx } from '../../utils/cx'
import { hostAppInfo, hostServices } from '../../host/appHost'

/** 绝对路径缩写为 ~/… 展示(与 Codex 一致) */
function displayPath(absPath: string): string {
  const home = hostAppInfo()?.homeDir
  return home != null && absPath.startsWith(home) ? `~${absPath.slice(home.length)}` : absPath
}

/**
 * 项目悬浮卡片的**内容** —— 外壳归 `Tooltip variant="rich"`。
 *
 * 这一份不是照 bundle 猜的:Codex 的项目悬浮卡片在本机**能弹**(只有会话卡片
 * 被 `hoverCardProjectLabel == null` 关掉了),所以下面每个类名都是 hover
 * 项目行后从运行时 DOM 抄下来的。
 *
 * ```
 * div.flex.w-[min(21rem,calc(100vw-16px))].min-w-72.flex-col.gap-1.5.px-row-x.py-2.text-token-foreground
 * ├ div.flex.min-w-0.flex-col.gap-1                 头部块
 * │ ├ [row] marker 按钮 + 项目名(可改名) + Pin/Unpin(常驻!)
 * │ └ [row] «N tasks»(数字与 tasks 之间是 nbsp)
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

/**
 * 项目卡片的可改名标题 —— Codex 的 `GUc`,**与会话卡片的 `WNc` 不是一个组件**:
 *
 * - 静息按钮没有 `no-drag -ms-0.5 px-1.5`,但有 `max-w-full`(实测逐字);
 * - 编辑态 input 是 `h-6 w-full`(没有 `size` 属性、没有 `-ms-0.5`/`no-drag`),
 *   aria-label 是 "Project name"(WNc 的是 "Chat title")。
 *
 * 提交路径与 WNc 相同:Enter/失焦统一走 onBlur 提交,Escape 打
 * `dataset.cancelRename` 标记放弃;面板是 hover 打开的瞬时容器,
 * 三条路径都随面板关闭收场。
 */
function ProjectCardTitle({
  title,
  onRename
}: {
  title: string
  onRename(next: string): void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)

  const commit = (next: string): void => {
    const trimmed = next.trim()
    setEditing(false)
    if (trimmed.length === 0 || trimmed === title) {
      setValue(title)
      return
    }
    onRename(trimmed)
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="h-6 w-full min-w-0 rounded-md border border-token-focus-border bg-token-input-background px-1.5 text-base leading-6 font-medium text-token-input-foreground outline-none"
        value={value}
        aria-label="Project name"
        onBlur={(e) => {
          if (e.currentTarget.dataset.cancelRename === 'true') return
          commit(e.currentTarget.value)
        }}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === ' ') e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
            return
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            e.currentTarget.dataset.cancelRename = 'true'
            setValue(title)
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <button
      type="button"
      className="max-w-full min-w-0 cursor-interaction truncate rounded-md text-start text-base leading-6 font-medium text-token-foreground hover:bg-token-list-hover-background focus-visible:bg-token-list-hover-background focus-visible:outline-none"
      onClick={() => {
        setValue(title)
        setEditing(true)
      }}
    >
      {title}
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
            /*
             * marker 按钮 —— Codex 用的是完整 `th` Button(ghost/icon 尺寸)+
             * `!h-5 !w-4 !p-0` 覆写压回 20×16;aria-haspopup=dialog 指向
             * 外观选择弹层(改项目颜色/图标 —— WS 尚未实现这个弹层,
             * 按钮先保持只有外观)。
             */
            <button
              type="button"
              aria-label={`Change marker for ${project.name}`}
              aria-haspopup="dialog"
              aria-expanded={false}
              data-state="closed"
              className="no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-full electron:rounded-md text-token-foreground enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent electron:p-1 flex items-center justify-center p-0.5 h-7 w-7 rounded-md !p-1 !h-5 !w-4 !p-0"
            >
              <FolderIcon className="icon-xs shrink-0" />
            </button>
          }
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1">
              <ProjectCardTitle
                title={project.name}
                onRename={(next) => void renameProject(project.id, next)}
              />
            </span>
            {/* Codex 常驻这个按钮:置顶项目显示 Unpin project,未置顶显示 Pin project */}
            <button
              type="button"
              aria-label={isPinned ? 'Unpin project' : 'Pin project'}
              onClick={() => void setProjectPinned(project.id, !isPinned)}
              className="flex h-5 w-5 items-center justify-center leading-none sidebar-hover-icon-tint"
            >
              {isPinned ? (
                <UnpinIcon className="icon-2xs block shrink-0" />
              ) : (
                <PinIcon className="icon-2xs block shrink-0" />
              )}
            </button>
          </div>
        </ProjectHoverCardRow>

        <ProjectHoverCardRow icon={<ChatBubbleIcon className="icon-xs" />}>
          {/*
           * 计数用 "tasks" —— Codex 并非全局统一用 task:面向用户的动作文案
           * 仍是 chat(Pin chat / Archive chat / Start new chat in X),
           * 只有计数与内部模型叫 task。数字与 tasks 之间实测是 **nbsp**。
           */}
          <span className="flex min-w-0 flex-1 flex-wrap text-sm leading-5 text-token-foreground">
            <span className="whitespace-nowrap">{taskCount}&nbsp;tasks</span>
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
              onClick={() => void hostServices?.openIn.open({ path, target: 'fileManager' })}
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
