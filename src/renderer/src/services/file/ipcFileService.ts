import type { DirEntry, FileService } from './types'

/** 经 preload fileApi 访问主进程文件系统 */
export class IpcFileService implements FileService {
  listDir(projectId: string, relPath = ''): Promise<DirEntry[]> {
    return window.fileApi.listDir(projectId, relPath)
  }

  readFile(projectId: string, relPath: string): Promise<string> {
    return window.fileApi.readFile(projectId, relPath)
  }
}
