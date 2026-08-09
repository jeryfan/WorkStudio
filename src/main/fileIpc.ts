import { ipcMain, shell } from 'electron'
import { promises as fs } from 'fs'
import { join, resolve, sep } from 'path'

/**
 * 文件服务 IPC —— 渲染进程经 preload 的 fileApi 调用。
 * 安全约束：所有路径都限制在项目根目录内。
 *
 * mock 阶段：所有 projectId 都映射到应用工程根目录（process.cwd()）。
 * 接入真实项目管理后，这里改为查询项目注册表。
 */
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB 以上拒绝预览

/** 目录列表忽略项（prototype 文件树中也不出现这些） */
const IGNORED = new Set(['node_modules', 'out', 'dist', '.next', '.turbo'])

function rootOf(projectId: string): string {
  void projectId
  return process.cwd()
}

/** 将 (root, relPath) 解析为绝对路径并校验未逃逸根目录 */
function safeResolve(root: string, relPath: string): string {
  const abs = resolve(root, relPath || '.')
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`Path escapes project root: ${relPath}`)
  }
  return abs
}

export interface DirEntryPayload {
  name: string
  /** 相对项目根的 posix 风格路径 */
  relPath: string
  kind: 'file' | 'dir'
}

export function registerFileIpc(): void {
  // 外部浏览器打开链接（BrowserTab 的 new-window / 外链跳转走这里）
  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url)
    }
  })

  ipcMain.handle(
    'file:listDir',
    async (_e, projectId: string, relPath: string): Promise<DirEntryPayload[]> => {
      const root = rootOf(projectId)
      const abs = safeResolve(root, relPath)
      const entries = await fs.readdir(abs, { withFileTypes: true })
      const result: DirEntryPayload[] = []
      for (const ent of entries) {
        if (IGNORED.has(ent.name)) continue
        const childRel = relPath ? `${relPath}/${ent.name}` : ent.name
        if (ent.isDirectory()) {
          result.push({ name: ent.name, relPath: childRel, kind: 'dir' })
        } else if (ent.isFile()) {
          result.push({ name: ent.name, relPath: childRel, kind: 'file' })
        }
      }
      // 目录在前，各自按名称排序（与 panel/1.html 文件树一致）
      result.sort((a, b) =>
        a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)
      )
      return result
    }
  )

  ipcMain.handle('file:readFile', async (_e, projectId: string, relPath: string) => {
    const root = rootOf(projectId)
    const abs = safeResolve(root, relPath)
    const stat = await fs.stat(abs)
    if (stat.size > MAX_FILE_SIZE) {
      throw new Error(`File too large to preview (${Math.round(stat.size / 1024)}KB)`)
    }
    return fs.readFile(abs, 'utf-8')
  })

  // join 仅供后续 watch 等扩展使用
  void join
}
