import { useState } from 'react'
import { useOverlay } from '../../../state/OverlayContext'
import { useWorkspace } from '../../../state/WorkspaceContext'
import { CheckIcon, CloseIcon, FolderIcon, PlusIcon, SearchIcon } from '../../icons'

interface ProjectPickerProps {
  onClose(): void
}

/**
 * 项目选择弹层（chat.html #popProject，260px）：
 * 搜索框 + 项目列表（当前项带勾选）+ New project + Don't work in a project。
 * 选择结果写入 WorkspaceContext.selection——项目是纯客户端概念（设计文档 §4.1），
 * 这里只改注册表选中态，不涉及 agent 调用。
 */
export function ProjectPicker({ onClose }: ProjectPickerProps): React.JSX.Element {
  const { projects, selection, selectProject } = useWorkspace()
  const { setCreateProjectOpen } = useOverlay()
  const [query, setQuery] = useState('')

  const selectedId = selection.type === 'project' ? selection.projectId : null
  const filtered = query.trim()
    ? projects.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : projects

  const select = (projectId: string): void => {
    void selectProject({ type: 'project', projectId })
    onClose()
  }

  return (
    <>
      <div className="mb-1 flex items-center gap-1.5 px-2 py-[5px]">
        <SearchIcon className="size-3.5 shrink-0 text-desc" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects"
          aria-label="Search projects"
          className="min-w-0 flex-1 border-none bg-transparent text-[13px] leading-[18.57px] text-ink outline-none placeholder:text-placeholder"
        />
      </div>

      <div className="flex flex-col overflow-y-auto">
        {filtered.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => select(p.id)}
            className={`flex w-full items-center gap-1.5 rounded-[12.5px] px-2 py-[5px] text-left text-[13px] leading-[18.57px] text-ink hover:bg-row-hover ${
              p.id === selectedId ? 'bg-row-hover' : ''
            }`}
          >
            <FolderIcon className="size-4 shrink-0 opacity-75" />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            {p.id === selectedId && <CheckIcon className="size-4 shrink-0 opacity-75" />}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="px-2 py-[5px] text-[13px] leading-[18.57px] text-placeholder">
            No projects found
          </div>
        )}
      </div>

      <div className="px-2 py-1">
        <div className="h-px w-full bg-menu-line" />
      </div>

      <button
        type="button"
        onClick={() => {
          onClose()
          setCreateProjectOpen(true)
        }}
        className="flex w-full items-center gap-1.5 rounded-[12.5px] px-2 py-[5px] text-left text-[13px] leading-[18.57px] text-ink hover:bg-row-hover"
      >
        <PlusIcon className="size-4 shrink-0 opacity-75" />
        <span className="min-w-0 flex-1 truncate">New project</span>
      </button>
      <button
        type="button"
        onClick={() => {
          void selectProject({ type: 'unassigned' })
          onClose()
        }}
        className="flex w-full items-center gap-1.5 rounded-[12.5px] px-2 py-[5px] text-left text-[13px] leading-[18.57px] text-ink hover:bg-row-hover"
      >
        <CloseIcon className="size-4 shrink-0 opacity-75" />
        <span className="min-w-0 flex-1 truncate">Don&apos;t work in a project</span>
      </button>
    </>
  )
}
