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

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
    fileApi: FileApi
    rpcBridge: RpcBridge
    /** 首屏同步快照，preload 阶段已取好 */
    bootstrap: { get(): BootstrapPayload }
  }
}

export {}
