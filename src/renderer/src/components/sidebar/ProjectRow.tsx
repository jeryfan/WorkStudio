import type { Project } from '../../services/workspace/types'
import { useOverlay } from '../../state/OverlayContext'
import { usePanels } from '../../state/PanelContext'
import { useWorkspace } from '../../state/WorkspaceContext'
import { DotsIcon, NewTaskIcon, ProjectChevronIcon } from '../icons'
import { IconButtonSm } from './SectionHeader'
import { TaskRow } from './TaskRow'

interface ProjectRowProps {
  project: Project
}

/**
 * sider/2.html .project-row（第 558-713 行）：
 * - 点击行：在右侧面板打开该项目的 File tab
 * - 点击文件夹图标：展开/收起该项目任务列表
 * - hover：右侧操作按钮（项目菜单 / 新建任务）淡入
 * - 展开时下方渲染 .project-tasks 嵌套任务列表
 */
export function ProjectRow({ project }: ProjectRowProps): React.JSX.Element {
  const { projectExpanded, toggleProject } = useWorkspace()
  const { openMenu } = useOverlay()
  const { openTab } = usePanels()
  const expanded = projectExpanded[project.id] ?? project.defaultExpanded ?? true

  return (
    <div className="relative flex flex-col" role="listitem" aria-label={project.name}>
      {/* 拖放区（原型保留的占位，pointer-events-none） */}
      <div className="pointer-events-none absolute bottom-0 left-0 top-[30px] z-10 w-8" />

      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
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
        className="group relative flex h-[30px] w-full cursor-pointer items-center justify-between overflow-hidden rounded-row text-left text-sm text-ink hover:bg-row-hover"
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
            <ProjectChevronIcon />
          </button>
          <div className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md py-1 text-left text-sm text-ink">
            <span className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap">
              <span className="flex min-w-0 flex-1 items-center gap-0.5">
                <span className="truncate pr-1">{project.name}</span>
              </span>
            </span>
          </div>
        </div>

        <div className="flex min-w-0 max-w-1/2 gap-1">
          <div className="w-0 overflow-hidden opacity-0 transition-opacity duration-100 group-hover:w-auto group-hover:overflow-visible group-hover:opacity-100">
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
          <div className="mr-0.5 grid h-6 min-w-0 max-w-48 shrink-0 grid-cols-[1fr] items-center transition-[min-width] duration-100 group-hover:min-w-6">
            <span className="col-start-1 row-start-1 inline-flex justify-self-end opacity-0 transition-opacity duration-100 group-hover:opacity-100">
              <IconButtonSm
                title={`Start new task in ${project.name}`}
                onClick={(e) => e.stopPropagation()}
              >
                <NewTaskIcon />
              </IconButtonSm>
            </span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="pb-2 pt-0.5">
          <div className="relative isolate flex flex-col [contain:layout]">
            {project.tasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
