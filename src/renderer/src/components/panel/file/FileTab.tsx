import { useEffect, useState } from 'react'
import { fileService } from '../../../services'
import { useWorkspace } from '../../../state/WorkspaceContext'
import { ResizeHandle } from '../../layout/ResizeHandle'
import { usePanelResize } from '../../../utils/usePanelResize'
import { highlightCode } from './highlight'
import { FileNavbar } from './FileNavbar'
import { CodePane } from './CodePane'
import { FileTreePane } from './FileTreePane'
import { FilesFolderIcon } from '../../icons'
import { TAB_PREVIEW_PIN_EXEMPT } from '../AppShellTabPanel'
import type { FilesTabRenderProps } from '../filesTabDescriptor'

/**
 * File tab —— 面板内容与 Codex 的 file viewer(`review.fileSource.*`)对齐中。
 *
 * 本轮:描述符 props 形态(Codex `HY` 的 props 模式:path 固定在 tab 上,
 * 换文件 = 开新 tab 而不是改 state)+ 外壳层级对齐实测:
 *
 *   div.flex.h-full.min-h-0.flex-col.bg-token-main-surface-primary
 *   ├ nav[aria-label="File path"]…(FileNavbar;Codex 结构 = 面包屑 ol +
 *   │   "Toggle file tree" 按钮,原型里的 VS Code 分段按钮下轮随树一起重写)
 *   └ div.flex.min-h-0.flex-1
 *     ├ div.min-w-0.flex-1  ← 预览;无 path 时是 Codex 空态(h2 "Open file" +
 *     │   "Select a file from the workspace tree",32px 文件夹图标)
 *     └ div.relative.flex.h-full.shrink-0.border-l.border-token-border-default
 *         style: max-width:60%; width:<树宽>   [data-tab-preview-pin-exempt]
 *       ├ ResizeHandle(edge=left)
 *       └ div.flex.min-h-0.min-w-0.flex-1.flex-col  ← FileTreePane
 *
 * 已知的下轮项(Files tab 完整对齐,单独一轮):自绘虚拟树替 react-arborist、
 * 过滤框(input#workspace-directory-tree-search)、file-tree-container 自定义元素、
 * 面包屑 nav 内部结构、代码区的行号/滚动钉住。
 */
export function FileTab({
  path,
  projectId: projectIdProp,
  onSelectFile
}: FilesTabRenderProps): React.JSX.Element {
  const [html, setHtml] = useState<string | null>(null)
  const [lineCount, setLineCount] = useState(0)
  const [loading, setLoading] = useState(false)
  /*
   * 文件树宽度 —— Codex 实测默认 250、max-width 60%;手柄 edge='left'
   * (指针右移 = 树变窄),与右面板同一种朝向。
   */
  const [treeWidth, setTreeWidth] = useState(250)
  const [lastTreeWidth, setLastTreeWidth] = useState(250)
  const treeVisible = treeWidth > 0
  const applyTreeWidth = (desired: number): void => {
    // 与侧栏同构:低于最小值先钉住,越过折叠阈值才收起
    const next = desired <= 80 ? 0 : Math.min(Math.max(desired, 160), 480)
    setTreeWidth(next)
    if (next > 0) setLastTreeWidth(next)
  }
  const treeResize = usePanelResize({ edge: 'left', size: treeWidth, onResize: applyTreeWidth })

  const projectId = projectIdProp ?? 'ideact'
  const { projects } = useWorkspace()
  const projectName = projects.find((p) => p.id === projectId)?.name ?? projectId

  useEffect(() => {
    if (!path) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 切换文件时同步清空预览
      setHtml(null)
      return
    }
    let cancelled = false
    setLoading(true)
    fileService
      .readFile(projectId, path)
      .then(async (code) => {
        const highlighted = await highlightCode(code, path)
        return { highlighted, lines: code.split('\n').length }
      })
      .then(({ highlighted, lines }) => {
        if (cancelled) return
        setHtml(highlighted)
        setLineCount(lines)
      })
      .catch(() => {
        if (!cancelled) setHtml(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, path])

  return (
    <div className="flex h-full min-h-0 flex-col bg-token-main-surface-primary">
      <FileNavbar
        projectName={projectName}
        selectedPath={path === '' ? null : path}
        treeVisible={treeVisible}
        onToggleTree={() => setTreeWidth((w) => (w > 0 ? 0 : lastTreeWidth))}
      />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {path === '' ? (
            /* Codex 空态(Zyo 空态家族,与 Browser tab 同结构;这里标题套 h2) */
            <div className="flex w-full flex-col items-center justify-center px-4 py-8 text-center h-full min-h-0 p-6">
              <div className="flex w-full max-w-72 flex-col items-center gap-3">
                <div className="flex items-center justify-center [&>svg]:size-8 [&>svg]:text-token-text-secondary">
                  <FilesFolderIcon />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="text-lg leading-6 font-medium text-token-foreground">
                    <h2>Open file</h2>
                  </div>
                  <div className="text-sm text-token-text-secondary">
                    Select a file from the workspace tree
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <CodePane html={html} loading={loading} lineCount={lineCount} />
          )}
        </div>
        {treeVisible && (
          // Codex 的树列带 data-tab-preview-pin-exempt:点树不 pin 预览 tab
          <div
            {...{ [TAB_PREVIEW_PIN_EXEMPT]: 'true' }}
            className="relative flex h-full shrink-0 border-l border-token-border-default"
            style={{ maxWidth: '60%', width: treeWidth }}
          >
            <ResizeHandle
              edge="left"
              ariaLabel="Resize file tree"
              currentSize={treeWidth}
              minimumSize={160}
              maximumSize={480}
              isResizing={treeResize.isResizing}
              onPointerDown={treeResize.onPointerDown}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <FileTreePane
                projectId={projectId}
                selectedPath={path === '' ? null : path}
                onPick={(p) => onSelectFile(p, { isPreview: true })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
