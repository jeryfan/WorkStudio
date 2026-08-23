import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { projectItemKey, threadItemKey, parseItemKey } from '@shared/workspace/types'
import type { Project } from '../../services/workspace/types'
import type { ChatSummary } from '../../services/chat/types'
import { useWorkspace } from '../../state/WorkspaceContext'
import { ChatBubbleIcon, FolderIcon } from '../icons'
import {
  canMoveThread,
  chatIdFromDragId,
  containerDroppableId,
  missingProjectSources,
  moveKey,
  sidebarCollisionDetection,
  type DragData,
  type PendingThreadMove,
  type SidebarContainerId
} from './sidebarDndModel'

/**
 * 侧栏拖拽的组件层 —— **一个** DndContext 管四类操作:
 * 项目排序、会话排序、会话跨项目、会话与 Recents 互移。
 * id 命名与落点规则见 ./sidebarDnd.ts(那里记着实测依据)。
 *
 * `activationConstraint: { distance: 6 }` —— 不设的话点行就被当成起手拖拽,
 * 行的点击直接失灵。这个 6px 是 Codex 的实测值(bundle 里出现 4 次)。
 */

/** 拖拽中的项;`null` = 没在拖 */
type ActiveDrag =
  { kind: 'project'; project: Project } | { kind: 'thread'; chat: ChatSummary } | null

/**
 * 项目图标落区 —— Codex 用 `data-sidebar-project-drop-zone="project-icon"` 标记。
 *
 * 它存在的理由是**折叠的项目**:会话列表没渲染,`project:<id>` 容器落点也就
 * 不存在,只能靠这个图标接住"拖进这个项目"。展开时它与会话列表落点并存,
 * pointerWithin 会优先命中更精确的那个。
 */
export function ProjectIconDropZone({
  children,
  projectId
}: {
  children: ReactNode
  projectId: string
}): React.JSX.Element {
  const containerId: SidebarContainerId = `project:${projectId}`
  const { setNodeRef } = useDroppable({
    id: `project-icon:${projectId}`,
    data: {
      kind: 'sidebar-thread-container',
      containerId,
      projectId,
      projectDropZone: 'project-icon'
    } satisfies DragData
  })
  return (
    <span
      ref={setNodeRef}
      data-sidebar-project-drop-zone="project-icon"
      data-sidebar-project-kind="local"
      className="-mx-[3px] flex size-[var(--height-token-row)] shrink-0 items-center justify-center"
    >
      {children}
    </span>
  )
}

/** 容器落点 —— 空列表也要能接住,所以落点挂在容器而不是行上 */
export function SidebarThreadContainer({
  containerId,
  children,
  className,
  projectId
}: {
  containerId: SidebarContainerId
  children: ReactNode
  className?: string
  projectId?: string
}): React.JSX.Element {
  const { setNodeRef } = useDroppable({
    id: containerDroppableId(containerId),
    data: { kind: 'sidebar-thread-container', containerId, projectId } satisfies DragData
  })
  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  )
}

/** 一个可排序列表的作用域 —— items 必须是这一段的 itemKey 顺序 */
export function SidebarSortableScope({
  items,
  children
}: {
  items: string[]
  children: ReactNode
}): React.JSX.Element {
  // 不用 verticalListSortingStrategy:Pinned 里项目组高度不等(展开时带会话),
  // 等高假设会让位移算错。默认策略按实际 rect 走。
  return <SortableContext items={items}>{children}</SortableContext>
}

/**
 * 拖拽副本 —— 实测 Codex 不是把行原样克隆,而是一张专门的预览卡:
 *
 * ```
 * div.relative.flex.w-fit.max-w-80.flex-col.gap-1
 * └ div.sidebar-item.overflow-hidden.border.border-token-border.bg-token-bg-primary.opacity-70.shadow-lg
 *   └ div.flex.h-[var(--height-token-row)].max-w-80.items-center.gap-2.px-2.text-base.text-token-foreground
 *     ├ span.flex.size-5.shrink-0.items-center.justify-center > svg.icon-xs
 *     └ span.min-w-0.truncate  «标题»
 * ```
 *
 * 外层 `flex-col gap-1` 是给多选拖拽准备的(一次拖多条会叠成一列)。
 */
function SidebarDragPreview({ active }: { active: ActiveDrag }): React.JSX.Element | null {
  if (active == null) return null
  const label = active.kind === 'project' ? active.project.name : active.chat.title
  const icon =
    active.kind === 'project' ? (
      <FolderIcon className="icon-xs" />
    ) : (
      <ChatBubbleIcon className="icon-xs" />
    )
  return (
    <div className="relative flex w-fit max-w-80 flex-col gap-1">
      <div className="sidebar-item overflow-hidden border border-token-border bg-token-bg-primary opacity-70 shadow-lg">
        <div className="flex h-[var(--height-token-row)] max-w-80 items-center gap-2 px-2 text-base text-token-foreground">
          <span className="flex size-5 shrink-0 items-center justify-center">{icon}</span>
          <span className="min-w-0 truncate">{label}</span>
        </div>
      </div>
    </div>
  )
}

export function SidebarDndProvider({
  children,
  onConfirmMove
}: {
  children: ReactNode
  /** 目标项目缺源目录时先问一句 —— 确认后由调用方回调 apply() */
  onConfirmMove(pending: PendingThreadMove, apply: () => void): void
}): React.JSX.Element {
  const {
    chats,
    projects,
    pinnedItems,
    unpinnedProjects,
    reorderProjects,
    reorderPinnedItems,
    reorderProjectThreads,
    assignChatToProject,
    setChatPinned,
    chatsOfProject
  } = useWorkspace()
  const [active, setActive] = useState<ActiveDrag>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const onDragStart = (event: DragStartEvent): void => {
    const data = event.active.data.current as DragData | undefined
    if (data?.kind === 'sidebar-group' && data.projectId != null) {
      setActive({
        kind: 'project',
        project: projects.find((p) => p.id === data.projectId) ?? {
          id: data.projectId,
          name: '',
          rootPaths: [],
          createdAt: 0,
          updatedAt: 0
        }
      })
      return
    }
    const chatId = data?.chatId ?? chatIdFromDragId(String(event.active.id))
    const chat = chats.find((c) => c.id === chatId)
    setActive(chat ? { kind: 'thread', chat } : null)
  }

  const reset = (): void => {
    setActive(null)
  }

  const onDragEnd = (event: DragEndEvent): void => {
    reset()
    const { active: from, over } = event
    if (over == null) return
    const src = from.data.current as DragData | undefined
    const dst = over.data.current as DragData | undefined
    if (src == null || dst == null) return

    // ── 1. 项目排序 ──────────────────────────────────────────────
    if (src.kind === 'sidebar-group') {
      if (from.id === over.id) return
      if (src.containerId === 'pinned' && dst.containerId === 'pinned') {
        void reorderPinnedItems(
          moveKey(
            pinnedItems.map((i) => i.key),
            String(from.id),
            String(over.id)
          )
        )
        return
      }
      if (src.containerId === 'chats' && dst.kind === 'sidebar-group') {
        // Projects 分节:整份项目顺序(含置顶项目)按未置顶部分的新顺序重写
        const order = unpinnedProjects.map((p) => projectItemKey(p.id))
        const next = moveKey(order, String(from.id), String(over.id))
        void reorderProjects(
          next
            .map((key) => parseItemKey(key))
            .filter((p): p is { kind: 'project'; projectId: string } => p?.kind === 'project')
            .map((p) => p.projectId)
        )
      }
      return
    }

    if (src.kind !== 'sidebar-item' || src.chatId == null) return
    const chatId = src.chatId
    const chat = chats.find((c) => c.id === chatId)
    if (chat == null) return
    const homeContainer: SidebarContainerId =
      chat.projectId != null ? `project:${chat.projectId}` : 'chats'
    const targetContainer = dst.containerId
    if (!canMoveThread(src.containerId, targetContainer, homeContainer)) return

    // ── 2. 会话排序(同容器内) ───────────────────────────────────
    if (src.containerId === targetContainer) {
      if (from.id === over.id) return
      if (targetContainer === 'pinned') {
        void reorderPinnedItems(
          moveKey(
            pinnedItems.map((i) => i.key),
            threadItemKey(chatId),
            String(over.id)
          )
        )
        return
      }
      if (targetContainer.startsWith('project:')) {
        const projectId = targetContainer.slice('project:'.length)
        const ids = chatsOfProject(projectId).map((c) => threadItemKey(c.id))
        const next = moveKey(ids, threadItemKey(chatId), String(over.id))
        void reorderProjectThreads(
          projectId,
          next
            .map((key) => parseItemKey(key))
            .filter((p): p is { kind: 'thread'; chatId: string } => p?.kind === 'thread')
            .map((p) => p.chatId)
        )
      }
      // Recents 不支持重排(按时间排序),落回自己就什么都不做
      return
    }

    // ── 3/4. 跨容器:项目之间、与 Recents 互移、置顶 ─────────────
    if (targetContainer === 'pinned') {
      void setChatPinned(chatId, true)
      return
    }
    if (targetContainer === 'chats') {
      const unpin = src.containerId === 'pinned' ? setChatPinned(chatId, false) : Promise.resolve()
      void unpin.then(() => assignChatToProject(chatId, null))
      return
    }
    if (targetContainer.startsWith('project:')) {
      const projectId = targetContainer.slice('project:'.length)
      const targetProject = projects.find((p) => p.id === projectId)
      if (targetProject == null) return
      const sourceProject = projects.find((p) => p.id === chat.projectId)
      const apply = (): void => {
        const unpin = chat.pinned ? setChatPinned(chatId, false) : Promise.resolve()
        void unpin.then(() => assignChatToProject(chatId, projectId))
      }
      const missing = missingProjectSources(sourceProject, targetProject)
      if (missing.length === 0) {
        apply()
        return
      }
      onConfirmMove({ chatId, targetProject, missingSources: missing }, apply)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={sidebarCollisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      {children}
      {/*
       * 副本必须 portal 到 `<body>` —— 实测 Codex 的副本就是 `document.body`
       * 的最后一个子元素,自带 `z-index: 2147483647`,不依赖任何 portal 层。
       *
       * 不 portal 会被侧栏裁掉:DndContext 包在 aside 里,而 aside 的包装层带
       * `overflow-hidden` + `[contain:layout_paint]`,拖出侧栏范围的那一刻副本
       * 就消失了 —— 第一版就是这样,实测拖动中 body 下找不到任何
       * z-index 2147483647 的节点,只有装上 portal 才出现。
       *
       * `aria-hidden` + `inert` 让它不进无障碍树也不吃指针事件。
       */}
      {createPortal(
        // z-index 照抄实测值:dnd-kit 默认 999,Codex 显式给到 int32 上限
        <DragOverlay className="pointer-events-none" dropAnimation={null} zIndex={2147483647}>
          {active && (
            <div
              aria-hidden="true"
              inert
              className="[--height-token-row:30px]"
              style={{
                height: 'calc(100%)',
                width: 'calc(100%)',
                transform: 'scale(1)',
                transformOrigin: 'left top'
              }}
            >
              <SidebarDragPreview active={active} />
            </div>
          )}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  )
}
