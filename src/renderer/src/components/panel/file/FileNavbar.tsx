import { useAppShell } from '../../../state/AppShellContext'
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
 * 段计算(Codex `n$i`/`r$i`,单 root 简化):[项目名, ...相对路径分段];
 * 第 i 段的 directoryPath = 前 i-1 个路径段(null=根),activePath = 前 i 个路径段;
 * 项目名段恒 {activePath:null, directoryPath:null}(下拉列根目录)。
 * Codex 里项目名 ≠ root 目录名时项目段退化为纯文本(不可点)。
 */

interface FileNavbarProps {
  projectId: string
  /** 项目名(面包屑首段;Codex `includeWorkspaceRootLabel: !0`) */
  projectName: string
  /** 项目根目录名(Codex:项目名 == root 名时首段才可点出根目录下拉) */
  rootBaseName: string
  /** 项目根绝对路径(Open in 用) */
  rootAbsolutePath: string | null
  /** 当前预览文件的项目内相对路径,null = 未选择(面包屑只显示 "/") */
  selectedPath: string | null
  onSelectFile(path: string, opts?: { isPreview?: boolean }): void
}

export function FileNavbar({
  projectId,
  projectName,
  rootBaseName,
  rootAbsolutePath,
  selectedPath,
  onSelectFile
}: FileNavbarProps): React.JSX.Element {
  const { fileTreeOpen, toggleFileTree } = useAppShell()
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
            const labelClass = `whitespace-nowrap${isLast ? ' font-medium text-token-text-primary' : ''}`
            // Codex `r$i`(单 root):首段 = 项目名;第 i 段对应相对路径前 i 段
            const pathSegments = selectedPath == null ? [] : selectedPath.split('/').filter(Boolean)
            const isProjectSegment = i === 0
            // 项目名与 root 目录名不一致时,首段不可点(Codex r$i 的 d===null 分支)
            const clickable =
              selectedPath != null && (!isProjectSegment || projectName === rootBaseName)
            const activePath = isProjectSegment ? null : pathSegments.slice(0, i).join('/')
            const directoryPath = isProjectSegment
              ? null
              : pathSegments.slice(0, i - 1).join('/') || null
            return (
              <li key={`${i}:${segment}`} className="flex shrink-0 items-center gap-1">
                {clickable ? (
                  <BreadcrumbSegmentDropdown
                    label={segment}
                    labelClassName={labelClass}
                    activePath={activePath}
                    directoryPath={directoryPath}
                    shouldExpandActivePath={!isLast}
                    projectId={projectId}
                    rootAbsolutePath={rootAbsolutePath}
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
        {selectedPath != null && (
          <>
            <FileViewerOptionsMenu projectId={projectId} path={selectedPath} />
            {rootAbsolutePath != null && (
              <OpenInSplitButton
                absolutePath={`${rootAbsolutePath}/${selectedPath}`}
                fileName={selectedPath.split('/').pop() ?? selectedPath}
              />
            )}
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
