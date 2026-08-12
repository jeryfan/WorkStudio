import { rpc } from '../../rpc/client'
import { LOCAL } from '@shared/protocol/local'
import type {
  CreateProjectInput,
  ProjectSelection,
  WorkspaceSnapshot
} from '@shared/workspace/types'
import type { WorkspaceService } from './types'

/**
 * 项目域服务：经 RPC 调用主进程的项目注册表。
 *
 * 所有变更方法都返回最新快照，调用方直接用返回值更新状态，
 * 不需要"改完再拉一次列表"的二次往返。
 */
export class RpcWorkspaceService implements WorkspaceService {
  getSnapshot(): Promise<WorkspaceSnapshot> {
    return rpc.request<WorkspaceSnapshot>(LOCAL.projectList)
  }

  createProject(input: CreateProjectInput): Promise<WorkspaceSnapshot> {
    return rpc.request<WorkspaceSnapshot>(LOCAL.projectCreate, input)
  }

  renameProject(projectId: string, name: string): Promise<WorkspaceSnapshot> {
    return rpc.request<WorkspaceSnapshot>(LOCAL.projectRename, { projectId, name })
  }

  removeProject(projectId: string): Promise<WorkspaceSnapshot> {
    return rpc.request<WorkspaceSnapshot>(LOCAL.projectRemove, { projectId })
  }

  reorderProjects(projectIds: string[]): Promise<WorkspaceSnapshot> {
    return rpc.request<WorkspaceSnapshot>(LOCAL.projectReorder, { projectIds })
  }

  selectProject(selection: ProjectSelection): Promise<WorkspaceSnapshot> {
    return rpc.request<WorkspaceSnapshot>(LOCAL.projectSelect, selection)
  }

  /** 打开系统目录选择框；用户取消时返回空数组 */
  async pickDirectories(): Promise<string[]> {
    const { paths } = await rpc.request<{ paths: string[] }>(LOCAL.projectPickDirectory)
    return paths
  }
}
