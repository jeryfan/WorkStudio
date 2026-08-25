import { whenHostServicesReady } from '../../host/appHost'
import type { RemoteAppHostServices } from '@shared/host/appHost'
import type {
  CreateProjectInput,
  ProjectSelection,
  WorkspaceSnapshot
} from '@shared/workspace/types'
import type { WorkspaceService } from './types'

/**
 * 项目域服务：走宿主服务树的 `localProjects`（Codex 的同名服务）。
 *
 * 协议里没有 project 概念（agent 只认 cwd），所以它不可能是一个 app-server
 * 方法；Codex 把它放在宿主服务树里，本项目同构。
 *
 * 所有变更方法都返回最新快照，调用方直接用返回值更新状态，
 * 不需要"改完再拉一次列表"的二次往返。
 */
export class LocalProjectsWorkspaceService implements WorkspaceService {
  private async projects(): ReturnType<typeof localProjects> {
    return localProjects()
  }

  async getSnapshot(): Promise<WorkspaceSnapshot> {
    return (await this.projects()).getSnapshot()
  }

  async createProject(input: CreateProjectInput): Promise<WorkspaceSnapshot> {
    return (await this.projects()).create(input)
  }

  async renameProject(projectId: string, name: string): Promise<WorkspaceSnapshot> {
    return (await this.projects()).rename(projectId, name)
  }

  async removeProject(projectId: string): Promise<WorkspaceSnapshot> {
    return (await this.projects()).remove(projectId)
  }

  async reorderProjects(projectIds: string[]): Promise<WorkspaceSnapshot> {
    return (await this.projects()).reorder(projectIds)
  }

  async selectProject(selection: ProjectSelection): Promise<WorkspaceSnapshot> {
    return (await this.projects()).select(selection)
  }

  async setProjectPinned(projectId: string, pinned: boolean): Promise<WorkspaceSnapshot> {
    return (await this.projects()).setPinned(projectId, pinned)
  }

  async reorderPinnedItems(itemKeys: string[]): Promise<WorkspaceSnapshot> {
    return (await this.projects()).reorderPinnedItems(itemKeys)
  }

  async reorderProjectThreads(projectId: string, chatIds: string[]): Promise<WorkspaceSnapshot> {
    return (await this.projects()).reorderThreads(projectId, chatIds)
  }

  /** 打开系统目录选择框；用户取消时返回空数组 */
  async pickDirectories(): Promise<string[]> {
    return (await this.projects()).pickDirectories()
  }
}

async function localProjects(): Promise<RemoteAppHostServices['localProjects']> {
  return (await whenHostServicesReady()).localProjects
}
