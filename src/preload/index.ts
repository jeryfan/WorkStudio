import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { homedir } from 'os'
import { RPC_CHANNEL } from '@shared/rpc/channels'
import type { RpcMessage } from '@shared/rpc/messages'
import type { BootstrapPayload } from '@shared/workspace/types'

export interface DirEntryPayload {
  name: string
  relPath: string
  kind: 'file' | 'dir'
}

interface NativeContextMenuItemPayload {
  id: string
  label: string
  enabled?: boolean
  type?: 'normal' | 'separator'
  iconFile?: string
  submenu?: NativeContextMenuItemPayload[]
}

interface OpenTargetPayload {
  target: string
  label: string
  appPath: string
  iconFile: string
  kind: 'editor'
}

interface OpenRequestPayload {
  path: string
  target: string
  appPath?: string
  line?: number
  column?: number
}

/**
 * RPC 桥：只搬运报文，不理解协议语义。
 *
 * 请求/响应的配对、反向请求的分发都在渲染层的 RpcPeer 里完成，
 * 因此新增任何方法都不需要改动 preload。
 */
const rpcBridge = {
  send: (message: RpcMessage): void => {
    ipcRenderer.send(RPC_CHANNEL.fromView, message)
  },
  subscribe: (handler: (message: RpcMessage) => void): (() => void) => {
    const listener = (_e: unknown, message: RpcMessage): void => handler(message)
    ipcRenderer.on(RPC_CHANNEL.toView, listener)
    return () => {
      ipcRenderer.removeListener(RPC_CHANNEL.toView, listener)
    }
  }
}

/**
 * 首屏同步快照。
 *
 * 同步 IPC 会阻塞一次进程往返，代价换的是侧栏首帧就有真实数据，
 * 不出现"空列表闪一下再填充"。只在 preload 取一次并缓存。
 */
const bootstrapPayload: BootstrapPayload = ipcRenderer.sendSync(RPC_CHANNEL.bootstrap)

const bootstrap = {
  get: (): BootstrapPayload => bootstrapPayload
}

// 文件服务：经 IPC 访问主进程 fs（见 src/main/fileIpc.ts）
const fileApi = {
  listDir: (projectId: string, relPath: string): Promise<DirEntryPayload[]> =>
    ipcRenderer.invoke('file:listDir', projectId, relPath),
  readFile: (projectId: string, relPath: string): Promise<string> =>
    ipcRenderer.invoke('file:readFile', projectId, relPath),
  searchFiles: (projectId: string, query: string): Promise<string[]> =>
    ipcRenderer.invoke('file:searchFiles', projectId, query)
}

// Custom APIs for renderer
const api = {
  // 外部浏览器打开（仅 http/https，主进程侧校验）
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  // 系统文件管理器打开项目根目录（主进程侧解析路径）
  openProjectPath: (projectId: string): Promise<void> =>
    ipcRenderer.invoke('shell:openProjectPath', projectId),
  // 用户主目录，渲染层把绝对路径缩写为 ~/… 展示（侧栏项目悬浮卡片）
  homeDir: homedir()
}

/**
 * 宿主能力桥 —— 方法名沿用 Codex 的 electronBridge。
 *
 * 保持同名不是形式主义:渲染层订阅外观的那段代码可以和 Codex 逐行对照,
 * 将来 Codex 改了行为,diff 一眼就能看出来。
 */
const codexBridge = {
  windowType: 'electron' as const,
  getSystemThemeVariant: (): Promise<'light' | 'dark'> =>
    ipcRenderer.invoke('theme:getSystemVariant'),
  subscribeToSystemThemeVariant: (handler: (variant: 'light' | 'dark') => void): (() => void) => {
    const listener = (_e: unknown, variant: 'light' | 'dark'): void => handler(variant)
    ipcRenderer.on('theme:systemVariantChanged', listener)
    return () => {
      ipcRenderer.removeListener('theme:systemVariantChanged', listener)
    }
  },
  showContextMenu: (items: NativeContextMenuItemPayload[]): Promise<string | null> =>
    ipcRenderer.invoke('context-menu:show', items),
  syncCommandKeybindings: (
    list: { id: string; key: string; allowsKeyRepeat: boolean }[]
  ): Promise<void> => ipcRenderer.invoke('commands:sync-keybindings', list),
  subscribeCommand: (handler: (commandId: string) => void): (() => void) => {
    const listener = (_e: unknown, commandId: string): void => handler(commandId)
    ipcRenderer.on('codex-command', listener)
    return () => {
      ipcRenderer.removeListener('codex-command', listener)
    }
  },
  openIn: {
    listTargets: (): Promise<OpenTargetPayload[]> => ipcRenderer.invoke('open-in:list-targets'),
    open: (req: OpenRequestPayload): Promise<void> => ipcRenderer.invoke('open-in:open', req),
    saveCopy: (absolutePath: string, suggestedName?: string): Promise<boolean> =>
      ipcRenderer.invoke('open-in:save-copy', absolutePath, suggestedName)
  },
  browser: {
    saveDataUrl: (dataUrl: string, suggestedName: string): Promise<boolean> =>
      ipcRenderer.invoke('browser:save-data-url', dataUrl, suggestedName),
    clearData: (kind: 'cookies' | 'cache'): Promise<boolean> =>
      ipcRenderer.invoke('browser:clear-data', kind)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('fileApi', fileApi)
    contextBridge.exposeInMainWorld('rpcBridge', rpcBridge)
    contextBridge.exposeInMainWorld('bootstrap', bootstrap)
    contextBridge.exposeInMainWorld('codexBridge', codexBridge)
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
  // @ts-ignore (define in dts)
  window.rpcBridge = rpcBridge
  // @ts-ignore (define in dts)
  window.bootstrap = bootstrap
  // @ts-ignore (define in dts)
  window.codexBridge = codexBridge
}
