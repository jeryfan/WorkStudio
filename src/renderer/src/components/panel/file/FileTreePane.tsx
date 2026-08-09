import { useState } from 'react'
import { Tree, type NodeApi, type NodeRendererProps } from 'react-arborist'
import { SearchIcon, SubmenuChevronIcon } from '../../icons'
import { FileGlyph } from './FileGlyph'
import { useElementSize } from './useElementSize'
import { useProjectTree, type TreeNode } from './useProjectTree'

interface FileTreePaneProps {
  projectId: string
  selectedPath: string | null
  onPick(relPath: string): void
}

function Row({ node, style, dragHandle }: NodeRendererProps<TreeNode>): React.JSX.Element {
  const isDir = node.data.kind === 'dir'
  return (
    <div
      ref={dragHandle}
      style={style}
      onClick={() => {
        if (isDir) node.toggle()
        else {
          node.select()
          node.tree.props.onActivate?.(node)
        }
      }}
      className={`flex h-8 cursor-default items-center gap-2 overflow-hidden whitespace-nowrap rounded-md px-2 text-[13px] text-ink ${
        node.isSelected ? 'bg-[#ececec]' : 'hover:bg-[#f2f3f5]'
      }`}
    >
      {isDir ? (
        <span
          className={`flex text-[#6b7078] transition-transform ${node.isOpen ? 'rotate-90' : ''}`}
        >
          <SubmenuChevronIcon className="size-3" />
        </span>
      ) : (
        <span className="flex size-4 shrink-0 items-center justify-center">
          <FileGlyph name={node.data.name} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{node.data.name}</span>
    </div>
  )
}

/**
 * 右侧文件树（panel/1.html .tree-pane 第 138-164 行）：
 * 250px 宽、Filter 过滤框、32px 行、目录 chevron / 文件彩色图标、选中灰底。
 * 数据懒加载 + react-arborist 虚拟滚动。
 */
export function FileTreePane({
  projectId,
  selectedPath,
  onPick
}: FileTreePaneProps): React.JSX.Element {
  const { nodes, loadChildren } = useProjectTree(projectId)
  const [filter, setFilter] = useState('')
  const { ref, width, height } = useElementSize<HTMLDivElement>()

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-white">
      <div className="shrink-0 px-2 pb-px pt-2">
        <div className="flex h-7 items-center gap-1.5 rounded-lg border border-[#e2e4e8] bg-[#f6f7f8] pl-2 pr-1.5">
          <SearchIcon className="size-4 text-[#9ba1a6]" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter files…"
            className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-ink outline-none placeholder:text-[#9ba1a6]"
          />
        </div>
      </div>
      <div ref={ref} className="min-h-0 flex-1 px-2 pb-2 pt-1">
        {height > 0 && (
          <Tree<TreeNode>
            data={nodes}
            width={width}
            height={height}
            indent={14}
            rowHeight={32}
            openByDefault={false}
            selection={selectedPath ?? undefined}
            searchTerm={filter}
            searchMatch={(node, term) => node.data.name.toLowerCase().includes(term.toLowerCase())}
            onToggle={(id) => {
              const node = findNode(nodes, id)
              if (node?.kind === 'dir' && node.children === null) void loadChildren(id)
            }}
            onActivate={(node: NodeApi<TreeNode>) => {
              if (node.data.kind === 'file') onPick(node.data.id)
            }}
          >
            {Row}
          </Tree>
        )}
      </div>
    </aside>
  )
}

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const found = findNode(n.children, id)
      if (found) return found
    }
  }
  return null
}
