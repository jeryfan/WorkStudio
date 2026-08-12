import { usePanels } from '../../state/PanelContext'
import { useWorkspace } from '../../state/WorkspaceContext'
import { baseName, resolveInProjects } from '../../utils/workspacePath'
import { Codicon } from './Codicon'

/**
 * 行内文件引用 —— 对应上游的 chatInlineAnchorWidget.ts。
 *
 * 视觉上是一个带细边框的小胶囊，而不是蓝色链接：正文里出现十几个路径时，
 * 一片蓝字会把段落打散；胶囊的边界感更弱，同时仍然表明"这个能点"。
 *
 * 后缀（`:12` 行号）用更浅的颜色，hover 时才拉回正常——路径本身才是主体信息。
 */
export function InlineAnchor({ path, label }: { path: string; label?: string }): React.JSX.Element {
  const { projects, currentProject } = useWorkspace()
  const { openTab } = usePanels()

  // `src/a.ts:12` 里的行号单独拆出来做后缀
  const match = /^(.*?):(\d+)$/.exec(path)
  const filePath = match ? match[1] : path
  const suffix = match ? `:${match[2]}` : ''

  const open = (): void => {
    const resolved = resolveInProjects(filePath, projects, currentProject?.id)
    if (!resolved) return
    openTab('right', {
      kind: 'file',
      title: baseName(resolved.relPath),
      payload: { projectId: resolved.projectId, path: resolved.relPath }
    })
  }

  return (
    <button type="button" className="chat-inline-anchor-widget" onClick={open} title={path}>
      <Codicon name="file" className="icon" />
      <span className="icon-label">
        {label ?? filePath}
        {suffix && <span className="label-suffix">{suffix}</span>}
      </span>
    </button>
  )
}
