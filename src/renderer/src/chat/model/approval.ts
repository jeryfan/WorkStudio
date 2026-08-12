/**
 * 待用户决策的审批。
 *
 * 服务端在真正执行命令 / 落盘补丁之前会发一个**反向请求**过来，然后阻塞等应答。
 * 这一层只描述"有什么在等"，不碰协议线格式（那在 adapter/approval.ts）。
 *
 * 关键字段是 `itemId`：审批参数与对应的条目共用同一个 id，所以能把审批挂回
 * 那条工具调用上，还原上游的 `WaitingForConfirmation` 态，而不是弹一个脱离
 * 上下文的对话框——用户需要看着那条命令来决定批不批。
 */

/** 用户能给出的决定。协议还有网络/执行策略修订等分支，本项目不做 */
export type ApprovalDecision =
  /** 只批这一次 */
  | 'accept'
  /** 本次会话内同类不再问 */
  | 'acceptForSession'
  /** 拒绝执行，但轮次继续 */
  | 'decline'
  /** 放弃：请求还挂着但界面要撤掉（切换会话、轮次已结束） */
  | 'cancel'

export interface PendingApproval {
  /**
   * 回传决定的路由键。
   *
   * 不用 itemId：zsh-exec-bridge 会把一条复合命令拆成多个子命令，它们共用一个
   * itemId，各自有独立的回调（协议为此专门给了 approvalId）。用 itemId 回传会
   * 串台。
   */
  requestKey: string
  /** 对应的条目 id。审批就挂在这条工具调用上显示 */
  itemId: string
  /** 所属轮次。轮次结束时用它清掉残留的审批 */
  turnId: string
  /** 服务端给的解释，例如"需要网络访问" */
  reason: string | null
  /**
   * 没有对应条目时用来自建一条工具调用。
   *
   * 正常情况下 `item/started` 会先到，审批只是给已有条目加个状态。但到达顺序
   * 不受控，审批先到时不能什么都不显示——那样 agent 会一直等一个用户根本
   * 看不见的确认。
   */
  fallback: { kind: 'command'; command: string | null; cwd: string | null } | { kind: 'fileChange' }
}
