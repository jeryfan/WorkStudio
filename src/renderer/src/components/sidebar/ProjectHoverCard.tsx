import { useLayoutEffect, useRef, useState } from 'react'
import type { Project } from '../../services/workspace/types'
import { usePanels } from '../../state/PanelContext'
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
 * - 标题点击 = 打开项目 File tab（与点击项目行一致）
 * - chats 计数 = 工作区会话中属于该项目的数量（M3 接入真实会话后自动生效）
 * - 路径行 = 系统文件管理器打开项目根目录（shell:openProjectPath）
 * - marker / pin / Edit project 为设计占位，对应能力（项目标记、置顶、编辑对话框）
 *   尚未进入数据模型，接入前保持原型外观与 aria 语义
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
  const { openTab } = usePanels()
  const { chats } = useWorkspace()
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

  const openProject = (): void => {
    openTab('right', {
      kind: 'file',
      title: project.name,
      payload: { projectId: project.id }
    })
    onClose()
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${project.name} details`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-40 flex w-80 flex-col gap-1.5 break-words rounded-[10px] bg-surface p-2 text-[13px] leading-[18.57px] text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_6px_16px_rgb(0_0_0/0.08)]"
      style={{ left: pos.left, top: pos.top }}
    >
      {/* 顶部：标题 + chats，gap 4 */}
      <div className="flex min-w-0 flex-col gap-1">
        {/* 行 1：marker 按钮 + 项目名 + pin */}
        <div className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-1.5 rounded-md">
          <span className="flex h-5 w-4 shrink-0 items-center justify-center text-desc">
            <button
              type="button"
              aria-label={`Change marker for ${project.name}`}
              aria-haspopup="dialog"
              className="flex h-5 w-4 cursor-pointer items-center justify-center rounded-md border border-transparent hover:bg-row-hover"
            >
              <FolderIcon />
            </button>
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={openProject}
                  className="inline-block max-w-full min-w-0 cursor-pointer truncate rounded-md text-start text-[15px] font-medium leading-6 text-ink hover:bg-row-hover"
                >
                  {project.name}
                </button>
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
          <span className="flex h-5 w-4 shrink-0 items-center justify-center text-desc">
            <ChatBubbleIcon />
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 flex-1 flex-wrap text-[13px] leading-5 text-ink">
              <span className="whitespace-nowrap">{chatCount}&nbsp;chats</span>
            </span>
          </span>
        </div>
      </div>

      {/* 分割线区块 1：路径行 */}
      {rootPath && (
        <div className="flex min-w-0 flex-col gap-1 border-t border-menu-line pt-1.5">
          <button
            type="button"
            aria-label={`Open ${displayPath(rootPath)}`}
            onClick={() => {
              void window.api.openProjectPath(project.id)
              onClose()
            }}
            className="group/path grid w-full min-w-0 cursor-pointer grid-cols-[1rem_minmax(0,1fr)_1.25rem] items-center gap-x-1.5 rounded-md text-start hover:bg-row-hover"
          >
            <span className="flex h-5 w-4 shrink-0 items-center justify-center text-desc">
              <FolderIcon />
            </span>
            <span className="min-w-0 flex-1 break-all text-[13px] leading-5 text-ink">
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
      <div className="flex min-w-0 flex-col gap-1 border-t border-menu-line pt-1.5">
        <button
          type="button"
          aria-label="Edit project"
          className="grid w-full min-w-0 cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-1.5 rounded-md text-start hover:bg-row-hover"
        >
          <span className="flex h-5 w-4 shrink-0 items-center justify-center text-desc">
            <SettingsIcon />
          </span>
          <span className="inline-block min-w-0 truncate text-[13px] leading-5 text-ink">
            Edit project
          </span>
        </button>
      </div>
    </div>
  )
}
