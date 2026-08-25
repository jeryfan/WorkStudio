/**
 * 文件服务契约 —— 渲染进程只依赖此接口。
 * 当前由 AppServerFileService 实现（app-server 的 fs/*，远端工作区同一条通路）。
 *
 * **参数都是绝对路径**：协议的 `fs/*` 只吃绝对路径，Codex 的文件 tab props 也是
 * `{cwd, path, hostId, workspaceRoot}`（app-initial `HY`），没有项目 id、也没有
 * "root + 相对路径" 这层。root 相对路径是文件树/面包屑那一层的表示（Codex 的
 * `workspace-directory-entries` 查询负责换算），不属于这层。
 */

export interface DirEntry {
  name: string
  kind: 'file' | 'dir'
}

export interface FileService {
  /** 列出某个目录的直属条目（目录在前，按名称排序） */
  listDir(directoryPath: string): Promise<DirEntry[]>
  /** 读取文本文件内容（>2MB 拒绝预览） */
  readFile(path: string): Promise<string>
  /** 模糊搜索文件（Codex 过滤框的后端）；返回绝对路径 */
  searchFiles(roots: string[], query: string): Promise<string[]>
}
