import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { Project } from '../../services/workspace/types'
import { useOverlay } from '../../state/OverlayContext'
import { useChatRuntime } from '../../state/ChatRuntimeContext'
import { useWorkspace } from '../../state/WorkspaceContext'
import {
  ArchiveTasksIcon,
  DotsIcon,
  NewChatIcon,
  OpenFolderIcon,
  PinProjectIcon,
  RemoveIcon,
  RevealIcon,
  SettingsIcon,
  UnpinIcon,
  WorktreeIcon
} from '../icons'
import { cx } from '../../utils/cx'
import { SidebarIconButton } from './SectionHeader'
import { SidebarThreadRow } from './SidebarThreadRow'
import { ProjectHoverCard } from './ProjectHoverCard'
import { Tooltip } from '../tooltip/Tooltip'
import { CodexMenuContent, CodexMenuItem, type CodexMenuItemDef } from '../menu/CodexMenu'
import { ProjectIconDropZone, SidebarSortableScope, SidebarThreadContainer } from './SidebarDnd'
import { useSidebarSortable, type SidebarContainerId } from './sidebarDndModel'
import { SidebarCollapseRegion, SidebarRowList, SidebarThreadDragItem } from './SidebarSortableRow'
import { threadItemKey } from '@shared/workspace/types'
import { hostServices } from '../../host/appHost'

/**
 * 项目组 —— 逐层对齐 Codex 实测:
 *
 * ```
 * div.flex.flex-col.group/cwd.relative[aria-label][data-sidebar-project-kind="local"][role="listitem"]
 * ├ div.absolute.bottom-0.left-0.pointer-events-none.top-[var(--height-token-row)].w-8.z-10   ← 左侧 32px 落区遮罩
 * ├ span.contents[data-state]                        ← 悬浮卡片触发器(Tooltip 的组件分支)
 * │ └ div[data-app-action-sidebar-project-row]…      ← 项目行本体
 * └ div.overflow-hidden[style=…]                     ← 展开动画层(折叠时整块不渲染)
 *   └ div.pt-0.5.pb-2
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
 * - **项目行没有任何状态指示**:会话在跑不会在项目行上叠圆点/转圈
 *   (实测:子会话正在跑的项目行尾只有 ⋯ 与 +,展开与折叠两种状态下都是)。
 */
export function SidebarProjectRow({ project }: { project: Project }): React.JSX.Element {
  const {
    projectExpanded,
    toggleProject,
    chatsOfProject,
    selectProject,
    selection,
    pinnedProjects,
    setProjectPinned,
    removeProject,
    archiveChat
  } = useWorkspace()
  const { setCreateProjectOpen } = useOverlay()
  const { closeChat } = useChatRuntime()
  const expanded = projectExpanded[project.id] ?? true
  const chats = chatsOfProject(project.id)
  // 项目菜单的本地开关态 —— Radix 模式:开着时行保持悬浮外观、悬浮卡片不再弹
  const [menuOpen, setMenuOpen] = useState(false)
  const isCurrent = selection.type === 'project' && selection.projectId === project.id
  const threadContainerId: SidebarContainerId = `project:${project.id}`
  const pinned = pinnedProjects.some((p) => p.id === project.id)

  /*
   * Project actions 菜单项 —— 六项,文案与图标逐字实测(CDP 打开真实菜单读取):
   * Pin ⇄ Unpin project / Reveal in Finder / Create permanent worktree /
   * Edit project / Archive chats / Remove
   *
   * 每项的图标类:`icon-xs shrink-0 opacity-75 group-focus:opacity-100
   * group-hover:opacity-100`(hover/focus 才转实色)。
   */
  const items: CodexMenuItemDef[] = [
    {
      id: 'pin-project',
      label: pinned ? 'Unpin project' : 'Pin project',
      icon: <PinIconForMenu pinned={pinned} />,
      onSelect: () => void setProjectPinned(project.id, !pinned)
    },
    {
      id: 'reveal',
      label: 'Reveal in Finder',
      icon: (
        <RevealIcon className="icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100" />
      ),
      onSelect: () => {
        const path = project.rootPaths[0]
        if (path != null) void hostServices?.openIn.open({ path, target: 'fileManager' })
      }
    },
    {
      id: 'worktree',
      label: 'Create permanent worktree',
      icon: (
        <WorktreeIcon className="icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100" />
      )
      /* WS 还没有 worktree 能力 —— 项照 Codex 渲染,行为待 worktree 落地 */
    },
    {
      id: 'edit-project',
      label: 'Edit project',
      icon: (
        <SettingsIcon className="icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100" />
      ),
      onSelect: () => setCreateProjectOpen(true)
    },
    {
      id: 'archive-chats',
      label: 'Archive chats',
      icon: (
        <ArchiveTasksIcon className="icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100" />
      ),
      onSelect: () => {
        for (const chat of chatsOfProject(project.id)) void archiveChat(chat.id)
      }
    },
    {
      id: 'remove',
      label: 'Remove',
      icon: (
        <RemoveIcon className="icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100" />
      ),
      onSelect: () => void removeProject(project.id)
    }
  ]

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
        disabled={menuOpen}
        tooltipContent={<ProjectHoverCard project={project} />}
      >
        <ProjectRowButton
          project={project}
          expanded={expanded}
          isCurrent={isCurrent}
          menuOpen={menuOpen}
          onToggle={() => toggleProject(project.id)}
          onOpenChange={setMenuOpen}
          menuItems={items}
          onSelect={() => void selectProject({ type: 'project', projectId: project.id })}
          onStartChat={() => {
            // 从项目发起的新会话默认落在该项目里：先切选中项，再回到首页
            void selectProject({ type: 'project', projectId: project.id })
            closeChat()
          }}
        />
      </Tooltip>

      <SidebarCollapseRegion open={expanded}>
        <div className="pt-0.5 pb-2">
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
              className="isolate flex flex-col [contain:layout]"
            >
              {chats.length === 0 ? (
                /* Codex 的项目空态:`px-8 py-1 text-base` + 描述色 + opacity-50 */
                <div className="px-8 py-1 text-base text-token-description-foreground opacity-50">
                  No chats
                </div>
              ) : (
                <SidebarRowList ariaLabel={`Scheduled tasks in ${project.name}`}>
                  <SidebarSortableScope items={chats.map((c) => threadItemKey(c.id))}>
                    {chats.map((c) => (
                      <ProjectThreadItem key={c.id} chatId={c.id} containerId={threadContainerId}>
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
  children
}: {
  chatId: string
  containerId: SidebarContainerId
  children: React.ReactNode
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

/** 菜单里的项目置顶图标(置顶态切 Unpin) */
function PinIconForMenu({ pinned }: { pinned: boolean }): React.JSX.Element {
  const cls = 'icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100'
  return pinned ? <UnpinIcon className={cls} /> : <PinProjectIcon className={cls} />
}

/**
 * 项目行本体。
 *
 * 单独抽成组件不只是为了行数 —— Tooltip 对 **组件** children 会包一层
 * `span.contents[data-state]`,对 **DOM 标签** children 则走 cloneElement。
 * Codex 的项目行外面正是 `span.contents[data-state="closed"]`,所以这里必须
 * 是组件;直接把 `<div data-app-action-sidebar-project-row>` 塞给 Tooltip
 * 会少掉那一层。
 *
 * 菜单是 **Radix DropdownMenu**,触发器是那个
 * `div.outline-hidden.cursor-interaction.pe-0.5[type=button]`(Radix Trigger
 * asChild 会把 type/id/aria-haspopup/aria-expanded/data-state 全合到 div 上 ——
 * Codex 的 DOM 就是这样来的)。
 */
function ProjectRowButton({
  project,
  expanded,
  isCurrent,
  menuOpen,
  menuItems,
  onToggle,
  onOpenChange,
  onSelect,
  onStartChat,
  ...triggerProps
}: {
  project: Project
  expanded: boolean
  isCurrent: boolean
  menuOpen: boolean
  menuItems: CodexMenuItemDef[]
  onToggle(): void
  onOpenChange(open: boolean): void
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
        /* Codex:只有落在行本身的 Enter/Space 才切折叠,子按钮的不算 */
        if (e.currentTarget !== e.target) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
      }}
      className={cx(
        'sidebar-item group/folder-row group relative flex h-[var(--height-token-row)] cursor-interaction items-center justify-between overflow-hidden text-sm text-token-foreground hover:bg-token-list-hover-background focus-visible:outline focus-visible:outline-offset-2',
        (isCurrent || menuOpen) && 'bg-token-list-hover-background'
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
        <div
          className={cx(
            'w-0 overflow-hidden opacity-0 focus-within:w-auto focus-within:overflow-visible focus-within:opacity-100 group-hover/folder-row:w-auto group-hover/folder-row:overflow-visible group-hover/folder-row:opacity-100',
            menuOpen && 'w-auto overflow-visible opacity-100'
          )}
        >
          {/*
           * Codex 的触发器是 `div[type=button]`(Radix Trigger asChild 的产物),
           * 不是 role=button —— 别补 role。
           * 受控开关:内层按钮 onClick 驱动(它的 pointerdown 被吞掉防拖拽起手,
           * 所以不指望 Radix 自己的 pointerdown 通道)。
           */}
          <DropdownMenu.Root open={menuOpen} onOpenChange={onOpenChange}>
            <DropdownMenu.Trigger asChild>
              <div className="outline-hidden cursor-interaction pe-0.5">
                <SidebarIconButton
                  aria-label={`Project actions for ${project.name}`}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenChange(!menuOpen)
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <DotsIcon className="icon-xs" />
                </SidebarIconButton>
              </div>
            </DropdownMenu.Trigger>
            <CodexMenuContent align="start" className="min-w-[160px]">
              {menuItems.map((item) => (
                <CodexMenuItem key={item.id} item={item} />
              ))}
            </CodexMenuContent>
          </DropdownMenu.Root>
        </div>
        <div className="me-0.5 grid h-6 max-w-48 min-w-6 shrink grid-cols-1 items-center group-hover/folder-row:w-6">
          <span
            className={cx(
              'col-start-1 row-start-1 inline-flex justify-self-end opacity-0 group-hover/folder-row:opacity-100',
              menuOpen && 'opacity-100'
            )}
          >
            <SidebarIconButton
              aria-label={`Start new chat in ${project.name}`}
              onClick={(e) => {
                e.stopPropagation()
                onStartChat()
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <NewChatIcon className="icon-xs" />
            </SidebarIconButton>
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
