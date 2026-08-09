import { useState } from 'react'
import { useOverlay } from '../../state/OverlayContext'
import { useWorkspace } from '../../state/WorkspaceContext'
import {
  AddProjectIcon,
  CollapseAllIcon,
  DotsIcon,
  NewTaskIcon,
  PluginsIcon,
  ScheduledIcon,
  SearchIcon
} from '../icons'
import { NavRow } from './NavRow'
import { IconButtonSm, SectionHeader } from './SectionHeader'
import { ProjectRow } from './ProjectRow'
import { TaskRow } from './TaskRow'
import { SidebarFooter } from './SidebarFooter'

type SectionId = 'pinned' | 'projects' | 'tasks'

/**
 * 左侧栏完整版（prototype/sider/2.html）：
 * top actions / Pinned / Projects（嵌套任务）/ Tasks / footer。
 * 三个分区均可点击标题折叠；Projects 支持"全部收起"。
 * 宽度由外层 react-resizable-panels 的 Panel 控制，组件自身填满。
 */
export function Sidebar(): React.JSX.Element {
  const { pinnedTasks, projects, collapseAllProjects } = useWorkspace()
  const { openMenu, setCommandOpen, setCreateProjectOpen } = useOverlay()
  const [collapsed, setCollapsed] = useState<Record<SectionId, boolean>>({
    pinned: false,
    projects: false,
    tasks: false
  })
  const toggleSection = (id: SectionId): void =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))

  // 面板边界的 1px 线由 Separator 统一绘制，aside 不再带 border-r
  return (
    <aside className="relative flex h-full w-full flex-col bg-app pt-11">
      <div className="flex min-h-0 flex-1 flex-col">
        {/* top actions */}
        <div className="flex shrink-0 flex-col gap-px px-2 pb-1.5 pt-0.5">
          <NavRow icon={<NewTaskIcon />} label="New task" kbd="⌘N" />
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

          {/* Pinned */}
          {pinnedTasks.length > 0 && (
            <div className="flex shrink-0 flex-col px-2">
              <SectionHeader
                title="Pinned"
                collapsed={collapsed.pinned}
                onToggle={() => toggleSection('pinned')}
              />
              {!collapsed.pinned && (
                <div className="flex flex-col pt-1">
                  {pinnedTasks.map((t) => (
                    <TaskRow key={t.id} task={t} />
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
                {projects.map((p) => (
                  <ProjectRow key={p.id} project={p} />
                ))}
              </div>
            )}
          </div>

          {/* Tasks */}
          <div className="flex shrink-0 flex-col px-2">
            <SectionHeader
              title="Tasks"
              collapsed={collapsed.tasks}
              onToggle={() => toggleSection('tasks')}
              controls={
                <>
                  <IconButtonSm title="Filter sidebar tasks">
                    <DotsIcon />
                  </IconButtonSm>
                  <IconButtonSm title="New task">
                    <NewTaskIcon />
                  </IconButtonSm>
                </>
              }
            />
            {!collapsed.tasks && <div className="p-2 text-sm text-desc opacity-50">No tasks</div>}
          </div>
        </div>
      </div>

      <SidebarFooter />
    </aside>
  )
}
