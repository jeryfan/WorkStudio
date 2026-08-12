import { useState } from 'react'
import { useOverlay } from '../../state/OverlayContext'
import { useWorkspace } from '../../state/WorkspaceContext'
import {
  AddProjectIcon,
  CollapseAllIcon,
  DotsIcon,
  NewChatIcon,
  PluginsIcon,
  ScheduledIcon,
  SearchIcon
} from '../icons'
import { NavRow } from './NavRow'
import { IconButtonSm, SectionHeader } from './SectionHeader'
import { ProjectRow } from './ProjectRow'
import { ChatRow } from './ChatRow'
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
 * 宽度由外层 react-resizable-panels 的 Panel 控制，组件自身填满。
 */
export function Sidebar(): React.JSX.Element {
  const { pinnedChats, recentChats, chatsLoading, projects, collapseAllProjects, selectProject } =
    useWorkspace()
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

  // 面板边界的 1px 线由 Separator 统一绘制，aside 不再带 border-r
  return (
    <aside className="relative flex h-full w-full flex-col bg-app pt-11">
      <div className="flex min-h-0 flex-1 flex-col">
        {/* top actions */}
        <div className="flex shrink-0 flex-col gap-px px-2 pb-1.5 pt-0.5">
          <NavRow icon={<NewChatIcon />} label="New chat" kbd="⌘N" onClick={startProjectlessChat} />
          <NavRow
            icon={<SearchIcon />}
            label="Search"
            kbd="⌘K"
            onClick={() => setCommandOpen(true)}
          />
        </div>

        {/* scroll area */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden pb-[54px] [scrollbar-width:thin]">
          {/* Scheduled / Plugins */}
          <div className="flex shrink-0 flex-col gap-px px-2">
            <NavRow icon={<ScheduledIcon />} label="Scheduled" />
            <NavRow icon={<PluginsIcon />} label="Plugins" />
          </div>

          {/* Pinned：无置顶项时整个分区隐藏 */}
          {pinnedChats.length > 0 && (
            <div className="flex shrink-0 flex-col px-2">
              <SectionHeader
                title="Pinned"
                collapsed={collapsed.pinned}
                onToggle={() => toggleSection('pinned')}
              />
              {!collapsed.pinned && (
                <div className="flex flex-col pt-1">
                  {pinnedChats.map((c) => (
                    <ChatRow key={c.id} chat={c} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Projects */}
          <div className="relative flex shrink-0 flex-col px-2">
            <SectionHeader
              title="Projects"
              collapsed={collapsed.projects}
              onToggle={() => toggleSection('projects')}
              menuId="project-options"
              controls={
                <>
                  <IconButtonSm title="Collapse all" onClick={collapseAllProjects}>
                    <CollapseAllIcon />
                  </IconButtonSm>
                  <IconButtonSm
                    title="Project sidebar options"
                    onClick={(e) =>
                      openMenu({
                        id: 'project-options',
                        anchor: e.currentTarget.getBoundingClientRect()
                      })
                    }
                  >
                    <DotsIcon />
                  </IconButtonSm>
                  <IconButtonSm title="Add new project" onClick={() => setCreateProjectOpen(true)}>
                    <AddProjectIcon />
                  </IconButtonSm>
                </>
              }
            />
            {!collapsed.projects && (
              <div className="flex flex-col pt-1">
                {projects.length === 0 ? (
                  <div className="p-2 text-sm text-[#a6a6ab]">No projects</div>
                ) : (
                  projects.map((p) => <ProjectRow key={p.id} project={p} />)
                )}
              </div>
            )}
          </div>

          {/* Recents：无项目归属的会话 */}
          <div className="flex shrink-0 flex-col px-2">
            <SectionHeader
              title="Recents"
              collapsed={collapsed.recents}
              onToggle={() => toggleSection('recents')}
              controls={
                <>
                  <IconButtonSm title="Filter sidebar chats">
                    <DotsIcon />
                  </IconButtonSm>
                  <IconButtonSm title="New chat" onClick={startProjectlessChat}>
                    <NewChatIcon />
                  </IconButtonSm>
                </>
              }
            />
            {!collapsed.recents && (
              <div className="flex flex-col pt-1">
                {recentChats.length === 0 ? (
                  <div className="p-2 text-sm text-[#a6a6ab]">
                    {chatsLoading ? 'Loading…' : 'No chats'}
                  </div>
                ) : (
                  recentChats.map((c) => <ChatRow key={c.id} chat={c} />)
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <SidebarFooter />
    </aside>
  )
}
