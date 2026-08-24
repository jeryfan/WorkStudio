import { ipcMain, shell } from 'electron'
import { promises as fs } from 'fs'
import { join, resolve, sep } from 'path'
import type { ProjectRegistry } from './workspace/ProjectRegistry'

/**
 * 文件服务 IPC —— 渲染进程经 preload 的 fileApi 调用。
 * 安全约束：所有路径都限制在项目根目录内。
 *
 * 根目录来自项目注册表。多根项目当前取第一个根作为文件树根,
 * 多根并列展示留待文件树支持多根后再接。
 *
 * Codex 对齐点:目录列表不做任何忽略过滤(node_modules/.git 都展示,
 * Codex 的 workspace-directory-entries 带 includeHidden:true,实测树里
 * .git / node_modules 均出现)。
 */
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB 以上拒绝预览

/** 文件搜索的遍历上限与返回上限(防止巨型工作区拖垮 IPC) */
const SEARCH_WALK_LIMIT = 20000
const SEARCH_RESULT_LIMIT = 250

let registry: ProjectRegistry | null = null

function rootOf(projectId: string): string {
  const roots = registry?.rootPathsOf(projectId) ?? []
  const root = roots[0]
  if (!root) {
    throw new Error(`Project has no directory: ${projectId}`)
  }
  return root
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

export function registerFileIpc(projectRegistry: ProjectRegistry): void {
  registry = projectRegistry
  // 外部浏览器打开链接（BrowserTab 的 new-window / 外链跳转走这里）
  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url)
    }
  })

  // 在系统文件管理器中打开项目根目录（侧栏项目悬浮卡片的路径行）。
  // 只接受 projectId，路径在主进程侧解析，渲染进程无法传任意路径。
  ipcMain.handle('shell:openProjectPath', async (_e, projectId: string) => {
    if (typeof projectId !== 'string') return
    await shell.openPath(rootOf(projectId))
  })

  ipcMain.handle(
    'file:listDir',
    async (_e, projectId: string, relPath: string): Promise<DirEntryPayload[]> => {
      const root = rootOf(projectId)
      const abs = safeResolve(root, relPath)
      const entries = await fs.readdir(abs, { withFileTypes: true })
      const result: DirEntryPayload[] = []
      for (const ent of entries) {
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

  /*
   * 文件过滤框的搜索(Codex:宿主模糊搜索 + 渲染层按 score 排序,ZUa/$Ua)。
   * 这里在遍历阶段就做子序列匹配,返回排好序的相对路径列表(仅文件,
   * Codex 的 YUa 默认 includeDirectories:false)。
   */
  ipcMain.handle(
    'file:searchFiles',
    async (_e, projectId: string, query: string): Promise<string[]> => {
      const root = rootOf(projectId)
      const q = query.trim().toLowerCase()
      if (q === '') return []
      const scored: { path: string; score: number }[] = []
      let walked = 0
      const walk = async (dir: string, rel: string): Promise<void> => {
        if (walked >= SEARCH_WALK_LIMIT || scored.length >= SEARCH_RESULT_LIMIT * 4) return
        let entries
        try {
          entries = await fs.readdir(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const ent of entries) {
          if (walked >= SEARCH_WALK_LIMIT) return
          walked++
          const childRel = rel ? `${rel}/${ent.name}` : ent.name
          if (ent.isDirectory()) {
            await walk(join(root, childRel), childRel)
          } else if (ent.isFile()) {
            // Codex:宿主按路径匹配,渲染层 `$Ua` 按文件名(label)打分排序
            const name = ent.name.toLowerCase()
            const labelScore = fuzzyScore(name, q)
            const pathScore = labelScore ?? fuzzyScore(childRel.toLowerCase(), q)
            if (pathScore != null)
              scored.push({ path: childRel, score: labelScore ?? pathScore / 10 })
          }
          if (scored.length >= SEARCH_RESULT_LIMIT * 4) return
        }
      }
      await walk(root, '')
      // Codex `$Ua`:score 降序 → 文件名 → 原顺序;这里稳定 sort 即可
      scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      return scored.slice(0, SEARCH_RESULT_LIMIT).map((s) => s.path)
    }
  )

  // join 在 searchFiles 中使用
}

/**
 * 子序列模糊打分:所有字符按序命中才得分,连续命中加分;
 * 返回 null 表示不匹配。对齐 Codex `CG(query)` 的 fzf 式语义(行为近似,
 * 常量系数不影响排序性质)。
 */
function fuzzyScore(candidate: string, query: string): number | null {
  let qi = 0
  let score = 0
  let streak = 0
  for (let i = 0; i < candidate.length && qi < query.length; i++) {
    if (candidate[i] === query[qi]) {
      streak++
      score += 1 + streak
      qi++
    } else {
      streak = 0
    }
  }
  return qi === query.length ? score : null
}
