import type { WorkspaceService } from './workspace/types'
import { MockWorkspaceService } from './workspace/mockWorkspaceService'
import type { FileService } from './file/types'
import { IpcFileService } from './file/ipcFileService'

/**
 * 服务单例 —— 全应用唯一的数据入口。
 * 切换真实后端时只改这里。
 */
export const workspaceService: WorkspaceService = new MockWorkspaceService()

/** 文件服务（主进程 fs via IPC） */
export const fileService: FileService = new IpcFileService()
