import { useLayoutEffect, useRef, useState } from 'react'
import type { Project } from '../../services/workspace/types'
import { useWorkspace } from '../../state/WorkspaceContext'
import { ChatBubbleIcon, ExternalLinkIcon, FolderIcon, PinIcon, SettingsIcon } from '../icons'

interface ProjectHoverCardProps {
  project: Project
  /** 项目行的 getBoundingClientRect()，卡片显示在其右侧 */
  anchor: DOMRect
  onMouseEnter(): void
  onMouseLeave(): void
  onClose(): void
}

/** 绝对路径缩写为 ~/… 展示（与 prototype 一致） */
function displayPath(absPath: string): string {
  const home = window.api.homeDir
  return home && absPath.startsWith(home) ? `~${absPath.slice(home.length)}` : absPath
}

/**
 * 项目悬浮卡片（prototype/project/hover.html）：
 * 鼠标悬停项目行时在右侧弹出，320 宽、10px 圆角、双边框阴影。
 * fixed 定位 + 视口边缘防溢出，与 DropdownMenu 同一套定位策略。
 *
 * 数据接线现状：
 * - 标题点击 = 进入内联改名（Codex 的行为；打开项目走点击项目行本身）
 * - chats 计数 = 工作区会话中属于该项目的数量（M3 接入真实会话后自动生效）
 * - 路径行 = 系统文件管理器打开项目根目录（shell:openProjectPath）
 * - marker / pin 为设计占位，对应能力尚未进入数据模型，接入前保持 aria 语义
 * - Edit project 打开编辑弹窗
 */
export function ProjectHoverCard({
  project,
  anchor,
  onMouseEnter,
  onMouseLeave,
  onClose
}: ProjectHoverCardProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: anchor.right + 6, top: anchor.top })
  const { chats, renameProject } = useWorkspace()

  /*
   * 内联改名。三种收尾方式实测自 Codex,行为一致:
   *   Enter / 点面板外 / Escape  →  退出编辑 **并关闭整个面板**
   * 没有"提交后留在面板里"的中间态 —— 面板是 hover 打开的瞬时容器,
   * 任何确定性操作都终结它。所以下面三条路径都调 onClose()。
   */
  const [draft, setDraft] = useState<string | null>(null)
  const editing = draft !== null

  const commitRename = (): void => {
    const next = (draft ?? '').trim()
    if (next && next !== project.name) void renameProject(project.id, next)
    setDraft(null)
    onClose()
  }
  const chatCount = chats.filter((t) => t.projectId === project.id).length
  const rootPath = project.rootPaths[0] ?? ''

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let { left, top } = pos
    if (left + rect.width > window.innerWidth - 8) {
      // 右侧放不下时翻到行的左侧
      left = Math.max(8, anchor.left - rect.width - 6)
    }
    if (top + rect.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - rect.height - 8)
    }
    if (left !== pos.left || top !== pos.top) setPos({ left, top })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${project.name} details`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      /*
       * 容器规格实测自 Codex(320×130):
       *   overlay-light  圆角 15px + blur(8px)
       *   底色 token-dropdown-background/90,**无 border** —— 边缘靠 shadow 的 ring
       * 原来是 10px 圆角 + 不透明底 + 1px ring,比 Codex 硬。
       */
      className="overlay-light fixed z-40 flex w-80 select-none flex-col gap-1.5 break-words bg-token-dropdown-background/90 p-2 text-sm leading-[18.57px] text-token-foreground shadow-[0_0_0_0.5px_rgb(26_28_31/0.08),0_8px_16px_-4px_rgb(0_0_0/0.12)]"
      style={{ left: pos.left, top: pos.top }}
    >
      {/* 顶部：标题 + chats，gap 4 */}
      <div className="flex min-w-0 flex-col gap-1">
        {/* 行 1：marker 按钮 + 项目名 + pin */}
        <div className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-1.5 rounded-md">
          <span className="flex h-5 w-4 shrink-0 items-center justify-center text-token-description-foreground">
            <button
              type="button"
              aria-label={`Change marker for ${project.name}`}
              aria-haspopup="dialog"
              className="flex h-5 w-4 cursor-pointer items-center justify-center rounded-md border border-transparent hover:bg-token-list-hover-background"
            >
              <FolderIcon />
            </button>
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="min-w-0 flex-1">
                {editing ? (
                  /*
                   * 输入框规格实测自 Codex:h-6 / 圆角 10px / 14px·500 /
                   * border 用 token-focus-border(聚焦蓝)/ bg-token-input-background /
                   * outline-none —— 编辑态本身就是聚焦态的视觉表达,不再叠 outline。
                   * autoFocus 后全选:直接打字是替换而非追加。
                   */
                  <input
                    aria-label="Project name"
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
                    onClick={() => setDraft(project.name)}
                    className="inline-block max-w-full min-w-0 cursor-interaction truncate rounded-md text-start text-base font-medium leading-6 text-token-foreground hover:bg-token-list-hover-background"
                  >
                    {project.name}
                  </button>
                )}
              </span>
              <button
                type="button"
                aria-label="Pin project"
                className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#a3a3a3] hover:text-[#6f6f6f] [&_svg]:size-3.5"
              >
                <PinIcon />
              </button>
            </span>
          </span>
        </div>

        {/* 行 2：chats 计数 */}
        <div className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-1.5 rounded-md">
          <span className="flex h-5 w-4 shrink-0 items-center justify-center text-token-description-foreground">
            <ChatBubbleIcon />
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 flex-1 flex-wrap text-[13px] leading-5 text-token-foreground">
              {/*
               * 措辞按 Codex 实测:计数用 "tasks"。
               * 注意它并非全局统一用 task —— 面向用户的动作文案仍是 chat
               * (Pin chat / Archive chat / Start new chat in X / Chat sidebar options),
               * 只有计数和内部模型叫 task。所以这里只改这一处。
               */}
              <span className="whitespace-nowrap">{chatCount}&nbsp;tasks</span>
            </span>
          </span>
        </div>
      </div>

      {/* 分割线区块 1：路径行 */}
      {rootPath && (
        <div className="flex min-w-0 flex-col gap-1 border-t border-token-menu-border pt-1.5">
          <button
            type="button"
            aria-label={`Open ${displayPath(rootPath)}`}
            onClick={() => {
              void window.api.openProjectPath(project.id)
              onClose()
            }}
            className="group/path grid w-full min-w-0 cursor-pointer grid-cols-[1rem_minmax(0,1fr)_1.25rem] items-center gap-x-1.5 rounded-md text-start hover:bg-token-list-hover-background"
          >
            <span className="flex h-5 w-4 shrink-0 items-center justify-center text-token-description-foreground">
              <FolderIcon />
            </span>
            <span className="min-w-0 flex-1 break-all text-[13px] leading-5 text-token-foreground">
              {displayPath(rootPath)}
            </span>
            <span
              aria-hidden="true"
              className="flex size-5 items-center justify-center text-[#a3a3a3] opacity-0 group-hover/path:opacity-100"
            >
              <ExternalLinkIcon />
            </span>
          </button>
        </div>
      )}

      {/* 分割线区块 2：Edit project 行 */}
      <div className="flex min-w-0 flex-col gap-1 border-t border-token-menu-border pt-1.5">
        <button
          type="button"
          aria-label="Edit project"
          className="grid w-full min-w-0 cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-1.5 rounded-md text-start hover:bg-token-list-hover-background"
        >
          <span className="flex h-5 w-4 shrink-0 items-center justify-center text-token-description-foreground">
            <SettingsIcon />
          </span>
          <span className="inline-block min-w-0 truncate text-[13px] leading-5 text-token-foreground">
            Edit project
          </span>
        </button>
      </div>
    </div>
  )
}
