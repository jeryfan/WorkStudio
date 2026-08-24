import { useState } from 'react'
import { useOverlay } from '../../../state/OverlayContext'
import { useWorkspace } from '../../../state/WorkspaceContext'
import { CheckIcon, CloseIcon, FolderIcon, PlusIcon, SearchIcon } from '../../icons'

interface ProjectPickerProps {
  onClose(): void
}

/** Codex cmdk 项基类(role=option 的那些) */
const OPTION_CLASS =
  'no-drag min-h-0! text-token-foreground outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm opacity-100! group hover:bg-token-list-hover-background focus:bg-token-list-hover-background aria-[selected=true]:bg-token-list-hover-background cursor-interaction'

/**
 * 项目选择弹层 —— Codex 是 cmdk 命令面板(运行时实测):
 *
 *   div[role=dialog][data-slot=popover-content].min-w-[260px]
 *   └ [cmdk-root]
 *     ├ label[sr-only] "Search projects"
 *     ├ div.flex.w-full.items-center.gap-1-5.px-row-x.py-row-y.mb-1
 *     │   > [search svg] + input[role=combobox][placeholder="Search projects"]
 *     ├ div[role=listbox][aria-label=Suggestions]
 *     │ └ div[cmdk-item][role=option][aria-selected=键盘光标]
 *     │     └ div.flex.w-full.items-center.gap-1-5
 *     │       > span.icon-xs…(folder)+ div.min-w-0.flex-1.truncate > span.truncate(名称)
 *     │       (+当前项目:尾部 check)
 *     ├ div.w-full.px-row-x.py-1 > div.h-[1px].bg-token-menu-border
 *     └ button "New project" / "Don't work in a project"
 *
 * 选择结果写入 WorkspaceContext.selection——项目是纯客户端概念(设计文档 §4.1)。
 * 键盘:输入框里 ArrowUp/ArrowDown 移动 aria-selected 光标,Enter 选中
 * (cmdk 的原生行为;cmdk 本体未引入,这里按其实测 DOM/交互复刻)。
 */
export function ProjectPicker({ onClose }: ProjectPickerProps): React.JSX.Element {
  const { projects, selection, selectProject } = useWorkspace()
  const { setCreateProjectOpen } = useOverlay()
  const [query, setQuery] = useState('')
  // cmdk 的 aria-selected 是键盘光标位置(默认第一项),不是已选项目
  const [cursorId, setCursorId] = useState<string | null>(null)

  const selectedId = selection.type === 'project' ? selection.projectId : null
  const filtered = query.trim()
    ? projects.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : projects
  const activeCursorId = cursorId ?? filtered[0]?.id ?? null

  const select = (projectId: string): void => {
    void selectProject({ type: 'project', projectId })
    onClose()
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (filtered.length === 0) return
    const index = filtered.findIndex((p) => p.id === activeCursorId)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const delta = e.key === 'ArrowDown' ? 1 : -1
      const next =
        index < 0
          ? delta > 0
            ? 0
            : filtered.length - 1
          : (index + delta + filtered.length) % filtered.length
      setCursorId(filtered[next].id)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeCursorId != null) select(activeCursorId)
    }
  }

  return (
    <>
      <label className="sr-only" htmlFor="composer-project-picker-input">
        Search projects
      </label>
      <div className="flex w-full items-center gap-1.5 px-[var(--padding-row-x)] py-[var(--padding-row-y)] mb-1">
        <SearchIcon className="icon-xs shrink-0 text-token-description-foreground" />
        <input
          id="composer-project-picker-input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-labelledby="composer-project-picker-input"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setCursorId(null)
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="Search projects"
          className="w-auto min-w-0 flex-1 appearance-none bg-transparent p-0! text-sm text-token-foreground outline-none placeholder:text-token-input-placeholder-foreground"
        />
      </div>

      <div className="flex max-h-[calc((1lh+var(--padding-row-y)*2)*5)] flex-col overflow-y-auto text-sm [--edge-fade-distance:1.5rem]">
        <div role="listbox" aria-label="Suggestions" tabIndex={-1}>
          {filtered.map((p) => (
            <div
              key={p.id}
              role="option"
              aria-selected={p.id === activeCursorId}
              data-disabled="false"
              data-value={p.id}
              onClick={() => select(p.id)}
              onMouseEnter={() => setCursorId(p.id)}
              className={OPTION_CLASS}
            >
              <div className="flex w-full items-center gap-1.5">
                <span className="icon-xs inline-flex items-center justify-center leading-none shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100 group-aria-[selected=true]:opacity-100">
                  <FolderIcon className="icon-xs" />
                </span>
                <div className="min-w-0 flex-1 truncate">
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="truncate">{p.name}</span>
                  </div>
                </div>
                {p.id === selectedId && <CheckIcon className="size-4 shrink-0" />}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-input-placeholder-foreground">
              No projects found
            </div>
          )}
        </div>
      </div>

      <div className="w-full px-[var(--padding-row-x)] py-1">
        <div className="h-[1px] w-full bg-token-menu-border" />
      </div>
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => {
            onClose()
            setCreateProjectOpen(true)
          }}
          className="no-drag w-full text-token-foreground outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm group hover:bg-token-list-hover-background focus:bg-token-list-hover-background cursor-interaction"
        >
          <span className="flex w-full items-center gap-1.5">
            <PlusIcon className="icon-xs shrink-0 opacity-75" />
            <span className="min-w-0 flex-1 truncate text-start">New project</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            void selectProject({ type: 'unassigned' })
            onClose()
          }}
          className="no-drag w-full text-token-foreground outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm group hover:bg-token-list-hover-background focus:bg-token-list-hover-background cursor-interaction"
        >
          <span className="flex w-full items-center gap-1.5">
            <CloseIcon className="icon-xs shrink-0 opacity-75" />
            <span className="min-w-0 flex-1 truncate text-start">Don&apos;t work in a project</span>
          </span>
        </button>
      </div>
    </>
  )
}
