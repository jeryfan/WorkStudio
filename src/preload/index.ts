import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface DirEntryPayload {
  name: string
  relPath: string
  kind: 'file' | 'dir'
}

// 文件服务：经 IPC 访问主进程 fs（见 src/main/fileIpc.ts）
const fileApi = {
  listDir: (projectId: string, relPath: string): Promise<DirEntryPayload[]> =>
    ipcRenderer.invoke('file:listDir', projectId, relPath),
  readFile: (projectId: string, relPath: string): Promise<string> =>
    ipcRenderer.invoke('file:readFile', projectId, relPath)
}

// Custom APIs for renderer
const api = {
  // 外部浏览器打开（仅 http/https，主进程侧校验）
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('fileApi', fileApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.fileApi = fileApi
}
