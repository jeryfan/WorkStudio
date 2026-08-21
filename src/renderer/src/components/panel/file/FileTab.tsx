import { useCallback, useEffect, useState } from 'react'
import { fileService } from '../../../services'
import { useWorkspace } from '../../../state/WorkspaceContext'
import type { PanelTab } from '../../../state/PanelContext'
import { ResizeHandle } from '../../layout/ResizeHandle'
import { usePanelResize } from '../../../utils/usePanelResize'
import { highlightCode } from './highlight'
import { FileNavbar } from './FileNavbar'
import { CodePane } from './CodePane'
import { FileTreePane } from './FileTreePane'

/**
 * File tab（panel/1.html 完整页）：
 * 面包屑导航栏 + 代码预览（shiki 高亮）+ 右侧文件树（react-arborist）。
 */
export function FileTab({ tab }: { tab: PanelTab }): React.JSX.Element {
  const { projects } = useWorkspace()
  const projectId = tab.payload.projectId ?? 'ideact'
  const projectName = projects.find((p) => p.id === projectId)?.name ?? projectId

  const [selectedPath, setSelectedPath] = useState<string | null>(tab.payload.path ?? null)
  const [html, setHtml] = useState<string | null>(null)
  const [lineCount, setLineCount] = useState(0)
  const [loading, setLoading] = useState(false)
  /*
   * 文件树宽度 —— 和外壳一样改成 Codex 的方式:自己持宽度 + ResizeHandle,
   * 不再用 react-resizable-panels。树贴在右侧,所以手柄 edge='left'
   * (指针右移 = 树变窄),与右面板同一种朝向。
   */
  const [treeWidth, setTreeWidth] = useState(250)
  const [lastTreeWidth, setLastTreeWidth] = useState(250)
  const treeVisible = treeWidth > 0
  const applyTreeWidth = useCallback((desired: number): void => {
    // 与侧栏同构:低于最小值先钉住,越过折叠阈值才收起
    const next = desired <= 80 ? 0 : Math.min(Math.max(desired, 160), 480)
    setTreeWidth(next)
    if (next > 0) setLastTreeWidth(next)
  }, [])
  const treeResize = usePanelResize({ edge: 'left', size: treeWidth, onResize: applyTreeWidth })

  useEffect(() => {
    if (!selectedPath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 切换文件时同步清空预览
      setHtml(null)
      return
    }
    let cancelled = false
    setLoading(true)
    fileService
      .readFile(projectId, selectedPath)
      .then(async (code) => {
        const highlighted = await highlightCode(code, selectedPath)
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
  }, [projectId, selectedPath])

  return (
    <div className="flex h-full flex-col bg-white">
      <FileNavbar
        projectName={projectName}
        selectedPath={selectedPath}
        treeVisible={treeVisible}
        onToggleTree={() => setTreeWidth((w) => (w > 0 ? 0 : lastTreeWidth))}
      />
      {/* 代码区 flex-1 + 文件树内联宽度,手柄贴在树的左缘 —— 与外壳同一套机制 */}
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 overflow-hidden bg-white">
          <CodePane html={html} loading={loading} lineCount={lineCount} />
        </div>
        {treeVisible && (
          <div
            className="relative min-h-0 shrink-0 overflow-visible"
            style={{ width: `${treeWidth}px` }}
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
            <div className="h-full min-h-0 overflow-hidden">
              <FileTreePane
                projectId={projectId}
                selectedPath={selectedPath}
                onPick={setSelectedPath}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
