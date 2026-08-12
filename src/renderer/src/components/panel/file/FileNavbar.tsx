import { ChevronIcon, DotsIcon } from '../../icons'
import { FileTreeIcon, VsCodeIcon } from '../../icons/files'

interface FileNavbarProps {
  projectName: string
  /** 当前预览文件相对路径，null = 未选择 */
  selectedPath: string | null
  treeVisible: boolean
  onToggleTree(): void
}

/**
 * 文件路径导航栏（panel/1.html .navbar 第 88-113 行）：
 * 面包屑 + 文件选项 / "Open in VS Code" 分段按钮 / 文件树开关。
 */
export function FileNavbar({
  projectName,
  selectedPath,
  treeVisible,
  onToggleTree
}: FileNavbarProps): React.JSX.Element {
  const fileName = selectedPath?.split('/').pop() ?? null

  return (
    <nav className="relative z-20 flex h-8 shrink-0 items-center border-b border-[#e2e4e8] bg-white px-2">
      <div className="flex min-w-0 flex-1 items-center gap-1 px-2 text-xs text-[#54585f]">
        <button type="button" className="whitespace-nowrap rounded text-xs hover:text-ink">
          {projectName}
        </button>
        {fileName && (
          <>
            <span className="flex text-[#71767d]">
              <ChevronIcon className="size-3 -rotate-90" />
            </span>
            <button
              type="button"
              className="whitespace-nowrap rounded text-xs font-medium text-ink"
            >
              {fileName}
            </button>
          </>
        )}
      </div>

      <div className="ml-2 flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label="File viewer options"
          className="flex size-7 items-center justify-center rounded-lg text-[#71767d] hover:bg-[#f2f3f5] [&_svg]:size-4"
        >
          <DotsIcon />
        </button>

        {/* Open in VS Code 分段按钮 */}
        <span className="inline-flex items-stretch overflow-hidden rounded-lg">
          <button
            type="button"
            aria-label="Open in VS Code"
            className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-l-lg border border-r-0 border-[#e2e4e8] bg-[#f6f7f8] pl-2 pr-1 text-[13px] text-[#3f434a] hover:bg-[#f2f3f5]"
          >
            <VsCodeIcon className="size-4" />
            <span>Open</span>
          </button>
          <button
            type="button"
            aria-label="Open options"
            className="flex h-7 items-center rounded-r-lg border border-l-0 border-[#e2e4e8] bg-[#f6f7f8] pl-0.5 pr-1.5 text-[#3f434a] hover:bg-[#f2f3f5]"
          >
            <ChevronIcon className="size-3 opacity-50" />
          </button>
        </span>

        <button
          type="button"
          aria-label="Toggle file tree"
          onClick={onToggleTree}
          className={`flex size-7 items-center justify-center rounded-lg [&_svg]:size-5 ${
            treeVisible
              ? 'bg-[#f2f3f4] text-ink hover:bg-ink-10'
              : 'text-[#71767d] hover:bg-[#f2f3f5]'
          }`}
        >
          <FileTreeIcon />
        </button>
      </div>
    </nav>
  )
}
