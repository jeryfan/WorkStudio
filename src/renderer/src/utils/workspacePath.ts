/**
 * 把 agent 给出的路径落到某个项目的相对路径。
 *
 * agent 说的路径可能是绝对的（`/Users/…/src/a.ts`），也可能相对项目根
 * （`src/a.ts`），两种都要能落到同一个 tab。多根项目还会让同一个相对路径在
 * 几个 root 下都成立，所以要按 root 逐个比对而不是简单截断。
 */

export function baseName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

/**
 * 优先当前项目：同名文件在多个项目里都存在时，用户多半指的是正在看的那个。
 */
export function resolveInProjects(
  path: string,
  projects: { id: string; rootPaths: string[] }[],
  preferredProjectId?: string
): { projectId: string; relPath: string } | null {
  const norm = path.replace(/\\/g, '/')
  const ordered = preferredProjectId
    ? [...projects].sort((a, b) =>
        a.id === preferredProjectId ? -1 : b.id === preferredProjectId ? 1 : 0
      )
    : projects

  for (const project of ordered) {
    for (const root of project.rootPaths) {
      const r = root.replace(/\\/g, '/').replace(/\/+$/, '')
      if (norm === r) return { projectId: project.id, relPath: '' }
      if (norm.startsWith(`${r}/`)) {
        return { projectId: project.id, relPath: norm.slice(r.length + 1) }
      }
    }
  }
  // 不是绝对路径时按当前项目的相对路径处理
  if (!norm.startsWith('/') && preferredProjectId) {
    return { projectId: preferredProjectId, relPath: norm }
  }
  return null
}
