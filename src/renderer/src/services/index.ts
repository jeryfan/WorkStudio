import type { WorkspaceService } from './workspace/types'
import { RpcWorkspaceService } from './workspace/rpcWorkspaceService'
import type { FileService } from './file/types'
import { IpcFileService } from './file/ipcFileService'
import type { ModelService } from './model/types'
import { RpcModelService } from './model/modelService'
import type { ChatService } from './chat/types'
import { RpcChatService } from './chat/chatService'

/**
 * 服务单例 —— 全应用唯一的数据入口。
 */

/** 项目域（主进程注册表 via RPC） */
export const workspaceService: WorkspaceService = new RpcWorkspaceService()

/** 文件服务（主进程 fs via IPC） */
export const fileService: FileService = new IpcFileService()

/** 模型目录（agent via RPC，未就绪时内置兜底） */
export const modelService: ModelService = new RpcModelService()

/** 会话列表（agent via RPC + 本地注册表的置顶/归属） */
export const chatService: ChatService = new RpcChatService()
