import { useEffect, useState } from 'react'
import { fileService } from '../../../services'

/** 文件树节点：children 为 null 表示目录尚未加载（懒加载） */
export interface TreeNode {
  /** 相对项目根的路径，兼作 arborist 节点 id */
  id: string
  name: string
  kind: 'file' | 'dir'
  children?: TreeNode[] | null
}

/** 在树中按 id 查找节点并替换（不可变更新） */
function replaceNode(nodes: TreeNode[], id: string, patch: Partial<TreeNode>): TreeNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, ...patch }
    if (n.children) return { ...n, children: replaceNode(n.children, id, patch) }
    return n
  })
}

/**
 * 项目文件树数据：根目录首屏加载，子目录展开时懒加载。
 */
export function useProjectTree(projectId: string): {
  nodes: TreeNode[]
  loadChildren(id: string): Promise<void>
} {
  const [nodes, setNodes] = useState<TreeNode[]>([])

  useEffect(() => {
    let cancelled = false
    fileService
      .listDir(projectId, '')
      .then((entries) => {
        if (cancelled) return
        setNodes(
          entries.map((e) => ({
            id: e.relPath,
            name: e.name,
            kind: e.kind,
            ...(e.kind === 'dir' ? { children: null } : {})
          }))
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [projectId])

  const loadChildren = async (id: string): Promise<void> => {
    const entries = await fileService.listDir(projectId, id)
    setNodes((prev) =>
      replaceNode(prev, id, {
        children: entries.map((e) => ({
          id: e.relPath,
          name: e.name,
          kind: e.kind,
          ...(e.kind === 'dir' ? { children: null } : {})
        }))
      })
    )
  }

  return { nodes, loadChildren }
}
