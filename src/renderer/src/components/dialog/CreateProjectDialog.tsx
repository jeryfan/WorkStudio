import { useState } from 'react'
import { useWorkspace } from '../../state/WorkspaceContext'
import { CloseIcon, ProjectNameIcon, SourcesIcon } from '../icons'

/**
 * sider/2.html Create Project Dialog（第 3724-3830 行，CSS 第 1156-1361 行）：
 * 520px 居中毛玻璃对话框：项目名输入 / Sources 选择区 / Cancel + Create project。
 *
 * 项目至少需要一个目录——目录是项目与磁盘、与会话归属的唯一纽带，
 * 只有名字的项目无法承载任何功能。
 */
export function CreateProjectDialog({ onClose }: { onClose(): void }): React.JSX.Element {
  const { pickDirectories, createProject } = useWorkspace()
  const [name, setName] = useState('')
  const [rootPaths, setRootPaths] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addFolders = async (): Promise<void> => {
    const picked = await pickDirectories()
    if (picked.length === 0) return
    setRootPaths((prev) => [...new Set([...prev, ...picked])])
    setError(null)
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (rootPaths.length === 0) {
      setError('Choose at least one folder')
      return
    }
    setBusy(true)
    try {
      await createProject({ name: name.trim() || undefined, rootPaths })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/[0.133]" onMouseDown={onClose} />
      <div
        role="dialog"
        aria-label="Create project"
        /*
         * Codex 实测 520×309:圆角 25px + blur(24px) + 底色 90% 透明,**无 border**。
         * 原来是 blur(16px) 且叠了 border-[0.5px],边缘比 Codex 重、模糊也不够。
         */
        className="overlay-heavy codex-dialog fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-32px)] w-[520px] -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-token-dropdown-background/90 text-token-foreground shadow-[0_0_0_0.5px_rgb(26_28_31/0.08),0_4px_8px_-2px_rgb(0_0_0/0.1)]"
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
              <div className="flex h-10 items-center gap-2 overflow-hidden rounded-[15px] border border-token-menu-border bg-token-dropdown-background pl-0 pr-3 focus-within:border-token-focus-border">
                <button
                  type="button"
                  className="flex h-full w-10 items-center justify-center border-r border-token-menu-border text-token-description-foreground [&_svg]:size-4"
                >
                  <ProjectNameIcon />
                </button>
                <input
                  className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-token-foreground outline-none placeholder:text-token-description-foreground"
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
              <span className="text-[13px] font-medium text-token-foreground">Sources</span>
            </div>
            <div
              role="button"
              tabIndex={0}
              aria-label="Choose source folders"
              onClick={() => void addFolders()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  void addFolders()
                }
              }}
              className="flex min-h-[118px] cursor-pointer flex-col overflow-hidden rounded-[12.5px] border border-token-menu-border bg-token-dropdown-background p-3"
            >
              {rootPaths.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
                  <SourcesIcon className="size-5 text-token-description-foreground" />
                  <span className="text-[13px] text-token-foreground">
                    Add folders the agent can read and edit
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {rootPaths.map((path) => (
                    <div
                      key={path}
                      className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-token-list-hover-background"
                    >
                      <SourcesIcon className="size-4 shrink-0 text-token-description-foreground" />
                      {/* 长路径从头部截断：尾部的目录名才是识别依据 */}
                      <span
                        className="min-w-0 flex-1 truncate text-left text-[13px] text-token-foreground [direction:rtl]"
                        title={path}
                      >
                        {path}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${path}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setRootPaths((prev) => prev.filter((p) => p !== path))
                        }}
                        className="shrink-0 rounded p-0.5 text-token-description-foreground hover:text-token-foreground [&_svg]:size-3.5"
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  ))}
                  <span className="px-2 pt-1 text-[12px] text-token-description-foreground">Click to add more</span>
                </div>
              )}
            </div>
            {error && <span className="px-1 text-[12px] text-red-500">{error}</span>}
          </div>

          <div className="mt-auto flex w-full items-center justify-between gap-3 pt-5">
            <span />
            <div className="flex w-full items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex select-none items-center gap-1 whitespace-nowrap rounded-[12.5px] border border-transparent px-4 py-1.5 text-sm leading-[18px] text-token-description-foreground hover:bg-token-list-hover-background"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || rootPaths.length === 0}
                className="flex select-none items-center gap-1 whitespace-nowrap rounded-[12.5px] border border-transparent bg-token-foreground px-4 py-1.5 text-sm leading-[18px] text-token-dropdown-background hover:bg-token-foreground/80 disabled:cursor-not-allowed disabled:opacity-40"
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
          className="absolute right-4 top-4 rounded p-1 leading-none text-token-foreground/80 hover:bg-token-list-hover-background [&_svg]:size-4"
        >
          <CloseIcon />
        </button>
      </div>
    </>
  )
}
