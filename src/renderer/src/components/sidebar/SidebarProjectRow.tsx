import type { Project } from '../../services/workspace/types'
import { useOverlay } from '../../state/OverlayContext'
import { useChatRuntime } from '../../state/ChatRuntimeContext'
import { useWorkspace } from '../../state/WorkspaceContext'
import { DotsIcon, NewChatIcon, OpenFolderIcon } from '../icons'
import { cx } from '../../utils/cx'
import { IconButtonSm } from './SectionHeader'
import { SidebarThreadRow } from './SidebarThreadRow'
import { ProjectHoverCard } from './ProjectHoverCard'
import { Tooltip } from '../tooltip/Tooltip'
import { ProjectIconDropZone, SidebarSortableScope, SidebarThreadContainer } from './SidebarDnd'
import { useSidebarSortable, type SidebarContainerId } from './sidebarDndModel'
import { SidebarCollapseRegion, SidebarRowList, SidebarThreadDragItem } from './SidebarSortableRow'
import { threadItemKey } from '@shared/workspace/types'

/**
 * 项目组 —— 逐层对齐 Codex 实测:
 *
 * ```
 * div.flex.flex-col.group/cwd.relative[aria-label][data-sidebar-project-kind="local"][role="listitem"]
 * ├ div.absolute.bottom-0.left-0.pointer-events-none.top-[var(--height-token-row)].w-8.z-10   ← 左侧 32px 落区遮罩
 * ├ span.contents[data-state]                        ← 悬浮卡片触发器(Tooltip 的组件分支)
 * │ └ div[data-app-action-sidebar-project-row]…      ← 项目行本体
 * └ div.overflow-hidden[style=…]                     ← 展开动画层(折叠时整块不渲染)
 *   └ div.pb-2.pt-0.5
 *     └ div[data-app-action-sidebar-project-list-id][data-app-action-sidebar-project-show-all]
 *       └ div.isolate.flex.flex-col.[contain:layout]
 *         └ div.flex.flex-col[role="list"][aria-label="Scheduled tasks in X"][tabindex="-1"]
 * ```
 *
 * 几个实测细节,别按直觉改回去:
 * - **`group/cwd` 是命名 group**,不是匿名 —— 项目行内的操作按钮用 `/folder-row`,
 *   两者分开才不会 hover 项目行时把子会话的操作也点亮。
 * - 左侧遮罩从 `top-[var(--height-token-row)]` 起(不是 `top-0`):它是拖拽落区的
 *   视觉留白,只覆盖会话列表那一段,盖住项目行本身会挡掉行的点击。
 * - 项目图标是 **span 不是 button**(D10),svg 自带 `icon-xs`;它同时是拖拽落区
 *   (`data-sidebar-project-drop-zone="project-icon"`),不需要自己的 onClick ——
 *   点击冒泡到整行由行切折叠。
 * - 项目名用 `text-fade-truncate`(mask 渐隐)而不是 `truncate`(省略号)。
 * - 新建会话那格的 `min-w-6` 是**无条件**的(D14):静息时就占 24px,
 *   不是 hover 才撑开。加 transition 会比 Codex 慢半拍,Codex 这里没有过渡。
 * - 整行**没有 `w-full`**(D15):它是 flex 行的子项,靠 `justify-between` 撑开。
 */
export function SidebarProjectRow({ project }: { project: Project }): React.JSX.Element {
  const { projectExpanded, toggleProject, chatsOfProject, selectProject, selection } =
    useWorkspace()
  const { menu, openMenu } = useOverlay()
  const { closeChat } = useChatRuntime()
  const expanded = projectExpanded[project.id] ?? true
  const chats = chatsOfProject(project.id)
  // 该项目下有会话在跑时，项目行给一个进行态指示
  const busy = chats.some((c) => c.status.type === 'active')
  // 该项目菜单打开期间，保持行的悬浮外观（鼠标已在菜单上，:hover 会丢失）
  const actionsOpen = menu?.id === 'project-actions' && menu.projectId === project.id
  const isCurrent = selection.type === 'project' && selection.projectId === project.id
  const threadContainerId: SidebarContainerId = `project:${project.id}`

  return (
    <div
      className="group/cwd relative flex flex-col"
      role="listitem"
      aria-label={project.name}
      data-sidebar-project-kind="local"
    >
      {/* 拖拽落区留白 —— pointer-events-none,只为让副本有地方落 */}
      <div className="pointer-events-none absolute bottom-0 left-0 top-[var(--height-token-row)] z-10 w-8" />

      <Tooltip
        variant="rich"
        interactive
        side="right"
        align="start"
        sideOffset={2}
        /* 菜单打开时不再弹卡片:菜单有全屏遮罩,卡片会被压在下面 */
        disabled={actionsOpen}
        tooltipContent={<ProjectHoverCard project={project} />}
      >
        <ProjectRowButton
          project={project}
          busy={busy}
          expanded={expanded}
          isCurrent={isCurrent}
          actionsOpen={actionsOpen}
          onToggle={() => toggleProject(project.id)}
          onOpenMenu={(anchor) =>
            openMenu({ id: 'project-actions', anchor, projectId: project.id })
          }
          onSelect={() => void selectProject({ type: 'project', projectId: project.id })}
          onStartChat={() => {
            // 从项目发起的新会话默认落在该项目里：先切选中项，再回到首页
            void selectProject({ type: 'project', projectId: project.id })
            closeChat()
          }}
        />
      </Tooltip>

      <SidebarCollapseRegion open={expanded}>
        <div className="pb-2 pt-0.5">
          {/*
           * `-show-all` 是 Codex 的「Show more」机制:会话多到一定数量时先截断,
           * 这个属性记录当前是否展开全部。WS 暂不截断,恒为 false —— 属性留着,
           * 接入截断时只改这一处。
           */}
          <div
            data-app-action-sidebar-project-list-id={project.id}
            data-app-action-sidebar-project-show-all="false"
          >
            <SidebarThreadContainer
              containerId={threadContainerId}
              projectId={project.id}
              className="relative isolate flex flex-col [contain:layout]"
            >
              {chats.length === 0 ? (
                <div className="px-2 py-1 text-sm text-token-text-tertiary">No chats</div>
              ) : (
                <SidebarRowList ariaLabel={`Scheduled tasks in ${project.name}`}>
                  <SidebarSortableScope items={chats.map((c) => threadItemKey(c.id))}>
                    {chats.map((c, i) => (
                      <ProjectThreadItem
                        key={c.id}
                        chatId={c.id}
                        containerId={threadContainerId}
                        isLast={i === chats.length - 1}
                      >
                        <SidebarThreadRow chat={c} isGrouped />
                      </ProjectThreadItem>
                    ))}
                  </SidebarSortableScope>
                </SidebarRowList>
              )}
            </SidebarThreadContainer>
          </div>
        </div>
      </SidebarCollapseRegion>
    </div>
  )
}

/** 项目内的会话:可排序(既能重排,也能拖去别的容器) */
function ProjectThreadItem({
  chatId,
  containerId,
  children,
  isLast
}: {
  chatId: string
  containerId: SidebarContainerId
  children: React.ReactNode
  isLast: boolean
}): React.JSX.Element {
  const sortable = useSidebarSortable(threadItemKey(chatId), {
    kind: 'sidebar-item',
    containerId,
    chatId,
    // 项目内的会话,归属容器就是这个项目
    homeContainerId: containerId
  })
  return (
    <SidebarThreadDragItem
      isLast={isLast}
      dragging={sortable.isDragging}
      attributes={sortable.attributes}
      listeners={sortable.listeners}
      setNodeRef={sortable.setNodeRef}
      style={sortable.style}
    >
      {children}
    </SidebarThreadDragItem>
  )
}

/**
 * 项目行本体。
 *
 * 单独抽成组件不只是为了行数 —— Tooltip 对 **组件** children 会包一层
 * `span.contents[data-state]`,对 **DOM 标签** children 则走 cloneElement。
 * Codex 的项目行外面正是 `span.contents[data-state="closed"]`,所以这里必须
 * 是组件;直接把 `<div data-app-action-sidebar-project-row>` 塞给 Tooltip
 * 会少掉那一层。
 */
function ProjectRowButton({
  project,
  busy,
  expanded,
  isCurrent,
  actionsOpen,
  onToggle,
  onOpenMenu,
  onSelect,
  onStartChat,
  ...triggerProps
}: {
  project: Project
  busy: boolean
  expanded: boolean
  isCurrent: boolean
  actionsOpen: boolean
  onToggle(): void
  onOpenMenu(anchor: DOMRect): void
  onSelect(): void
  onStartChat(): void
}): React.JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-current={isCurrent ? 'page' : undefined}
      aria-label={project.name}
      data-app-action-sidebar-project-row=""
      data-app-action-sidebar-project-id={project.id}
      data-app-action-sidebar-project-label={project.name}
      data-app-action-sidebar-project-collapsed={expanded ? 'false' : 'true'}
      /*
       * 整行点击 = 切折叠(Codex 实测:点标题区 collapsed 立刻翻转,且 URL 不变
       * —— 折叠是这一行 role="button" 的默认动作,不导航、不开面板)。
       */
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
      }}
      className={cx(
        'sidebar-item group/folder-row group relative flex h-[var(--height-token-row)] cursor-interaction items-center justify-between overflow-hidden text-sm text-token-foreground hover:bg-token-list-hover-background focus-visible:outline focus-visible:outline-offset-2',
        (isCurrent || actionsOpen) && 'bg-token-list-hover-background'
      )}
      {...triggerProps}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 ps-1">
        {/*
         * 图标位同时是 DnD 放置区(Codex 用 data-sidebar-project-drop-zone 标记),
         * 尺寸走 --height-token-row 与行等高,svg 用 icon-xs(16px)。
         * 是 span 不是 button —— 它没有自己的动作,点击冒泡给整行。
         */}
        <ProjectIconDropZone projectId={project.id}>
          <OpenFolderIcon className="icon-xs shrink-0" />
        </ProjectIconDropZone>
        <div className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap rounded-md py-1 pe-0 text-start text-base text-token-foreground">
          <span className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap">
            <span className="flex min-w-0 flex-1 items-center gap-0.5">
              <span className="pe-1 text-fade-truncate">{project.name}</span>
            </span>
          </span>
        </div>
      </div>

      <div className="flex max-w-[50%] min-w-0 gap-1">
        {/* 静态圆点,不加 animate-pulse —— 与会话行一致(Codex 的状态点无动画) */}
        {busy && (
          <span
            aria-label={`Running in ${project.name}`}
            className="me-0.5 size-2 shrink-0 rounded-full group-hover/folder-row:hidden"
            style={{ backgroundColor: 'var(--vscode-textLink-foreground)' }}
          />
        )}
        <div
          className={cx(
            'w-0 overflow-hidden opacity-0 focus-within:w-auto focus-within:overflow-visible focus-within:opacity-100 group-hover/folder-row:w-auto group-hover/folder-row:overflow-visible group-hover/folder-row:opacity-100',
            actionsOpen && 'w-auto overflow-visible opacity-100'
          )}
        >
          {/* Codex 在按钮外面还有一层菜单触发器包装(D15),aria 状态挂在它上面 */}
          <div
            role="button"
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            data-state={actionsOpen ? 'open' : 'closed'}
            className="cursor-interaction pe-0.5 outline-hidden"
          >
            <IconButtonSm
              aria-label={`Project actions for ${project.name}`}
              aria-haspopup="menu"
              aria-expanded={actionsOpen}
              onClick={(e) => {
                e.stopPropagation()
                onOpenMenu(e.currentTarget.getBoundingClientRect())
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <DotsIcon className="icon-xs" />
            </IconButtonSm>
          </div>
        </div>
        <div className="me-0.5 grid h-6 max-w-48 min-w-6 shrink grid-cols-1 items-center group-hover/folder-row:w-6">
          <span
            className={cx(
              'col-start-1 row-start-1 inline-flex justify-self-end opacity-0 group-hover/folder-row:opacity-100',
              actionsOpen && 'opacity-100'
            )}
          >
            <IconButtonSm
              aria-label={`Start new chat in ${project.name}`}
              onClick={(e) => {
                e.stopPropagation()
                onStartChat()
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <NewChatIcon className="icon-xs" />
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
          onSelect()
        }}
        className="sr-only"
      />
    </div>
  )
}
