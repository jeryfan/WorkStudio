import { useEffect, useState } from 'react'
import { fileService } from '../../../services'
import { useWorkspace } from '../../../state/WorkspaceContext'
import { highlightCode } from './highlight'
import { FileNavbar } from './FileNavbar'
import { CodePane } from './CodePane'
import { WorkspaceTreePane } from './WorkspaceTreePane'
import { FilesFolderIcon } from '../../icons'
import { baseName } from '../../../utils/workspacePath'
import { useWordWrap } from '../../../state/fileViewerPrefs'
import type { FilesTabRenderProps } from '../filesTabDescriptor'

/**
 * File tab —— Codex `ASo`(app-initial:425342)的结构移植:
 *
 *   div.flex.h-full.min-h-0.flex-col.bg-token-main-surface-primary
 *   ├ s0a(FileNavbar):面包屑(可点下拉)+ 尾部控制组(options/Open in/Toggle tree)
 *   └ div.flex.min-h-0.flex-1
 *     ├ div.min-w-0.flex-1  ← 预览;无 path 时是 Codex 空态(Zyo 家族,h2 "Open file" +
 *     │   "Select a file from the workspace tree",32px 文件夹图标)
 *     └ WorkspaceTreePane(Codex `hyo` 外壳:全局开合 + 拖宽 + UPr 弹簧;内部 qfo)
 *
 * 与 Codex 的已知差异(标记):
 * - 富编辑器(Codex `Myo`:pierre code viewer、markdown 富预览、git blame gutter)
 *   未复刻 —— 预览仍是 shiki 静态高亮;options 菜单的 rich view / git blame 项
 *   因而不渲染(Codex 对纯文本文件本就只有 copy ×2 + word wrap,实测一致)。
 */
export function FileTab({
  path,
  projectId: projectIdProp,
  onSelectFile
}: FilesTabRenderProps): React.JSX.Element {
  const [html, setHtml] = useState<string | null>(null)
  const [lineCount, setLineCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const wordWrap = useWordWrap()

  const projectId = projectIdProp ?? 'ideact'
  const { projects } = useWorkspace()
  const project = projects.find((p) => p.id === projectId)
  const projectName = project?.name ?? projectId
  const rootAbsolutePath = project?.rootPaths[0] ?? null
  const rootBaseName = rootAbsolutePath != null ? baseName(rootAbsolutePath) : projectName

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
        projectId={projectId}
        projectName={projectName}
        rootBaseName={rootBaseName}
        rootAbsolutePath={rootAbsolutePath}
        selectedPath={path === '' ? null : path}
        onSelectFile={onSelectFile}
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
            /* word wrap 是 Codex 的全局查看器偏好(vB),作用于代码容器 */
            <div className={wordWrap ? '[&_.code-shiki]:whitespace-pre-wrap h-full' : 'h-full'}>
              <CodePane html={html} loading={loading} lineCount={lineCount} />
            </div>
          )}
        </div>
        <WorkspaceTreePane
          projectId={projectId}
          activeFilePath={path === '' ? null : path}
          onSelectFile={onSelectFile}
        />
      </div>
    </div>
  )
}
