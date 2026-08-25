import { rpc } from '../../rpc/client'
import { M } from '@shared/protocol/methods'
import type { FsReadDirectoryResponse } from '@shared/protocol/generated/v2/FsReadDirectoryResponse'
import type { FsReadFileResponse } from '@shared/protocol/generated/v2/FsReadFileResponse'
import type { FuzzyFileSearchResponse } from '@shared/protocol/generated/FuzzyFileSearchResponse'
import type { DirEntry, FileService } from './types'

/**
 * 文件服务：走 app-server 的 `fs/*`，参数即协议参数（绝对路径）。
 *
 * 取证：Codex 的文件树、diff、终端全部走 app-server，而不是宿主的 fs。
 * 理由是工作区可能不在本机（ssh / wsl / remote-control 都是一等公民），
 * 只有 app-server 那一侧知道"这个路径在哪台机器上"。宿主侧的
 * `workspaceFiles` 服务只负责本机动作（另存为、临时文件、图标）。
 *
 * 这层不做任何路径拼接/相对化：root 相对 ↔ 绝对的换算在文件树的查询层
 * （`components/panel/file/directoryEntries.ts`，对应 Codex 的
 * `workspace-directory-entries`）。
 */

/** 超过这个大小拒绝预览（协议的 fs/getMetadata 不返回体积，只能读回来再判） */
const MAX_FILE_BYTES = 2 * 1024 * 1024

export class AppServerFileService implements FileService {
  async listDir(directoryPath: string): Promise<DirEntry[]> {
    const response = await rpc.request<FsReadDirectoryResponse>(M.fsReadDirectory, {
      path: directoryPath
    })
    const entries: DirEntry[] = []
    for (const entry of response.entries) {
      if (entry.isDirectory) entries.push({ name: entry.fileName, kind: 'dir' })
      else if (entry.isFile) entries.push({ name: entry.fileName, kind: 'file' })
    }
    /*
     * 目录在前、各自按名称排序。
     * 不做任何忽略过滤 —— Codex 实测树里 .git / node_modules 都在
     *（它的 workspace-directory-entries 带 includeHidden:true）。
     */
    entries.sort((a, b) =>
      a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)
    )
    return entries
  }

  async readFile(path: string): Promise<string> {
    const response = await rpc.request<FsReadFileResponse>(M.fsReadFile, { path })
    const bytes = Uint8Array.from(atob(response.dataBase64), (char) => char.charCodeAt(0))
    if (bytes.byteLength > MAX_FILE_BYTES) {
      throw new Error(`File too large to preview (${Math.round(bytes.byteLength / 1024)}KB)`)
    }
    return new TextDecoder().decode(bytes)
  }

  /** 过滤框的搜索：协议的 fuzzyFileSearch 直出，排序由服务端的 score 决定 */
  async searchFiles(roots: string[], query: string): Promise<string[]> {
    const trimmed = query.trim()
    if (trimmed === '') return []
    const response = await rpc.request<FuzzyFileSearchResponse>(M.fileSearch, {
      query: trimmed,
      roots,
      cancellationToken: null
    })
    return response.files.map((file) => file.path)
  }
}
