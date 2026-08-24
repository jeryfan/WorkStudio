import { useAppShell } from '../../state/AppShellContext'
import { useWorkspace } from '../../state/WorkspaceContext'
import { resolveInProjects } from '../../utils/workspacePath'
import { createFilesTabDescriptor } from '../../components/panel/filesTabDescriptor'

/**
 * 活动行里的文件引用 —— 照 Codex 的 agent-activity file link 实现。
 *
 * 之前是 VS Code 的 `chat-inline-anchor-widget`(带边框的小胶囊 + 文件图标)。
 * Codex 完全不同:
 *
 * ```
 * span[data-agent-activity-file-link][role="link"][tabindex="0"]
 *     .pointer-events-auto.inline-block.max-w-full.cursor-interaction.truncate.align-bottom
 *     .text-inherit.underline.decoration-dotted.decoration-[0.5px].underline-offset-2
 *     .group-hover/activity-header:!text-token-foreground.hover:!text-token-foreground
 * ```
 *
 * 四个都不是随便写的:
 *
 * 1. **是 `span[role=link]` 而不是 `<button>` / `<a>`**。它嵌在活动行表头里,
 *    而表头本身已经是 button(或盖着一个 absolute 的 button)——
 *    嵌套 interactive 元素是非法 HTML,`role` + `tabIndex` 才能既可聚焦又合法。
 * 2. **`data-agent-activity-file-link` 是那一大票选择器的锚点**。chevron 的
 *    `opacity-100`、增删行数的变色都写成
 *    `group-[:hover:not(:has([data-agent-activity-file-link]:hover))]` ——
 *    少了这个属性,鼠标停在文件名上时整行都会亮,分不清"点链接"还是"点展开"。
 * 3. **`text-inherit` + 点线下划线(0.5px)**,不是蓝色链接也不是胶囊。
 *    正文里出现十几个路径时,一片蓝字会把段落打散;点线的边界感最弱。
 * 4. **`stopPropagation` 是必需的**。不阻止冒泡的话点文件名会顺带把活动行展开。
 *    键盘路径(Enter / Space)同样要 stopPropagation + preventDefault ——
 *    Space 不拦会同时滚动页面。
 *
 * Codex 还把完整路径放在 tooltip 里(`span.font-mono`),因为显示的是截断过的
 * displayPath;这里用 `title` 承担同一职责(WS 的 Tooltip 组件是浮层,
 * 挂在活动行里会和表头那个 absolute 按钮抢事件)。
 */
export function InlineAnchor({ path, label }: { path: string; label?: string }): React.JSX.Element {
  const { projects, currentProject } = useWorkspace()
  const { rightPanelController } = useAppShell()

  // `src/a.ts:12` 里的行号单独拆出来做后缀
  const match = /^(.*?):(\d+)$/.exec(path)
  const filePath = match ? match[1] : path
  const suffix = match ? `:${match[2]}` : ''

  const open = (): void => {
    const resolved = resolveInProjects(filePath, projects, currentProject?.id)
    if (!resolved) return
    const rootAbsolutePath = projects.find((p) => p.id === resolved.projectId)?.rootPaths[0] ?? null
    // 会话里的文件引用 → 预览 tab(Codex HY:外部打开带 isPreview;
    // launcher/「+」打开的空 Files tab 才不是预览)
    rightPanelController.openTab({
      ...createFilesTabDescriptor(
        rightPanelController,
        resolved.relPath,
        resolved.projectId,
        rootAbsolutePath ?? undefined
      ),
      isPreview: true
    })
  }

  return (
    <span
      data-agent-activity-file-link="true"
      role="link"
      tabIndex={0}
      title={path}
      className="pointer-events-auto inline-block max-w-full cursor-interaction truncate align-bottom text-inherit underline decoration-dotted decoration-[0.5px] underline-offset-2 group-hover/activity-header:!text-token-foreground hover:!text-token-foreground"
      onClick={(e) => {
        e.stopPropagation()
        open()
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.stopPropagation()
        e.preventDefault()
        open()
      }}
    >
      {label ?? filePath}
      {suffix}
    </span>
  )
}
