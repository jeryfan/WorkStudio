import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Project } from '../../services/workspace/types'
import { useOverlay } from '../../state/OverlayContext'
import { usePanels } from '../../state/PanelContext'
import { useChatRuntime } from '../../state/ChatRuntimeContext'
import { useWorkspace } from '../../state/WorkspaceContext'
import { DotsIcon, NewChatIcon, OpenFolderIcon } from '../icons'
import { IconButtonSm } from './SectionHeader'
import { ChatRow } from './ChatRow'
import { ProjectHoverCard } from './ProjectHoverCard'

interface ProjectRowProps {
  project: Project
}

/** 悬浮卡片的打开/关闭延迟：留出滑向卡片的余量，避免划过即闪 */
const HOVER_OPEN_DELAY = 250
const HOVER_CLOSE_DELAY = 200

/**
 * sider/2.html .project-row（第 558-713 行）：
 * - 点击行：在右侧面板打开该项目的 File tab
 * - 点击文件夹图标：展开/收起该项目任务列表
 * - hover：右侧操作按钮（项目菜单 / 新建任务）淡入
 * - 展开时下方渲染 .project-tasks 嵌套会话列表
 */
export function ProjectRow({ project }: ProjectRowProps): React.JSX.Element {
  const { projectExpanded, toggleProject, chatsOfProject, selectProject } = useWorkspace()
  const { menu, openMenu } = useOverlay()
  const { openTab } = usePanels()
  const { closeChat } = useChatRuntime()
  const expanded = projectExpanded[project.id] ?? true
  const chats = chatsOfProject(project.id)
  // 该项目下有会话在跑时，项目行给一个进行态指示
  const busy = chats.some((c) => c.status.type === 'active')
  // 该项目菜单打开期间，保持行的悬浮外观（鼠标已在菜单上，:hover 会丢失）
  const actionsOpen = menu?.id === 'project-actions' && menu.projectId === project.id

  // —— 悬浮卡片（prototype/project/hover.html）：hover 行延迟打开，可滑入卡片 ——
  const rowRef = useRef<HTMLDivElement>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [cardAnchor, setCardAnchor] = useState<DOMRect | null>(null)

  const clearHoverTimers = (): void => {
    if (openTimer.current) clearTimeout(openTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    openTimer.current = null
    closeTimer.current = null
  }

  const scheduleCardOpen = (): void => {
    clearHoverTimers()
    openTimer.current = setTimeout(() => {
      const rect = rowRef.current?.getBoundingClientRect()
      if (rect) setCardAnchor(rect)
    }, HOVER_OPEN_DELAY)
  }

  const scheduleCardClose = (): void => {
    clearHoverTimers()
    closeTimer.current = setTimeout(() => setCardAnchor(null), HOVER_CLOSE_DELAY)
  }

  const closeCard = (): void => {
    clearHoverTimers()
    setCardAnchor(null)
  }

  // 卸载时清掉未触发的延迟
  useEffect(() => clearHoverTimers, [])

  // 任一菜单打开时卡片让位（菜单有全屏遮罩，卡片会被压在下面）
  useEffect(() => {
    if (!menu) return
    clearHoverTimers()
    // 菜单开合是外部事件，不是渲染派生
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCardAnchor(null)
  }, [menu])

  // 卡片显示期间：侧栏滚动 / 窗口缩放 / Escape 都会让锚点失效，直接关闭
  useEffect(() => {
    if (!cardAnchor) return
    const close = (): void => setCardAnchor(null)
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('scroll', close, { capture: true })
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', close, { capture: true })
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [cardAnchor])

  return (
    <div className="relative flex flex-col" role="listitem" aria-label={project.name}>
      {/* 拖放区（原型保留的占位，pointer-events-none） */}
      <div className="pointer-events-none absolute bottom-0 left-0 top-[30px] z-10 w-8" />

      <div
        ref={rowRef}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onMouseEnter={() => {
          if (!menu) scheduleCardOpen()
        }}
        onMouseLeave={scheduleCardClose}
        onClick={() =>
          openTab('right', {
            kind: 'file',
            title: project.name,
            payload: { projectId: project.id }
          })
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openTab('right', {
              kind: 'file',
              title: project.name,
              payload: { projectId: project.id }
            })
          }
        }}
        className={`group relative flex h-[30px] w-full cursor-pointer items-center justify-between overflow-hidden rounded-row text-left text-sm text-ink hover:bg-row-hover ${
          actionsOpen ? 'bg-row-hover' : ''
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 pl-1">
          <button
            type="button"
            aria-label={expanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
            onClick={(e) => {
              e.stopPropagation()
              toggleProject(project.id)
            }}
            className="-mx-[3px] flex size-[30px] shrink-0 items-center justify-center [&_svg]:size-4"
          >
            <OpenFolderIcon />
          </button>
          <div className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md py-1 text-left text-sm text-ink">
            <span className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap">
              <span className="flex min-w-0 flex-1 items-center gap-0.5">
                <span className="truncate pr-1">{project.name}</span>
              </span>
            </span>
          </div>
        </div>

        <div className="flex min-w-0 max-w-1/2 items-center gap-1">
          {busy && (
            <span
              title={`Running in ${project.name}`}
              className="mr-0.5 size-1.5 shrink-0 animate-pulse rounded-full bg-focus group-hover:hidden"
            />
          )}
          <div
            className={`transition-opacity duration-100 ${
              actionsOpen
                ? 'w-auto overflow-visible opacity-100'
                : 'w-0 overflow-hidden opacity-0 group-hover:w-auto group-hover:overflow-visible group-hover:opacity-100'
            }`}
          >
            <IconButtonSm
              title={`Project actions for ${project.name}`}
              onClick={(e) => {
                e.stopPropagation()
                openMenu({
                  id: 'project-actions',
                  anchor: e.currentTarget.getBoundingClientRect(),
                  projectId: project.id
                })
              }}
            >
              <DotsIcon />
            </IconButtonSm>
          </div>
          <div
            className={`mr-0.5 grid h-6 max-w-48 shrink-0 grid-cols-[1fr] items-center transition-[min-width] duration-100 ${
              actionsOpen ? 'min-w-6' : 'min-w-0 group-hover:min-w-6'
            }`}
          >
            <span
              className={`col-start-1 row-start-1 inline-flex justify-self-end transition-opacity duration-100 ${
                actionsOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <IconButtonSm
                title={`New chat in ${project.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  // 从项目发起的新会话默认落在该项目里：先切选中项，
                  // 再回到首页——输入框的项目 pill 读的就是选中项
                  void selectProject({ type: 'project', projectId: project.id })
                  closeChat()
                }}
              >
                <NewChatIcon />
              </IconButtonSm>
            </span>
          </div>
        </div>
      </div>

      {cardAnchor &&
        createPortal(
          <ProjectHoverCard
            project={project}
            anchor={cardAnchor}
            onMouseEnter={clearHoverTimers}
            onMouseLeave={scheduleCardClose}
            onClose={closeCard}
          />,
          document.body
        )}

      {expanded && (
        <div className="pb-2 pt-0.5">
          <div className="relative isolate flex flex-col [contain:layout]">
            {chats.length === 0 ? (
              <div className="px-2 py-1 text-sm text-[#a6a6ab]">No chats</div>
            ) : (
              chats.map((c) => <ChatRow key={c.id} chat={c} />)
            )}
          </div>
        </div>
      )}
    </div>
  )
}
