import { useEffect, useState } from 'react'
import { Group, Panel, usePanelRef } from 'react-resizable-panels'
import { fileService } from '../../../services'
import { useWorkspace } from '../../../state/WorkspaceContext'
import type { PanelTab } from '../../../state/PanelContext'
import { VerticalSeparator } from '../../layout/separators'
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
  const [treeVisible, setTreeVisible] = useState(true)
  const treeRef = usePanelRef()

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
        onToggleTree={() => {
          const panel = treeRef.current
          if (!panel) return
          if (panel.isCollapsed()) panel.expand()
          else panel.collapse()
        }}
      />
      <div className="min-h-0 flex-1">
        {/* 文件树也可拉伸：嵌套 Group，树面板 160-480px，
            同样支持拖过 minSize 自动折叠（collapsible） */}
        <Group orientation="horizontal" className="h-full">
          <Panel id="code-pane" minSize="200px" className="min-h-0">
            <div className="relative h-full min-w-0 overflow-hidden bg-white">
              <CodePane html={html} loading={loading} lineCount={lineCount} />
            </div>
          </Panel>
          <VerticalSeparator />
          <Panel
            id="tree-pane"
            panelRef={treeRef}
            defaultSize="250px"
            minSize="160px"
            maxSize="480px"
            collapsible
            collapsedSize={0}
            onResize={(size) => setTreeVisible(size.inPixels > 1)}
            className="min-h-0"
          >
            <FileTreePane
              projectId={projectId}
              selectedPath={selectedPath}
              onPick={setSelectedPath}
            />
          </Panel>
        </Group>
      </div>
    </div>
  )
}
