import { LOCAL } from '@shared/protocol/local'
import type { RpcRouter } from '../agent/RpcRouter'
import type { ProjectRegistry } from './ProjectRegistry'

/**
 * 会话的客户端侧状态。
 *
 * 置顶与项目归属都不在 agent 协议里：协议只认 cwd，没有 project 概念，
 * `thread/metadata/update` 也只能改 git 信息。这两项因此由本地注册表维护，
 * 随工作区快照一起下发给渲染层。
 */
export function registerChatMethods(router: RpcRouter, registry: ProjectRegistry): void {
  router.registerLocal(LOCAL.chatDecorations, () => ({
    pinnedChatIds: registry.getPinnedChatIds(),
    chatAssignments: registry.snapshot().chatAssignments
  }))

  router.registerLocal(LOCAL.chatSetPinned, (params) => {
    const { chatId, pinned } = params as { chatId: string; pinned: boolean }
    if (typeof chatId !== 'string') throw new Error('chatId is required')
    registry.setChatPinned(chatId, pinned === true)
    return registry.snapshot()
  })

  router.registerLocal(LOCAL.chatAssign, (params) => {
    const { chatId, projectId, cwd } = params as {
      chatId: string
      projectId: string | null
      cwd: string
    }
    if (typeof chatId !== 'string') throw new Error('chatId is required')
    registry.assignChat(chatId, projectId ?? null, cwd ?? '')
    return registry.snapshot()
  })

  // 会话被删除后清掉本地附带状态，避免注册表随使用无限增长
  router.registerLocal(LOCAL.chatForget, (params) => {
    const { chatId } = params as { chatId: string }
    if (typeof chatId === 'string') registry.forgetChat(chatId)
    return registry.snapshot()
  })
}
