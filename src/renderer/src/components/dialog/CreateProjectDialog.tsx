import { useState } from 'react'
import { workspaceService } from '../../services'
import { useWorkspace } from '../../state/WorkspaceContext'
import { CloseIcon, ProjectNameIcon, SourcesIcon } from '../icons'

/**
 * sider/2.html Create Project Dialog（第 3724-3830 行，CSS 第 1156-1361 行）：
 * 520px 居中毛玻璃对话框：项目名输入 / Sources 选择区 / Cancel + Create project。
 */
export function CreateProjectDialog({ onClose }: { onClose(): void }): React.JSX.Element {
  const { refresh } = useWorkspace()
  const [name, setName] = useState('')

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (name.trim()) {
      await workspaceService.createProject({ name: name.trim() })
      await refresh()
    }
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/[0.133]" onMouseDown={onClose} />
      <div
        role="dialog"
        aria-label="Create project"
        className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-32px)] w-[520px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[25px] border-[0.5px] border-menu-line bg-dropdown text-ink shadow-[0_4px_8px_-2px_rgb(0_0_0/0.1)] backdrop-blur-[16px]"
      >
        <form
          className="flex min-h-[328px] flex-col gap-0 p-5 text-sm leading-[21px]"
          onSubmit={submit}
        >
          <div className="flex w-full flex-col">
            <div className="flex flex-col items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1 self-stretch">
                <div className="text-sm font-semibold">Create project</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-3">
            <div className="flex flex-col gap-2">
              <label className="sr-only">Name</label>
              <div className="flex h-10 items-center gap-2 overflow-hidden rounded-[15px] border border-menu-line bg-dropdown-full pl-0 pr-3 focus-within:border-focus">
                <button
                  type="button"
                  className="flex h-full w-10 items-center justify-center border-r border-menu-line text-desc [&_svg]:size-4"
                >
                  <ProjectNameIcon />
                </button>
                <input
                  className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-ink outline-none placeholder:text-desc"
                  placeholder="Project name"
                  aria-label="Project name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-medium text-ink">Sources</span>
            </div>
            <div
              role="button"
              tabIndex={0}
              aria-label="Choose source folders"
              className="flex min-h-[118px] cursor-pointer flex-col overflow-hidden rounded-[12.5px] border border-menu-line bg-dropdown-full p-3"
            >
              <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
                <SourcesIcon className="size-5 text-desc" />
                <span className="text-[13px] text-ink">Add folders ChatGPT can read and edit</span>
              </div>
            </div>
          </div>

          <div className="mt-auto flex w-full items-center justify-between gap-3 pt-5">
            <span />
            <div className="flex w-full items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex select-none items-center gap-1 whitespace-nowrap rounded-[12.5px] border border-transparent px-4 py-1.5 text-sm leading-[18px] text-desc hover:bg-row-hover"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex select-none items-center gap-1 whitespace-nowrap rounded-[12.5px] border border-transparent bg-ink px-4 py-1.5 text-sm leading-[18px] text-dropdown hover:bg-ink/80"
              >
                Create project
              </button>
            </div>
          </div>
        </form>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded p-1 leading-none text-ink/80 hover:bg-toolbar-hover [&_svg]:size-4"
        >
          <CloseIcon />
        </button>
      </div>
    </>
  )
}
