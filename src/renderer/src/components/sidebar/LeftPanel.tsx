import { useState } from 'react'
import { useOverlay } from '../../state/OverlayContext'
import { useWorkspace } from '../../state/WorkspaceContext'
import {
  AddProjectIcon,
  BranchIcon,
  ChevronIcon,
  DotsIcon,
  NewChatIcon,
  PluginsIcon,
  ScheduledIcon,
  SearchIcon
} from '../icons'
import { SidebarItem } from './SidebarItem'
import { ResizeHandle } from '../layout/ResizeHandle'
import { usePanelResize } from '../../utils/usePanelResize'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '../../state/PanelContext'
import { IconButtonSm, SectionHeader, SidebarSection } from './SectionHeader'
import { SidebarProjectRow } from './SidebarProjectRow'
import { SortableProjects } from './SortableProjects'
import { SidebarThreadRow } from './SidebarThreadRow'
import { SidebarFooter } from './SidebarFooter'
import { useChatRuntime } from '../../state/ChatRuntimeContext'

type SectionId = 'pinned' | 'projects' | 'recents'

/**
 * 左侧栏完整版（prototype/sider/2.html）：
 * top actions / Pinned / Projects（嵌套会话）/ Recents / footer。
 *
 * 三个分区是互斥划分，同一个会话只出现在其中一处：
 * - Pinned：置顶会话，不再进入其他分区
 * - Projects：按项目分组，展开后是该项目下的会话
 * - Recents：无项目归属的会话（以及所属项目未作为分区显示的会话）
 *
 * Pinned 无内容时整个分区隐藏；另两个分区始终显示，空时给空态文案。
 * 宽度由 PanelContext 的 sidebarWidth 经 props 传入,写在 aside 的内联 style 上(Codex 同做法)。
 */
export function LeftPanel({
  width,
  onResize
}: {
  /** 当前宽度(px),0 = 折叠。Codex 用宽度表达折叠,没有单独的 collapsed 标志 */
  width: number
  onResize(desired: number): void
}): React.JSX.Element {
  const resize = usePanelResize({ edge: 'right', size: width, onResize })
  // collapseAllProjects 保留在 WorkspaceContext 里 —— Codex 是从
  // Project sidebar options → Organize sidebar 子菜单触发,不是独立按钮。
  const { pinnedChats, recentChats, chatsLoading, projects, selectProject } = useWorkspace()
  const { openMenu, setCommandOpen, setCreateProjectOpen } = useOverlay()
  const { closeChat } = useChatRuntime()

  /**
   * 从侧栏顶部或 Recents 发起的新会话不归属任何项目。
   * 只有项目行右侧的入口才会带上项目——那是"在这个项目里新建"的语义。
   */
  const startProjectlessChat = (): void => {
    void selectProject({ type: 'unassigned' })
    closeChat()
  }
  const [collapsed, setCollapsed] = useState<Record<SectionId, boolean>>({
    pinned: false,
    projects: false,
    recents: false
  })
  const toggleSection = (id: SectionId): void =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))

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
    <aside
      /*
       * 类名与 Codex 完全一致 —— 没有 h-full / w-full / flex-col。
       * 高度靠主行的 align-items:stretch,宽度走内联 style(Codex 也是内联)。
       * 折叠态 width:0 + overflow 由子层的 max-w-full.overflow-hidden 裁掉。
       */
      className="app-shell-left-panel pointer-events-auto relative flex overflow-visible browser:bg-token-main-surface-primary"
      style={{ paddingTop: 'var(--height-toolbar)', width: `${width}px` }}
    >
      {/* Codex 在这层写内联 min-width/width/opacity —— 折叠动画期间靠它裁剪,
          min-width 和 width 同值是为了不让内容把它挤宽 */}
      <div
        className="max-w-full overflow-hidden"
        style={{ minWidth: `${width}px`, width: `${width}px`, opacity: 1 }}
      >
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
                // Codex 实测 1px。不定义的话 header 的 pb-(--sidebar-scroll-header-spacing)
                // 拿不到值(该写法无 fallback),New chat 与下一节之间就少 1px。
                '--sidebar-scroll-content-top-padding': '1px',
                '--sidebar-scroll-header-fade-distance': '1px',
                '--sidebar-scroll-header-fade-start': '0px',
                '--sidebar-scroll-header-spacing': '1px'
              } as React.CSSProperties
            }
          >
            {/* .codex-Navigation 自带 flex/flex-1/min-height:0/column,不要再写一遍 */}
            <nav className="codex-Navigation" role="navigation" aria-label="Scheduled task folders">
              {/* header —— Codex: gap-2 px-row-x pb-(--sidebar-scroll-header-spacing) */}
              <div className="relative z-10 flex shrink-0 flex-col gap-2 px-row-x pb-(--sidebar-scroll-header-spacing)">
                {/*
                 * 品牌行 —— Codex 实测 316×32:左侧 86×32 的模式切换器,右侧 26×26 的
                 * Search 图标按钮。Search 在 Codex 里**不是独立导航行**,原先把它做成
                 * SidebarItem 是错的。
                 *
                 * 切换器目前只是外观占位:Codex 那个按钮背后是模式下拉,本项目还没有模式
                 * 概念,所以先不挂菜单,几何与状态类名(data-state)按 Codex 留好。
                 */}
                <div className="ms-2 flex items-center pe-1">
                  <button
                    type="button"
                    aria-label="Switch mode, current mode: Codex"
                    data-state="closed"
                    className="no-drag -ms-2 flex h-8 min-w-0 cursor-interaction select-none items-center gap-1 whitespace-nowrap rounded-xl border border-transparent px-2 font-medium !text-[17px] !leading-6 text-token-foreground outline-hidden focus:outline-none enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background"
                  >
                    {/*
                     * Codex 实测构成:文字 span(font-openai-sans font-semibold, 50×24)
                     * + 右侧 14×14 的 chevron(icon-2xs, 占位符前景色)。**没有 logo**。
                     * 8 + 50 + gap 4 + 14 + 8 + 边框 2 = 86,与 Codex 一致。
                     */}
                    <span className="truncate font-openai-sans font-semibold">Codex</span>
                    <ChevronIcon className="icon-2xs shrink-0 text-token-input-placeholder-foreground" />
                  </button>
                  {/*
                   * Codex 把右侧图标按钮组包在 div.ms-auto.flex.items-center.gap-1 里,
                   * 再各套一层 span.contents 当 tooltip 触发器。ms-auto 属于这个容器,
                   * 不是按钮 —— 以后加第二个图标按钮时才不会错位。
                   *
                   * 类名逐字照抄,只去掉一个 `electron:[&>svg]:icon-sm` —— 全项目唯一
                   * 一处刻意不抄的 token,理由有实测依据:Codex 的编译产物里含 icon-sm
                   * 的选择器**只有 `.icon-sm`** 一条,那个组合类从未被编译,是死类名,
                   * 实际生效的是 svg 自带的 icon-xs → 16px、按钮 26×26。WS 的 Tailwind
                   * 会把它编出来且特异性更高,照抄会顶成 svg 18px / 按钮 28×28。
                   * 渲染一致优先于抄一个上游无效的 token。SectionHeader 同理。
                   */}
                  <div className="ms-auto flex items-center gap-1">
                    <span className="contents" data-state="closed">
                      <button
                        type="button"
                        aria-label="Search"
                        onClick={() => setCommandOpen(true)}
                        className="no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-full electron:rounded-md text-token-text-tertiary enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent electron:p-1 flex items-center justify-center p-0.5"
                      >
                        <SearchIcon className="icon-xs" />
                      </button>
                    </span>
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
               */}
              <div
                data-app-action-sidebar-scroll
                className="vertical-scroll-fade-mask codex-headerFadeMask scrollbar-on-hover relative isolate flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden pb-[calc(var(--sidebar-footer-height)+var(--padding-row-x))] pt-[var(--sidebar-scroll-content-top-padding,var(--sidebar-scroll-header-spacing,8px))] -mt-[var(--sidebar-scroll-header-spacing,8px)] scroll-pb-[calc(var(--sidebar-footer-height)+var(--padding-row-x))] [--height-token-row:30px] [--radius-token-row:10px] [contain:layout_paint]"
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
                        <SidebarItem
                          icon={<BranchIcon className="icon-xs" />}
                          label="Pull requests"
                        />
                        <SidebarItem
                          icon={<ScheduledIcon className="icon-xs" />}
                          label="Scheduled"
                        />
                        <SidebarItem icon={<PluginsIcon className="icon-xs" />} label="Plugins" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pinned：无置顶项时整个分区隐藏 */}
                {pinnedChats.length > 0 && (
                  <SidebarSection
                    heading="Pinned"
                    collapsed={collapsed.pinned}
                    header={
                      <SectionHeader
                        title="Pinned"
                        collapsed={collapsed.pinned}
                        onToggle={() => toggleSection('pinned')}
                      />
                    }
                  >
                    <div className="flex flex-col gap-px">
                      {pinnedChats.map((c) => (
                        <SidebarThreadRow key={c.id} chat={c} />
                      ))}
                    </div>
                  </SidebarSection>
                )}

                {/* Projects */}
                <SidebarSection
                  heading="Projects"
                  collapsed={collapsed.projects}
                  header={
                    <SectionHeader
                      title="Projects"
                      collapsed={collapsed.projects}
                      onToggle={() => toggleSection('projects')}
                      menuId="project-options"
                      controls={
                        <>
                          {/*
                           * Codex 这里只有**两个**按钮:Project sidebar options + Add new project。
                           * 原先多的那个独立 "Collapse all" 在 Codex 里不存在 —— 折叠全部走
                           * Project sidebar options → Organize sidebar 子菜单。
                           * 另外 Codex 用 aria-label 而不是 title(title 会弹原生 tooltip,
                           * 和它自己的 tooltip 层打架),Add 按钮还带 data 动作属性。
                           */}
                          <IconButtonSm
                            aria-label="Project sidebar options"
                            aria-haspopup="menu"
                            onClick={(e) =>
                              openMenu({
                                id: 'project-options',
                                anchor: e.currentTarget.getBoundingClientRect()
                              })
                            }
                          >
                            <DotsIcon className="icon-xs" />
                          </IconButtonSm>
                          <IconButtonSm
                            aria-label="Add new project"
                            data-app-action-sidebar-project-create=""
                            className="relative isolate overflow-visible"
                            onClick={() => setCreateProjectOpen(true)}
                          >
                            <AddProjectIcon className="icon-xs" />
                          </IconButtonSm>
                        </>
                      }
                    />
                  }
                >
                  <div className="flex flex-col gap-px">
                    {projects.length === 0 ? (
                      <div className="p-2 text-sm text-token-text-tertiary">No projects</div>
                    ) : (
                      <SortableProjects projects={projects}>
                        {(p) => <SidebarProjectRow key={p.id} project={p} />}
                      </SortableProjects>
                    )}
                  </div>
                </SidebarSection>

                {/* Recents：无项目归属的会话 */}
                <SidebarSection
                  heading="Recents"
                  collapsed={collapsed.recents}
                  header={
                    <SectionHeader
                      title="Recents"
                      collapsed={collapsed.recents}
                      onToggle={() => toggleSection('recents')}
                      controls={
                        <>
                          <IconButtonSm aria-label="Chat sidebar options" aria-haspopup="menu">
                            <DotsIcon className="icon-xs" />
                          </IconButtonSm>
                          <IconButtonSm aria-label="New chat" onClick={startProjectlessChat}>
                            <NewChatIcon className="icon-xs" />
                          </IconButtonSm>
                        </>
                      }
                    />
                  }
                >
                  <div className="flex flex-col gap-px">
                    {recentChats.length === 0 ? (
                      <div className="p-2 text-sm text-token-text-tertiary">
                        {chatsLoading ? 'Loading…' : 'No chats'}
                      </div>
                    ) : (
                      recentChats.map((c) => <SidebarThreadRow key={c.id} chat={c} />)
                    )}
                  </div>
                </SidebarSection>
              </div>
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
      </div>
      {/* Codex 的手柄是 aside 的最后一个子元素,不是外部分隔条。
          edge='right' = 贴右缘;拖拽状态由 usePanelResize 持有再回传。 */}
      <ResizeHandle
        edge="right"
        ariaLabel="Resize sidebar"
        currentSize={width}
        minimumSize={SIDEBAR_MIN_WIDTH}
        maximumSize={SIDEBAR_MAX_WIDTH}
        isResizing={resize.isResizing}
        onPointerDown={resize.onPointerDown}
      />
    </aside>
  )
}
