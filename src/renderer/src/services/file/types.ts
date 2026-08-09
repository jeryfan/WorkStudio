/**
 * 文件服务契约 —— 渲染进程只依赖此接口。
 * 当前由 IpcFileService 实现（主进程 fs，见 src/main/fileIpc.ts）。
 */

export interface DirEntry {
  name: string
  /** 相对项目根的 posix 风格路径 */
  relPath: string
  kind: 'file' | 'dir'
}

export interface FileService {
  /** 列出项目内某目录的直属条目（目录在前，按名称排序） */
  listDir(projectId: string, relPath?: string): Promise<DirEntry[]>
  /** 读取文本文件内容（>2MB 拒绝预览） */
  readFile(projectId: string, relPath: string): Promise<string>
}
