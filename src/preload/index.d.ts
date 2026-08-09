import { ElectronAPI } from '@electron-toolkit/preload'

interface DirEntryPayload {
  name: string
  relPath: string
  kind: 'file' | 'dir'
}

interface FileApi {
  listDir(projectId: string, relPath: string): Promise<DirEntryPayload[]>
  readFile(projectId: string, relPath: string): Promise<string>
}

interface Api {
  openExternal(url: string): Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
    fileApi: FileApi
  }
}

export {}
