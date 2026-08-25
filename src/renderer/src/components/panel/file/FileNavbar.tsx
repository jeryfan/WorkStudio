import { useAppShell } from '../../../state/AppShellContext'
import {
  baseName,
  breadcrumbSegmentTargets,
  fileDisplayPath,
  fileDisplaySegments
} from '../../../utils/workspacePath'
import { FilesFolderIcon } from '../../icons'
import { BreadcrumbChevronIcon } from '../../icons'
import { APP_SHELL_BUTTON_CLASS, APP_SHELL_BUTTON_SECONDARY_CLASS } from '../appShellButtonClass'
import { BreadcrumbSegmentDropdown } from './FileBreadcrumbDropdown'
import { FileViewerOptionsMenu } from './FileViewerOptionsMenu'
import { OpenInSplitButton } from './OpenInSplitButton'

/**
 * 文件路径导航栏 —— Codex `s0a`(app-initial:385016)+ 尾部控制组(`ASo` 的
 * trailingContent:[headerActions, MSo, openFilesButton])。
 *
 *   nav.group.flex.h-toolbar-pane.shrink-0.items-center.border-b.border-token-border-default
 *     .bg-token-main-surface-primary.px-2.select-none[aria-label="File path"]
 *   ├ div.hide-scrollbar.flex.min-w-0.flex-1.flex-row-reverse.items-center.overflow-x-auto.px-2
 *   │   ← flex-row-reverse:溢出时滚向路径末尾(文件名),方向别改
 *   │ └ ol.flex.flex-1.items-center.gap-1.text-xs.text-token-text-secondary.select-text
 *   │   │   onCopy:复制整段显示路径(Codex 在 ol 上拦 copy 事件)
 *   │   └ li.flex.shrink-0.items-center.gap-1 × n
 *   │     ├ 段:`c0a` —— **每段都是下拉触发按钮**(含末段文件名;实测确认),
 *   │     │   弹出该段父目录的一层文件树(见 FileBreadcrumbDropdown)
 *   │     └ 分隔:BreadcrumbChevronIcon icon-2xs shrink-0 text-token-text-tertiary(非最后一段)
 *   └ div.ms-2.flex.shrink-0.items-center.gap-1.5
 *     ├ (有文件)FileViewerOptionsMenu(Codex `NSo`,kebab)
 *     ├ (有文件)OpenInSplitButton(Codex `Sia`)
 *     └ Toggle file tree:共享按钮类 + ms-auto,树开时 secondary 变体(实测),
 *       图标 FilesFolderIcon icon-sm(18px,不是 icon-xs!)
 *
 * 段与下拉目标全走 Codex 的两个函数(见 utils/workspacePath):
 * `n$i` = fileDisplaySegments(显示段,基准是 cwd 或 workspaceRoot),
 * `r$i` = breadcrumbSegmentTargets(逐段的 activePath/directoryPath,root 相对;
 * root 标签那段是 `{null, null}` 列根目录,对不上的段不可点)。
 */

interface FileNavbarProps {
  /** Codex `s0a` 的 `cwd` prop —— 显示路径的首选基准 */
  cwd: string | null
  /** Codex `s0a` 的 `path` prop —— **绝对**文件路径;null = 未选择(只显示 "/") */
  path: string | null
  /** Codex `s0a` 的 `workspaceRoot` prop */
  workspaceRoot: string
  /** 选中文件(**绝对路径**,Codex `onSelectFile`) */
  onSelectFile(path: string, opts?: { isPreview?: boolean }): void
}

export function FileNavbar({
  cwd,
  path,
  workspaceRoot,
  onSelectFile
}: FileNavbarProps): React.JSX.Element {
  const { fileTreeOpen, toggleFileTree } = useAppShell()
  // Codex `s0a`:无 path 时面包屑只有一段 `/`
  const segments = path == null ? ['/'] : fileDisplaySegments({ cwd, path, workspaceRoot })
  const targets = path == null ? null : breadcrumbSegmentTargets({ cwd, path, workspaceRoot })
  const displayPath = path == null ? '/' : fileDisplayPath({ cwd, path, workspaceRoot })

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
            const labelClass = `whitespace-nowrap${isLast ? ' font-medium text-token-text-primary' : ''}`
            // Codex `r$i`:该段的下拉目标;undefined/整体 null = 纯文本,不可点
            const target = targets?.[i]
            return (
              <li key={`${i}:${segment}`} className="flex shrink-0 items-center gap-1">
                {target != null ? (
                  <BreadcrumbSegmentDropdown
                    label={segment}
                    labelClassName={labelClass}
                    activePath={target.activePath}
                    directoryPath={target.directoryPath}
                    shouldExpandActivePath={!isLast}
                    root={workspaceRoot}
                    onSelectFile={onSelectFile}
                  />
                ) : (
                  <span className={labelClass}>{segment}</span>
                )}
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
        {path != null && (
          <>
            <FileViewerOptionsMenu path={path} />
            <OpenInSplitButton absolutePath={path} fileName={baseName(path)} />
          </>
        )}
        {/* 实测:此按钮无 title/Tooltip,aria-label 也没有 title 属性 */}
        <button
          type="button"
          aria-label="Toggle file tree"
          onClick={toggleFileTree}
          className={`${fileTreeOpen ? APP_SHELL_BUTTON_SECONDARY_CLASS : APP_SHELL_BUTTON_CLASS} ms-auto`}
        >
          <FilesFolderIcon className="icon-sm" />
        </button>
      </div>
    </nav>
  )
}
