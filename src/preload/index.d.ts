import { ElectronAPI } from '@electron-toolkit/preload'
import type { RpcMessage } from '@shared/rpc/messages'
import type { BootstrapPayload } from '@shared/workspace/types'

interface DirEntryPayload {
  name: string
  relPath: string
  kind: 'file' | 'dir'
}

interface FileApi {
  listDir(projectId: string, relPath: string): Promise<DirEntryPayload[]>
  readFile(projectId: string, relPath: string): Promise<string>
  searchFiles(projectId: string, query: string): Promise<string[]>
}

interface Api {
  openExternal(url: string): Promise<void>
  openProjectPath(projectId: string): Promise<void>
  homeDir: string
}

/** JSON-RPC 报文桥，语义由渲染层的 RpcPeer 解释 */
interface RpcBridge {
  send(message: RpcMessage): void
  subscribe(handler: (message: RpcMessage) => void): () => void
}

/** 宿主能力桥,方法名与 Codex 的 electronBridge 一致 */
interface CodexBridge {
  windowType: 'electron'
  getSystemThemeVariant(): Promise<'light' | 'dark'>
  subscribeToSystemThemeVariant(handler: (variant: 'light' | 'dark') => void): () => void
  /** 原生右键菜单(Codex 同名);返回选中项 id,取消为 null */
  showContextMenu(items: NativeContextMenuItemPayload[]): Promise<string | null>
  /** 命令注册表:键位表同步 + 主进程命中后的命令消息(Codex 宿主消息的同构) */
  syncCommandKeybindings(
    list: { id: string; key: string; allowsKeyRepeat: boolean }[]
  ): Promise<void>
  subscribeCommand(handler: (commandId: string) => void): () => void
  /** Open in:已安装编辑器目标列表 / 打开文件 / 另存为 */
  openIn: {
    listTargets(): Promise<OpenTargetPayload[]>
    open(req: OpenRequestPayload): Promise<void>
    saveCopy(absolutePath: string, suggestedName?: string): Promise<boolean>
  }
  /** Browser tab 宿主能力(截图落盘 / 清浏览数据) */
  browser: {
    saveDataUrl(dataUrl: string, suggestedName: string): Promise<boolean>
    clearData(kind: 'cookies' | 'cache'): Promise<boolean>
  }
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

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
    fileApi: FileApi
    rpcBridge: RpcBridge
    /** 首屏同步快照，preload 阶段已取好 */
    bootstrap: { get(): BootstrapPayload }
    codexBridge: CodexBridge
  }
}

export {}
