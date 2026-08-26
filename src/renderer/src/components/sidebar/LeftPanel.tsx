import { useOverlay } from '../../state/OverlayContext'
import { useWorkspace } from '../../state/WorkspaceContext'
import {
  AddProjectIcon,
  DotsIcon,
  NewChatIcon,
  OpenFolderIcon,
  PluginsIcon,
  PullRequestIcon,
  ScheduledIcon,
  SearchIcon,
  Spinner
} from '../icons'
import { SidebarItem } from './SidebarItem'
import { SidebarModeSwitcher } from './SidebarModeSwitcher'
import { LeftPanelFrame } from './LeftPanelFrame'
import {
  IconButtonSm,
  SectionHeader,
  SidebarIconButton,
  SidebarSection,
  type SectionCollapsedStatus
} from './SectionHeader'
import { SidebarProjectRow } from './SidebarProjectRow'
import { SidebarRowList, SidebarSortableItem, SidebarThreadDragItem } from './SidebarSortableRow'
import { SidebarThreadRow } from './SidebarThreadRow'
import { SidebarFooter } from './SidebarFooter'
import { SidebarOptionsMenu } from './SidebarOptionsMenu'
import { useChatRuntime } from '../../state/ChatRuntimeContext'
import { commandKeybindingLabel } from '../../state/commands'
import { Tooltip } from '../tooltip/Tooltip'
import { SidebarDndProvider, SidebarSortableScope, SidebarThreadContainer } from './SidebarDnd'
import {
  threadDragId,
  useSidebarDraggable,
  useSidebarSortable,
  type PendingThreadMove,
  type SidebarContainerId
} from './sidebarDndModel'
import { ThreadProjectMoveConfirmation } from '../dialog/ThreadProjectMoveConfirmation'
import { projectItemKey } from '@shared/workspace/types'
import { useState } from 'react'
import { cx } from '../../utils/cx'

/**
 * 左侧栏完整版：
 * top actions / Pinned / Projects（嵌套会话）/ Recents / footer。
 *
 * 三个分区是互斥划分，同一个会话只出现在其中一处：
 * - Pinned：置顶项目 + 置顶会话，两者都从原分区移走（置顶是移动，不是复制）
 * - Projects：按项目分组，展开后是该项目下的会话
 * - Recents：无项目归属的会话（以及所属项目未作为分区显示的会话）
 *
 * Pinned 两者都空时整个分区隐藏（实测：取消最后一个置顶后 section 消失）；
 * 另两个分区始终显示，空时给空态文案。
 * 宽度由 AppShellContext 的 sidebarWidth 经 props 传入,写在 aside 的内联 style 上(Codex 同做法)。
 */
/**
 * 侧栏对外的入口 —— 只做一件事:把整个侧栏包进**一个** DnD 上下文,
 * 并托管跨项目移动的确认框。
 *
 * 为什么在这里而不是在各个列表里起 context:实测 Codex 侧栏所有可拖项的
 * `aria-describedby` 都指向同一个 `DndDescribedBy-0`。分成多个 context 时
 * 「把 Recents 的会话拖进项目」这种跨列表操作收不到 over 事件。
 */
export function LeftPanel(props: {
  width: number
  onResize(desired: number): void
}): React.JSX.Element {
  const [pendingMove, setPendingMove] = useState<{
    pending: PendingThreadMove
    apply(): void
  } | null>(null)
  return (
    <>
      <LeftPanelBody
        {...props}
        onConfirmMove={(pending, apply) => setPendingMove({ pending, apply })}
      />
      {pendingMove && (
        <ThreadProjectMoveConfirmation
          missingSources={pendingMove.pending.missingSources}
          projectName={pendingMove.pending.targetProject.name}
          onClose={() => setPendingMove(null)}
          onContinue={pendingMove.apply}
        />
      )}
    </>
  )
}

/** Pinned 的一项 —— 项目与会话共用同一个可排序包装,只是内容不同 */
function PinnedItemRow({
  item
}: {
  item: ReturnType<typeof useWorkspace>['pinnedItems'][number]
}): React.JSX.Element {
  const sortable = useSidebarSortable(
    item.key,
    item.kind === 'project'
      ? { kind: 'sidebar-group', containerId: 'pinned', projectId: item.project.id }
      : {
          kind: 'sidebar-item',
          containerId: 'pinned',
          chatId: item.chat.id,
          // 置顶把会话从原分区移走了,归属仍看它有没有项目 —— `Agc` 判断
          // 「能不能拖回 Recents」时要的是归属,不是当前所在分区
          homeContainerId: item.chat.projectId != null ? `project:${item.chat.projectId}` : 'chats'
        }
  )
  return (
    <SidebarSortableItem
      dragging={sortable.isDragging}
      attributes={sortable.attributes}
      listeners={sortable.listeners}
      setNodeRef={sortable.setNodeRef}
      style={sortable.style}
    >
      {item.kind === 'project' ? (
        <SidebarProjectRow project={item.project} />
      ) : (
        <SidebarThreadRow chat={item.chat} />
      )}
    </SidebarSortableItem>
  )
}

/** Projects 分节的项目组 —— 与 Pinned 的项目项同一个包装形态 */
function ProjectGroupItem({
  project,
  containerId
}: {
  project: Parameters<typeof SidebarProjectRow>[0]['project']
  containerId: SidebarContainerId
}): React.JSX.Element {
  const sortable = useSidebarSortable(projectItemKey(project.id), {
    kind: 'sidebar-group',
    containerId,
    projectId: project.id
  })
  return (
    <SidebarSortableItem
      dragging={sortable.isDragging}
      attributes={sortable.attributes}
      listeners={sortable.listeners}
      setNodeRef={sortable.setNodeRef}
      style={sortable.style}
    >
      <SidebarProjectRow project={project} />
    </SidebarSortableItem>
  )
}

/** Recents 的会话 —— 只可拖不可落 */
function RecentThreadItem({
  chatId,
  children
}: {
  chatId: string
  children: React.ReactNode
}): React.JSX.Element {
  const draggable = useSidebarDraggable(threadDragId(chatId), {
    kind: 'sidebar-item',
    containerId: 'chats',
    chatId,
    homeContainerId: 'chats'
  })
  return (
    <SidebarThreadDragItem
      dragging={draggable.isDragging}
      attributes={draggable.attributes}
      listeners={draggable.listeners}
      setNodeRef={draggable.setNodeRef}
      style={draggable.style}
    >
      {children}
    </SidebarThreadDragItem>
  )
}

/** 折叠分节的聚合状态(Codex `collapsedStatusState`):进行中优先于未读 */
function collapsedStatusOf(
  chats: { id: string; status: { type: string } }[],
  unreadChatIds: ReadonlySet<string>
): SectionCollapsedStatus | null {
  if (chats.some((c) => c.status.type === 'active')) return 'loading'
  if (
    chats.some((c) => c.status.type === 'systemError') ||
    chats.some((c) => unreadChatIds.has(c.id))
  )
    return 'unread'
  return null
}

function LeftPanelBody({
  width,
  onResize,
  onConfirmMove
}: {
  /** 当前宽度(px),0 = 折叠。Codex 用宽度表达折叠,没有单独的 collapsed 标志 */
  width: number
  onResize(desired: number): void
  onConfirmMove(pending: PendingThreadMove, apply: () => void): void
}): React.JSX.Element {
  /* 宽度动画与拖拽手柄已上移到 LeftPanelFrame —— Codex 的 `yJr` 同样在外壳里持有它们 */
  const {
    pinnedItems,
    unpinnedProjects,
    recentChats,
    flatChats,
    chatsLoading,
    selectProject,
    collapsedSections,
    toggleSection,
    organizeMode,
    unreadChatIds
  } = useWorkspace()
  const { setCommandOpen, setCreateProjectOpen } = useOverlay()
  const { closeChat } = useChatRuntime()

  /*
   * 滚动状态 —— Codex 用一个 `scrolledContentUnderHeader` 状态(bool)同时驱动:
   * 1. header 底部的 0.5px 发丝线(after: 类,滚动后才挂上);
   * 2. 三个 fade/间距 token 的切换(未滚动 1px/1px/0px → 滚动后
   *    var(--spacing) / calc(var(--spacing)*4) / var(--spacing))。
   * 实测阈值:scrollTop > 0 即触发;滚回顶部恢复。
   */
  const [scrolledUnderHeader, setScrolledUnderHeader] = useState(false)

  /**
   * 从侧栏顶部或 Recents 发起的新会话不归属任何项目。
   * 只有项目行右侧的入口才会带上项目——那是"在这个项目里新建"的语义。
   */
  const startProjectlessChat = (): void => {
    void selectProject({ type: 'unassigned' })
    closeChat()
  }
  const collapsed = collapsedSections
  const flat = organizeMode === 'list'
  const recentsChats = flat ? flatChats : recentChats

  /* 折叠分节的聚合状态(Codex `collapsedStatusState` → 标题右侧的状态点) */
  const pinnedChatsAll = pinnedItems.flatMap((i) => (i.kind === 'thread' ? [i.chat] : []))
  const pinnedStatus = collapsedStatusOf(pinnedChatsAll, unreadChatIds)
  const projectsChatsAll = unpinnedProjects.flatMap((p) => flatChatsOfProject(p.id, flatChats))
  const projectsStatus = collapsedStatusOf(projectsChatsAll, unreadChatIds)
  const recentsStatus = collapsedStatusOf(recentsChats, unreadChatIds)

  /*
   * 结构与类名照 Codex 侧栏的运行时实测值,层级不能省 —— 每一层都在承担东西:
   *
   *   aside.app-shell-left-panel        背景由该类给出(editor-background 70% 半透明)
   *                                     + :after 把背景右延 --radius-2xl 去接主区圆角
   *   div.max-w-full.overflow-hidden    折叠动画时裁剪
   *   div.select-none…[contain:layout_paint]  隔离重排重绘范围
   *   div.relative…[--height-token-mode-switch:32px]  行内注入 token 供下层消费
   *   nav.codex-Navigation
   *
   * aside 自己只负责宽度和 padding-top(= --height-toolbar,给 header 让位);
   * 尺寸 token 全部下沉到 inner 那层,见那里的注释。
   *
   * --top-fade / --bottom-fade 不用手写 —— codex-headerFadeMask 靠
   * `animation: edge-fade` + `animation-timeline: scroll(self y)` 驱动这两个值,
   * 静态声明会被动画压掉(实测 WS 之前写的 40px/0px 就是死声明)。
   */
  return (
    <LeftPanelFrame width={width} onResize={onResize}>
      {/* 以下整块是**聊天路由的左栏内容**（Codex 的 left panel 插槽 children）。
          设置路由换掉的就是这一块，外壳与拖拽手柄共用。 */}
      <div className="box-border isolate flex h-full w-full select-none flex-col [contain:layout_paint]">
        {/*
         * 行内 token 层 —— Codex 把 5 个尺寸 token 写成方括号类挂在这一层,
         * 另外 5 个 fade 相关的走 style。分工不是随意的:方括号类那 5 个是常量,
         * style 那 5 个由 JS 按滚动状态算(header fade start/distance 会随
         * 内容变化)。所以常量留在 className,变量走 style。
         *
         * --sidebar-footer-height 必须在这层而不是 aside:footer 是这层的绝对
         * 定位子元素,滚动区靠它预留底部内边距,codex-headerFadeMask 也靠它算
         * 淡出起点。挂到 aside 上会多穿一层,但更要紧的是语义 —— 它描述的是
         * 这一层内部的浮层高度。
         */}
        <div
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden [--height-token-mode-switch:32px] [--height-token-nav-row:30px] [--padding-row-cell-x:8px] [--padding-row-x:8px] [--radius-token-row:10px]"
          style={
            {
              '--sidebar-footer-height': '46px',
              // Codex 实测:未滚动时 1px;滚动后切成 var(--spacing)(4px)。
              // 不定义的话 header 的 pb-(--sidebar-scroll-header-spacing) 拿不到值。
              '--sidebar-scroll-content-top-padding': '1px',
              '--sidebar-scroll-header-fade-distance': scrolledUnderHeader
                ? 'calc(var(--spacing) * 4)'
                : '1px',
              '--sidebar-scroll-header-fade-start': scrolledUnderHeader ? 'var(--spacing)' : '0px',
              '--sidebar-scroll-header-spacing': scrolledUnderHeader ? 'var(--spacing)' : '1px'
            } as React.CSSProperties
          }
        >
          {/* .codex-Navigation 自带 flex/flex-1/min-height:0/column,不要再写一遍。
              DndContext 包在 nav **里面** —— Codex 的 DndDescribedBy / DndLiveRegion
              是 nav 的子元素(在滚动区之后),不是 aside 的兄弟。 */}
          <nav className="codex-Navigation" role="navigation" aria-label="Scheduled task folders">
            <SidebarDndProvider onConfirmMove={onConfirmMove}>
              {/*
               * header —— Codex: gap-2 px-row-x pb-(--sidebar-scroll-header-spacing)
               * + 底部一条 0.5px 的发丝线(after:,前景色 10%)。
               * 发丝线**只在滚动后出现**(实测 scrollTop>0 才挂 after: 类,
               * 滚回顶部消失)—— 与上面三个 fade token 的切换同源于滚动状态。
               */}
              <div
                className={cx(
                  'relative z-10 flex shrink-0 flex-col gap-2 px-row-x pb-(--sidebar-scroll-header-spacing)',
                  scrolledUnderHeader &&
                    "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-[0.5px] after:bg-token-foreground/10 after:content-['']"
                )}
              >
                {/*
                 * 品牌行 —— Codex 实测 316×32:左侧 86×32 的模式切换器,右侧 26×26 的
                 * Search 图标按钮。Search 在 Codex 里**不是独立导航行**,原先把它做成
                 * SidebarItem 是错的。
                 *
                 * 切换器目前只是外观占位:Codex 那个按钮背后是模式下拉,本项目还没有模式
                 * 概念,所以先不挂菜单,几何与状态类名(data-state)按 Codex 留好。
                 */}
                <div className="ms-2 flex items-center pe-1">
                  {/* 模式切换器 —— 触发器 + 菜单都在 SidebarModeSwitcher 里 */}
                  <SidebarModeSwitcher />
                  <div className="ms-auto flex items-center gap-1">
                    {/*
                     * Search 按钮带真 tooltip(Codex 实测:hover 出「Search ⌘K」),
                     * Tooltip 对组件 children 包 span.contents[data-state] ——
                     * Codex 的 DOM 就是那样。
                     */}
                    <Tooltip
                      tooltipContent="Search"
                      shortcut={commandKeybindingLabel('openCommandMenu')}
                    >
                      <SearchButton onClick={() => setCommandOpen(true)} />
                    </Tooltip>
                  </div>
                </div>

                {/*
                 * Codex 的 header 导航行外面是 gap-1 → gap-px 两层。
                 * 只有一行时 gap 不显现,但结构要留 —— 加第二行时行距才是 1px 而不是 4px。
                 */}
                <div className="flex flex-col gap-1">
                  <div className="flex flex-col gap-px">
                    <SidebarItem
                      icon={<NewChatIcon className="icon-xs" />}
                      label="New chat"
                      onClick={startProjectlessChat}
                    />
                  </div>
                </div>
              </div>

              {/*
               * 滚动区 —— 类名逐项对齐 Codex:
               *   vertical-scroll-fade-mask + codex-headerFadeMask  上下边缘淡出(滚动驱动动画)
               *   pb/scroll-pb = footer 高 + 行内边距           给浮层 footer 让位
               *   [--height-token-row:30px] [--radius-token-row:10px]  行高与圆角注入给下层行
               *   -mt/pt 抵消 header 间距                       让首行紧贴 header
               *
               * 注意两个修正:
               * - `scrollbar-on-hover` 是 WS 自己加的,Codex 的滚动区**没有**这个类
               *   (Codex 全站没有任何滚动条样式规则,macOS overlay 滚动条天然 hover 显现)。
               * - `data-app-action-sidebar-scroll` 的值是**空串**,不是 "true"。
               */}
              <div
                data-app-action-sidebar-scroll=""
                onScroll={(e) => {
                  const scrolled = e.currentTarget.scrollTop > 0
                  setScrolledUnderHeader((prev) => (prev === scrolled ? prev : scrolled))
                }}
                className="vertical-scroll-fade-mask codex-headerFadeMask relative isolate flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden pb-[calc(var(--sidebar-footer-height)+var(--padding-row-x))] pt-[var(--sidebar-scroll-content-top-padding,var(--sidebar-scroll-header-spacing,8px))] -mt-[var(--sidebar-scroll-header-spacing,8px)] scroll-pb-[calc(var(--sidebar-footer-height)+var(--padding-row-x))] [--height-token-row:30px] [--radius-token-row:10px] [contain:layout_paint]"
              >
                {/*
                 * 首节 —— 四层嵌套照抄 Codex,不能压平。
                 *
                 * 外层 gap-2 与中层 gap-1 因为各自只有一个子元素,实际都不显现;
                 * 真正生效的是最内层 gap-px,所以行间距是 **1px**。之前我把
                 * gap-2 + px-row-x 直接写在 section 上,行间变成 8px。
                 * px-row-x 也在中间那层,不在 section 上。
                 */}
                <div className="flex shrink-0 flex-col gap-2">
                  <div className="shrink-0 px-row-x">
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-col gap-px">
                        {/*
                         * 平铺模式(In one list)下 Codex 在导航区最前面多一个
                         * 「Projects」行 —— nav 样式的 div 套内层 button + hover
                         * 控制组,项目分节整个消失、会话全部平铺进 Recents。
                         * 行点击在本构建里没有可观测行为(不导航、不展开),保持结构忠实。
                         */}
                        {flat && (
                          <div className="sidebar-item focus-visible:outline-token-border relative h-[var(--height-token-row)] px-[var(--padding-row-cell-x,var(--padding-row-x))] py-row-y cursor-interaction shrink-0 items-center overflow-hidden text-start text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 gap-2 flex w-full hover:bg-token-list-hover-background group gap-1 pe-1">
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 cursor-interaction items-center text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-token-border disabled:cursor-not-allowed"
                            >
                              <div className="flex min-w-0 items-center text-base gap-2 flex-1 text-token-foreground">
                                <span className="flex w-4 shrink-0 items-center justify-center">
                                  <OpenFolderIcon className="icon-xs" />
                                </span>
                                <span className="text-fade-truncate">Projects</span>
                              </div>
                            </button>
                            <span className="pointer-events-none flex shrink-0 items-center gap-1 opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100">
                              <SidebarOptionsMenu
                                section="projects"
                                trigger={
                                  <IconButtonSm
                                    aria-label="Project sidebar options"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <DotsIcon className="icon-xs" />
                                  </IconButtonSm>
                                }
                              />
                              <button
                                type="button"
                                aria-label="Add new project"
                                data-app-action-sidebar-project-create=""
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setCreateProjectOpen(true)
                                }}
                                /* 平铺模式的 Add 按钮是另一个变体(实测):带三级文字色 +
                                 focus ring,没有 sidebar-icon-button 那组类 */
                                className="no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-full electron:rounded-md text-token-text-tertiary enabled:hover:bg-transparent data-[state=open]:bg-transparent enabled:hover:text-token-foreground border-transparent electron:p-1 flex items-center justify-center p-0.5 focus-visible:outline-token-focus-ring shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
                              >
                                <AddProjectIcon className="icon-xs" />
                              </button>
                            </span>
                          </div>
                        )}
                        <SidebarItem
                          icon={<PullRequestIcon className="icon-xs" />}
                          label="Pull requests"
                        />
                        <SidebarItem
                          icon={<ScheduledIcon className="icon-xs" />}
                          label="Scheduled"
                        />
                        <SidebarItem
                          icon={<PluginsIcon className="icon-xs" />}
                          label={
                            /* Codex:Plugins 的文案外面还有一层 inline-flex(挂活动角标的槽) */
                            <span className="inline-flex items-center gap-1">Plugins</span>
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/*
                 * 三个分节包在一个 `div.contents` 里,且 Pinned / Recents 两节
                 * 外面各多一层 `div[class=""]` —— 那是 Codex 的容器落点
                 * (H8:整个分节都是「拖进来」的落区,包括标题行),
                 * 不是装饰。Projects 节没有这层(它不是会话容器)。
                 */}
                <div className="contents">
                  {/*
                   * Pinned —— 同时装**置顶项目**(连同其会话)和**置顶会话**,
                   * 两者都从原分区移走;都为空时整节不渲染;
                   * 标题行**没有控制按钮**(实测只有 1 个子元素)。
                   */}
                  {pinnedItems.length > 0 && (
                    <SidebarThreadContainer containerId="pinned" className="">
                      <SidebarSection
                        heading="Pinned"
                        collapsed={collapsed.pinned}
                        header={
                          <SectionHeader
                            title="Pinned"
                            collapsed={collapsed.pinned}
                            onToggle={() => toggleSection('pinned')}
                            collapsedStatus={collapsed.pinned ? pinnedStatus : null}
                          />
                        }
                      >
                        {/*
                         * 项目行与会话行是 [role="list"] 下的**严格兄弟**,包同一个
                         * SidebarSortableItem,且在**同一个** SortableContext 里 ——
                         * 这是它们能互相穿插排序的前提(Codex 实测:Pinned 里项目与会话
                         * 的可排序包装逐字相同,顺序存在一个混合的 itemKey 数组里)。
                         * 顺序完全由 pinnedItems 决定,不再是"项目全在前、会话全在后"。
                         */}
                        <div className="flex flex-col gap-px pt-1">
                          <SidebarRowList>
                            <SidebarSortableScope items={pinnedItems.map((i) => i.key)}>
                              {pinnedItems.map((item) => (
                                <PinnedItemRow key={item.key} item={item} />
                              ))}
                            </SidebarSortableScope>
                          </SidebarRowList>
                        </div>
                      </SidebarSection>
                    </SidebarThreadContainer>
                  )}

                  {/* Projects —— 平铺模式下整节不渲染(会话全部进 Recents) */}
                  {!flat && (
                    <SidebarSection
                      heading="Projects"
                      collapsed={collapsed.projects}
                      header={
                        <SectionHeader
                          title="Projects"
                          collapsed={collapsed.projects}
                          onToggle={() => toggleSection('projects')}
                          sortable
                          collapsedStatus={collapsed.projects ? projectsStatus : null}
                          controls={
                            <>
                              {/*
                               * Codex 这里只有**两个**按钮:Project sidebar options + Add new project。
                               * 原先多的那个独立 "Collapse all" 在 Codex 里不存在 —— 折叠全部走
                               * Project sidebar options → Organize sidebar 子菜单。
                               * 另外 Codex 用 aria-label 而不是 title(title 会弹原生 tooltip,
                               * 和它自己的 tooltip 层打架),Add 按钮还带 data 动作属性。
                               * 两个按钮都是 Radix 触发器/动作钮,菜单开关态由 Radix 自动写到
                               * data-state/aria-expanded 上,不需要 React 回传。
                               */}
                              <SidebarOptionsMenu
                                section="projects"
                                trigger={
                                  <IconButtonSm aria-label="Project sidebar options">
                                    <DotsIcon className="icon-xs" />
                                  </IconButtonSm>
                                }
                              />
                              <SidebarIconButton
                                aria-label="Add new project"
                                data-app-action-sidebar-project-create=""
                                className="relative isolate overflow-visible"
                                onClick={() => setCreateProjectOpen(true)}
                              >
                                <AddProjectIcon className="icon-xs" />
                              </SidebarIconButton>
                            </>
                          }
                        />
                      }
                    >
                      <div className="flex flex-col gap-px pt-1">
                        {/* 置顶项目已移到 Pinned,这里只渲染未置顶的(两节互斥) */}
                        {unpinnedProjects.length === 0 ? (
                          /* Codex 的分节空态:`p-2 text-base` + 描述色 + opacity-50 */
                          <div className="p-2 text-base text-token-description-foreground opacity-50">
                            No projects
                          </div>
                        ) : (
                          <SidebarRowList>
                            <SidebarSortableScope
                              items={unpinnedProjects.map((p) => projectItemKey(p.id))}
                            >
                              {unpinnedProjects.map((p) => (
                                <ProjectGroupItem key={p.id} project={p} containerId="chats" />
                              ))}
                            </SidebarSortableScope>
                          </SidebarRowList>
                        )}
                      </div>
                    </SidebarSection>
                  )}

                  {/* Recents：无项目归属的会话;平铺模式下是全部未置顶会话 */}
                  <SidebarThreadContainer containerId="chats" className="">
                    <SidebarSection
                      heading="Recents"
                      collapsed={collapsed.recents}
                      header={
                        <SectionHeader
                          title="Recents"
                          collapsed={collapsed.recents}
                          onToggle={() => toggleSection('recents')}
                          sortable
                          collapsedStatus={collapsed.recents ? recentsStatus : null}
                          controls={
                            <>
                              <SidebarOptionsMenu
                                section="recents"
                                trigger={
                                  <IconButtonSm aria-label="Chat sidebar options">
                                    <DotsIcon className="icon-xs" />
                                  </IconButtonSm>
                                }
                              />
                              {/*
                               * New chat 按钮 —— Codex 这里外面还套着
                               * `div > span.contents[data-state]` 两层(后者是 tooltip
                               * 触发器;平铺模式那层 div 带 pe-0.5),tooltip 内容是
                               * 「New chat ⌘N」。
                               */}
                              <div className={flat ? 'pe-0.5' : undefined}>
                                <Tooltip
                                  tooltipContent="New chat"
                                  shortcut={commandKeybindingLabel('newTask')}
                                >
                                  <RecentsNewChatButton onClick={startProjectlessChat} />
                                </Tooltip>
                              </div>
                            </>
                          }
                        />
                      }
                    >
                      <div className="flex flex-col gap-px pt-1">
                        {/*
                         * Recents 的会话是 **draggable 而不是 sortable**(实测
                         * aria-roledescription="draggable"):能拖去项目 / Pinned,
                         * 但 Recents 自己不支持重排 —— 它按排序档排序,手工顺序没有意义。
                         */}
                        {recentsChats.length === 0 ? (
                          chatsLoading ? (
                            /* Codex 的加载行:列表尾部一个居中的 spinner listitem */
                            <div
                              role="listitem"
                              className="flex gap-1 py-1 after:block after:h-px after:content-[''] last:after:hidden"
                            >
                              <div className="flex w-full justify-center py-3">
                                <Spinner className="icon-xs text-token-text-secondary" />
                              </div>
                            </div>
                          ) : (
                            /* Codex 的分节空态:`p-2 text-base` + 描述色 + opacity-50 */
                            <div className="p-2 text-base text-token-description-foreground opacity-50">
                              No chats
                            </div>
                          )
                        ) : (
                          <SidebarRowList>
                            {recentsChats.map((c) => (
                              <RecentThreadItem key={c.id} chatId={c.id}>
                                <SidebarThreadRow chat={c} />
                              </RecentThreadItem>
                            ))}
                          </SidebarRowList>
                        )}
                      </div>
                    </SidebarSection>
                  </SidebarThreadContainer>
                </div>
              </div>
            </SidebarDndProvider>
          </nav>

          {/*
           * footer 是浮层,且必须是 nav 的兄弟、待在这层包装内 —— 不能挂到 aside 上。
           * 这层带 overflow-hidden 和 [contain:layout_paint],footer 的裁剪与绘制
           * 都归它管;挂到 aside 上会逃出这个裁剪上下文。
           * 滚动区已用 pb = --sidebar-footer-height + --padding-row-x 给它让位。
           */}
          <div className="absolute inset-x-0 bottom-0 z-20">
            {/* 这层只负责定位。SidebarFooter 自己渲染 Codex 的两个兄弟子元素
                  (上方插槽 + [container-type:inline-size] 容器),不要在外面再包一层。 */}
            <SidebarFooter />
          </div>
        </div>
      </div>
    </LeftPanelFrame>
  )
}

/** 项目下会话的扁平查找(折叠状态点聚合用) */
function flatChatsOfProject(
  projectId: string,
  all: ReturnType<typeof useWorkspace>['flatChats']
): ReturnType<typeof useWorkspace>['flatChats'] {
  return all.filter((c) => c.projectId === projectId)
}

/**
 * header 的 Search 按钮 —— 抽成组件是为了让 Tooltip 走 span.contents 分支
 * (Codex 实测:按钮外面是 span.contents[data-state="closed"])。
 */
function SearchButton({ onClick }: { onClick(): void }): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label="Search"
      onClick={onClick}
      className="no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-full electron:rounded-md text-token-text-tertiary enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent electron:p-1 flex items-center justify-center p-0.5"
    >
      <SearchIcon className="icon-xs" />
    </button>
  )
}

/** Recents 的 New chat 按钮 —— 同理,组件形态才有 span.contents 包装 */
function RecentsNewChatButton({ onClick }: { onClick(): void }): React.JSX.Element {
  return (
    <SidebarIconButton aria-label="New chat" onClick={onClick}>
      <NewChatIcon className="icon-xs" />
    </SidebarIconButton>
  )
}
