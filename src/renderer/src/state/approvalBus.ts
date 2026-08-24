import { rpc } from '../rpc/client'
import { APPROVAL_METHODS, toApprovalResponse } from '../chat/adapter/approval'

/**
 * 审批总线 —— 多会话运行时(主会话 + 任意个 side chat)共用一个渲染进程,
 * 而 rpc.onServerRequest 每个方法只留一个处理器(Map 覆盖)。总线把
 * APPROVAL_METHODS 的注册收敛成**单例**,按 params.threadId 路由到拥有该
 * 会话的运行时;无人认领的(后台会话)维持原有行为:立刻 cancel ——
 * 不答 agent 会停在那一步。
 *
 * Codex 侧对应物是 approvalsReviewer 路由(协议字段),WS 的运行时路由在
 * 渲染层完成,语义一致。
 */

type ApprovalHandler = (method: string, params: unknown) => Promise<unknown>

interface RuntimeApprovalOwner {
  /** 该运行时当前绑定的会话(切换会话来回调用方更新) */
  getThreadId(): string | null
  handle: ApprovalHandler
}

const owners = new Set<RuntimeApprovalOwner>()
const installedMethods = new Set<string>()

function installMethod(method: string): void {
  if (installedMethods.has(method)) return
  installedMethods.add(method)
  rpc.onServerRequest(method, (params) => {
    const threadId = (params as { threadId?: string }).threadId
    for (const owner of owners) {
      if (owner.getThreadId() === threadId) return owner.handle(method, params)
    }
    // 后台会话的审批:没有任何运行时装载它,无法让用户做判断
    return toApprovalResponse('cancel')
  })
}

/** 运行时挂载时注册;返回注销函数(卸载时) */
export function registerApprovalOwner(owner: RuntimeApprovalOwner): () => void {
  for (const method of APPROVAL_METHODS) installMethod(method)
  owners.add(owner)
  return () => {
    owners.delete(owner)
  }
}
