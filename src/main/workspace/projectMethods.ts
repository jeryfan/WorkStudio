import { BrowserWindow, dialog } from 'electron'
import { LOCAL } from '@shared/protocol/local'
import type {
  CreateProjectInput,
  ProjectSelection,
  RenameProjectInput
} from '@shared/workspace/types'
import type { RpcRouter } from '../agent/RpcRouter'
import type { ProjectRegistry } from './ProjectRegistry'

/**
 * 把项目注册表挂到 RPC 路由上。
 *
 * 这些方法由主进程本地处理，不转发给 agent —— 项目是客户端概念，
 * agent 侧不存在对应的接口。
 */
export function registerProjectMethods(router: RpcRouter, registry: ProjectRegistry): void {
  router.registerLocal(LOCAL.projectList, () => {
    const snapshot = registry.snapshot()
    console.log(`[workspace] project/list → ${snapshot.projects.length} project(s)`)
    return snapshot
  })

  router.registerLocal(LOCAL.projectCreate, (params) => {
    const input = params as CreateProjectInput
    if (!Array.isArray(input?.rootPaths) || input.rootPaths.length === 0) {
      throw new Error('A project needs at least one directory')
    }
    registry.create(input)
    return registry.snapshot()
  })

  router.registerLocal(LOCAL.projectRename, (params) => {
    const { projectId, name } = params as RenameProjectInput
    registry.rename(projectId, name)
    return registry.snapshot()
  })

  router.registerLocal(LOCAL.projectRemove, (params) => {
    const { projectId } = params as { projectId: string }
    registry.remove(projectId)
    return registry.snapshot()
  })

  router.registerLocal(LOCAL.projectReorder, (params) => {
    const { projectIds } = params as { projectIds: string[] }
    registry.reorder(projectIds ?? [])
    return registry.snapshot()
  })

  router.registerLocal(LOCAL.projectSelect, (params) => {
    registry.select(params as ProjectSelection)
    return registry.snapshot()
  })

  router.registerLocal(LOCAL.projectPickDirectory, async () => {
    // 挂到当前窗口上，macOS 才会以 sheet 形式呈现而不是独立窗口
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = parent
      ? await dialog.showOpenDialog(parent, {
          properties: ['openDirectory', 'createDirectory', 'multiSelections']
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory', 'multiSelections']
        })
    return { paths: result.canceled ? [] : result.filePaths }
  })
}
