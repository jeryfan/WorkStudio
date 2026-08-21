import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Project } from '../../services/workspace/types'
import { useOverlay } from '../../state/OverlayContext'
import { usePanels } from '../../state/PanelContext'
import { useChatRuntime } from '../../state/ChatRuntimeContext'
import { useWorkspace } from '../../state/WorkspaceContext'
import { DotsIcon, NewChatIcon, OpenFolderIcon } from '../icons'
import { IconButtonSm } from './SectionHeader'
import { SidebarThreadRow } from './SidebarThreadRow'
import { ProjectHoverCard } from './ProjectHoverCard'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { projectDragId } from './SortableProjects'

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
export function SidebarProjectRow({ project }: ProjectRowProps): React.JSX.Element {
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

  /*
   * 可拖单元与把手分开:
   *   setNodeRef        → 外层包装(整组:项目行 + 其下会话),所以拖拽副本是整组
   *   setActivatorNodeRef → 项目行本身,只有它能起手拖拽
   * 合在一起的话,点子会话也会被当成拖拽起手,会话点击就失灵了。
   */
  const sortable = useSortable({ id: projectDragId(project.id) })
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
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        // 被拖的那一份在原位淡出,副本由 DragOverlay 渲染
        opacity: sortable.isDragging ? 0.4 : undefined
      }}
      className="relative flex flex-col"
      role="listitem"
      aria-label={project.name}
    >
      {/* 拖放区（原型保留的占位，pointer-events-none） */}
      <div className="pointer-events-none absolute bottom-0 left-0 top-[30px] z-10 w-8" />

      <div
        ref={(el) => {
          rowRef.current = el
          sortable.setActivatorNodeRef(el)
        }}
        {...sortable.attributes}
        {...sortable.listeners}
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
        /*
         * 悬浮卡片打开时也要保持行高亮。
         *
         * 卡片渲染在行外面(浮层),鼠标滑进卡片的那一刻行就失去 :hover,
         * 高亮消失 —— 视觉上像是"离开了这个项目",但卡片还开着,自相矛盾。
         * 菜单那条路径本来就这么处理的(actionsOpen),卡片这条漏了。
         */
        aria-label={project.name}
        data-app-action-sidebar-project-row=""
        data-app-action-sidebar-project-id={project.id}
        data-app-action-sidebar-project-label={project.name}
        data-app-action-sidebar-project-collapsed={expanded ? 'false' : 'true'}
        /*
         * 命名 group 用 /folder-row —— 行内操作按钮靠它显现。用匿名 group 会和
         * 嵌套的会话行的 group 串在一起:hover 项目行时子会话的操作也会亮。
         * 高度走 token,光标用 Codex 的 cursor-interaction。
         */
        className={`sidebar-item group/folder-row group relative flex h-[var(--height-token-row)] w-full cursor-interaction items-center justify-between overflow-hidden text-sm text-token-foreground hover:bg-token-list-hover-background focus-visible:outline focus-visible:outline-offset-2 ${
          actionsOpen || cardAnchor ? 'bg-token-list-hover-background' : ''
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 pl-1">
          {/*
           * 图标位同时是 DnD 放置区(Codex 用 data-sidebar-project-drop-zone 标记),
           * 尺寸走 --height-token-row 与行等高,svg 用 icon-xs(16px)。
           */}
          <button
            type="button"
            aria-label={expanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
            data-sidebar-project-drop-zone="project-icon"
            data-sidebar-project-kind="local"
            onClick={(e) => {
              e.stopPropagation()
              toggleProject(project.id)
            }}
            className="-mx-[3px] flex size-[var(--height-token-row)] shrink-0 items-center justify-center [&_svg]:icon-xs"
          >
            <OpenFolderIcon />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap rounded-md py-1 pe-0 text-start text-base text-token-foreground">
            <span className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap">
              <span className="flex min-w-0 flex-1 items-center gap-0.5">
                <span className="truncate pr-1">{project.name}</span>
              </span>
            </span>
          </div>
        </div>

        <div className="flex max-w-[50%] min-w-0 gap-1">
          {/* 静态圆点,不加 animate-pulse —— 与会话行一致(Codex 的状态点无动画) */}
          {busy && (
            <span
              title={`Running in ${project.name}`}
              className="me-0.5 size-2 shrink-0 rounded-full group-hover/folder-row:hidden"
              style={{ backgroundColor: 'var(--vscode-textLink-foreground)' }}
            />
          )}
          <div
            className={`transition-opacity duration-100 ${
              actionsOpen
                ? 'w-auto overflow-visible opacity-100'
                : 'w-0 overflow-hidden opacity-0 group-hover/folder-row:w-auto group-hover/folder-row:overflow-visible group-hover/folder-row:opacity-100 focus-within:w-auto focus-within:overflow-visible focus-within:opacity-100'
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
              actionsOpen ? 'min-w-6' : 'min-w-0 group-hover/folder-row:w-6'
            }`}
          >
            <span
              className={`col-start-1 row-start-1 inline-flex justify-self-end transition-opacity duration-100 ${
                actionsOpen ? 'opacity-100' : 'opacity-0 group-hover/folder-row:opacity-100'
              }`}
            >
              <IconButtonSm
                title={`Start new chat in ${project.name}`}
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

        {/*
         * 隐藏的"选中该项目"入口 —— Codex 每个项目行末尾都有一个
         * button.sr-only[aria-hidden][data-app-action-sidebar-select-project]。
         * 视觉上不可见(1×1),但给屏幕阅读器和自动化留了明确的动作锚点。
         */}
        <button
          type="button"
          aria-hidden="true"
          data-app-action-sidebar-select-project=""
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            void selectProject({ type: 'project', projectId: project.id })
          }}
          className="sr-only"
        />
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
              chats.map((c) => <SidebarThreadRow key={c.id} chat={c} />)
            )}
          </div>
        </div>
      )}
    </div>
  )
}
