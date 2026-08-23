import { FolderIcon } from '../icons'
import { Tooltip } from '../tooltip/Tooltip'

/** 绝对路径的末段 —— Codex 用 `Zp(e) || e`(取 basename,取不到就用原串) */
function baseName(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return (idx === -1 ? trimmed : trimmed.slice(idx + 1)) || path
}

/**
 * 跨项目移动会话的确认框 —— Codex 的 `KIc`。
 *
 * **只在目标项目缺源文件夹时才弹**(判定见 SidebarDnd 的 missingProjectSources):
 * 会话拖到别的项目后,那个项目里的所有会话都会获得这些目录的访问权,
 * 所以要先明说。目标已经覆盖了源目录时直接移动,不打扰。
 *
 * 文案逐字来自 bundle(`sidebar.threadProjectMoveConfirmation.*`):
 * - 标题 `Add folders to {projectName}?`
 * - 正文 `All chats in {projectName} will gain access to these folders:`
 * - 按钮 `Cancel`(secondary)/ `Continue`(submit)
 *
 * 目录列表是 `ul.flex.flex-col.gap-1`,每项一个 tooltip 包着
 * `div.flex.min-w-0.items-center.gap-2` + `icon-xs` 文件夹图标 + `span.min-w-0.truncate`,
 * 显示的是**末段**,完整路径在 tooltip 里 —— 深路径不撑破弹窗。
 */
export function ThreadProjectMoveConfirmation({
  missingSources,
  projectName,
  onClose,
  onContinue
}: {
  missingSources: string[]
  projectName: string
  onClose(): void
  onContinue(): void
}): React.JSX.Element {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/[0.133]" onMouseDown={onClose} />
      <form
        role="dialog"
        aria-label={`Add folders to ${projectName}?`}
        onSubmit={(e) => {
          e.preventDefault()
          onClose()
          onContinue()
        }}
        /* size="compact" —— 与 Create project 同一套外壳(25px 圆角 + blur(24px)),只是窄一档 */
        className="overlay-heavy codex-dialog fixed left-1/2 top-1/2 z-50 flex w-[400px] max-h-[calc(100vh-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-hidden bg-token-dropdown-background/90 p-5 text-sm leading-[21px] text-token-foreground shadow-[0_0_0_0.5px_rgb(26_28_31/0.08),0_4px_8px_-2px_rgb(0_0_0/0.1)]"
      >
        <div className="flex flex-col gap-2">
          <div className="text-sm font-semibold">Add folders to {projectName}?</div>
          <div className="flex flex-col gap-2">
            <div className="text-token-description-foreground">
              All chats in {projectName} will gain access to these folders:
            </div>
            <ul className="flex flex-col gap-1">
              {missingSources.map((path) => (
                <li key={path}>
                  <Tooltip tooltipContent={path}>
                    <div className="flex min-w-0 items-center gap-2">
                      <FolderIcon className="icon-xs shrink-0" />
                      <span className="min-w-0 truncate">{baseName(path)}</span>
                    </div>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 cursor-interaction rounded-full border border-token-border px-3 text-sm text-token-foreground hover:bg-token-list-hover-background"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="h-8 cursor-interaction rounded-full bg-token-foreground px-3 text-sm text-token-main-surface-primary"
          >
            Continue
          </button>
        </div>
      </form>
    </>
  )
}
