import type { WorkspaceService } from './workspace/types'
import { LocalProjectsWorkspaceService } from './workspace/localProjectsService'
import type { FileService } from './file/types'
import { AppServerFileService } from './file/appServerFileService'
import type { ModelService } from './model/types'
import { RpcModelService } from './model/modelService'
import type { ChatService } from './chat/types'
import { RpcChatService } from './chat/chatService'

/**
 * 服务单例 —— 全应用唯一的数据入口。
 */

/** 项目域（宿主服务树 localProjects） */
export const workspaceService: WorkspaceService = new LocalProjectsWorkspaceService()

/** 文件服务（app-server 的 fs/* —— 远端工作区也走同一条） */
export const fileService: FileService = new AppServerFileService()

/** 模型目录（agent via RPC，未就绪时内置兜底） */
export const modelService: ModelService = new RpcModelService()

/** 会话列表（agent via RPC + 本地注册表的置顶/归属） */
export const chatService: ChatService = new RpcChatService()
