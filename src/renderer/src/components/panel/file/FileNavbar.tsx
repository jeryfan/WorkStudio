import { FilesFolderIcon } from '../../icons'
import { BreadcrumbChevronIcon } from '../../icons'
import { APP_SHELL_BUTTON_CLASS, APP_SHELL_BUTTON_SECONDARY_CLASS } from '../appShellButtonClass'

interface FileNavbarProps {
  /** 项目名(面包屑首段;Codex `includeWorkspaceRootLabel: !0`) */
  projectName: string
  /** 当前预览文件的项目内相对路径,null = 未选择(面包屑只显示 "/") */
  selectedPath: string | null
  treeVisible: boolean
  onToggleTree(): void
}

/**
 * 文件路径导航栏 —— Codex `s0a`(app-initial:385016),i18n id
 * `review.fileSource.breadcrumb.ariaLabel` = "File path"。实测 DOM:
 *
 *   nav.group.flex.h-toolbar-pane.shrink-0.items-center.border-b.border-token-border-default
 *     .bg-token-main-surface-primary.px-2.select-none[aria-label="File path"]
 *   ├ div.hide-scrollbar.flex.min-w-0.flex-1.flex-row-reverse.items-center.overflow-x-auto.px-2
 *   │   ← flex-row-reverse:溢出时滚向路径末尾(文件名),方向别改
 *   │ └ ol.flex.flex-1.items-center.gap-1.text-xs.text-token-text-secondary.select-text
 *   │   │   onCopy:复制整段显示路径(Codex 在 ol 上拦 copy 事件)
 *   │   └ li.flex.shrink-0.items-center.gap-1 × n
 *   │     ├ 段:span.whitespace-nowrap(最后一段加 font-medium text-token-text-primary)
 *   │     │   (Codex 里中间段是可点进目录的链接按钮 c0a;WS 的树还不支持按目录展开,
 *   │     │    先用 span —— 下轮随虚拟树一起接)
 *   │     └ 分隔:BreadcrumbChevronIcon icon-2xs shrink-0 text-token-text-tertiary(非最后一段)
 *   └ div.ms-2.flex.shrink-0.items-center.gap-1.5
 *     └ button[aria-label="Toggle file tree"]:共享按钮类 + ms-auto,
 *       **树开时是 secondary 变体**(实测;与 Expand panel 同一套 color 切换),
 *       图标是 FilesFolderIcon,尺寸 icon-sm(18px,不是 icon-xs!)
 */
export function FileNavbar({
  projectName,
  selectedPath,
  treeVisible,
  onToggleTree
}: FileNavbarProps): React.JSX.Element {
  // Codex `n$i`:无 path → [`/`];有 path → [项目名, ...相对路径分段]
  const segments =
    selectedPath == null ? ['/'] : [projectName, ...selectedPath.split('/').filter(Boolean)]
  const displayPath = selectedPath == null ? '/' : `${projectName}/${selectedPath}`

  return (
    <nav
      aria-label="File path"
      className="group flex h-toolbar-pane shrink-0 items-center border-b border-token-border-default bg-token-main-surface-primary px-2 select-none"
    >
      <div className="hide-scrollbar flex min-w-0 flex-1 flex-row-reverse items-center overflow-x-auto px-2">
        <ol
          className="flex flex-1 items-center gap-1 text-xs text-token-text-secondary select-text"
          onCopy={(e) => {
            // Codex:复制面包屑得到的是整段路径文本,不是选中片段
            e.preventDefault()
            e.clipboardData.setData('text/plain', displayPath)
          }}
        >
          {segments.map((segment, i) => {
            const isLast = i === segments.length - 1
            return (
              <li key={`${i}:${segment}`} className="flex shrink-0 items-center gap-1">
                <span
                  className={`whitespace-nowrap${isLast ? ' font-medium text-token-text-primary' : ''}`}
                >
                  {segment}
                </span>
                {!isLast && (
                  <BreadcrumbChevronIcon
                    aria-hidden="true"
                    className="icon-2xs shrink-0 text-token-text-tertiary"
                  />
                )}
              </li>
            )
          })}
        </ol>
      </div>
      <div className="ms-2 flex shrink-0 items-center gap-1.5">
        {/* 实测:此按钮无 title/Tooltip,aria-label 也没有 title 属性 */}
        <button
          type="button"
          aria-label="Toggle file tree"
          onClick={onToggleTree}
          className={`${treeVisible ? APP_SHELL_BUTTON_SECONDARY_CLASS : APP_SHELL_BUTTON_CLASS} ms-auto`}
        >
          <FilesFolderIcon className="icon-sm" />
        </button>
      </div>
    </nav>
  )
}
