/**
 * 审批反向请求 ⇄ 渲染模型。
 *
 * 与 `entryToContent.ts` 一样，这里是协议知识的边界：`@shared/protocol` 的类型
 * 只出现在本文件，parts 层拿到的是 `PendingApproval` / `ApprovalDecision`。
 *
 * 反向请求与普通通知的区别在于**必须应答**。不答，agent 就停在那一步不动，
 * 表现为"任务卡住"且没有任何报错——所以每条路径（批准、拒绝、切换会话、
 * 轮次结束）最终都要落到一次 respond。
 */
import { SERVER_REQUEST } from '@shared/protocol/methods'
import type {
  CommandApprovalParams,
  CommandApprovalDecision,
  FileChangeApprovalDecision,
  FileChangeApprovalParams
} from '@shared/protocol/entities'
import type { ApprovalDecision, PendingApproval } from '../model/approval'

/** 本项目处理的两种审批。权限申请与 MCP elicitation 暂不实现 */
export const APPROVAL_METHODS = [
  SERVER_REQUEST.commandApproval,
  SERVER_REQUEST.fileChangeApproval
] as const

/**
 * 反向请求参数 → 待决审批。
 *
 * `requestKey` 优先取 `approvalId`：一条复合命令被 zsh-exec-bridge 拆成多个
 * 子命令时，它们共用 itemId，只有 approvalId 能区分是在答哪一个。协议注释里
 * 说普通 shell 审批的 approvalId 是 null，那时 itemId 本身就是唯一的。
 */
export function toPendingApproval(method: string, params: unknown): PendingApproval | null {
  if (method === SERVER_REQUEST.commandApproval) {
    const p = params as CommandApprovalParams
    return {
      requestKey: p.approvalId ?? p.itemId,
      itemId: p.itemId,
      turnId: p.turnId,
      reason: p.reason ?? null,
      fallback: { kind: 'command', command: p.command ?? null, cwd: p.cwd ?? null }
    }
  }
  if (method === SERVER_REQUEST.fileChangeApproval) {
    const p = params as FileChangeApprovalParams
    return {
      requestKey: p.itemId,
      itemId: p.itemId,
      turnId: p.turnId,
      reason: p.reason ?? null,
      fallback: { kind: 'fileChange' }
    }
  }
  return null
}

/**
 * 决定 → 应答体。
 *
 * 两种审批的应答形状恰好一致（都是 `{ decision }`，字面量也同名），所以一个
 * 函数够用。协议另有 `acceptWithExecpolicyAmendment` / `applyNetworkPolicyAmendment`
 * 两种带修订的分支，需要一整套策略编辑界面，本项目不做。
 *
 * 下面两行断言是这个"恰好一致"的看门人：协议重新生成后若某一边的字面量改了名，
 * 编译在这里就断，而不是在运行时收到一个 agent 不认识的 decision 后静默卡住。
 */
type _AssertCommand = ApprovalDecision extends CommandApprovalDecision ? true : never
type _AssertFileChange = ApprovalDecision extends FileChangeApprovalDecision ? true : never
const _assert: [_AssertCommand, _AssertFileChange] = [true, true]
void _assert

export function toApprovalResponse(decision: ApprovalDecision): { decision: ApprovalDecision } {
  return { decision }
}
