/**
 * 领域实体的本项目术语出口。
 *
 * 底下的类型由 `npm run protocol:gen` 从 agent 二进制生成，与运行时严格对齐。
 * 这里只做重命名导出——不做运行时结构转换。逐字段映射几十种条目类型的代价
 * 很高，而且上游改了字段名时映射层会静默失配；类型别名则会在重新生成后
 * 直接编译报错，问题暴露在编译期而不是运行期。
 *
 * 业务代码一律从本文件导入，不要直接引用 generated/。
 */

// ── 会话 ────────────────────────────────────────────────────────────
export type { Thread as Chat } from './generated/v2/Thread'
export type { ThreadStatus as ChatStatus } from './generated/v2/ThreadStatus'
export type { ThreadActiveFlag as ChatActiveFlag } from './generated/v2/ThreadActiveFlag'
export type { ThreadSection as ChatGroup } from './generated/v2/ThreadSection'
export type { ThreadListParams as ChatListParams } from './generated/v2/ThreadListParams'
export type { ThreadListResponse as ChatListResponse } from './generated/v2/ThreadListResponse'
export type { ThreadStartParams as ChatStartParams } from './generated/v2/ThreadStartParams'
export type { ThreadStartResponse as ChatStartResponse } from './generated/v2/ThreadStartResponse'
export type { ThreadResumeParams as ChatResumeParams } from './generated/v2/ThreadResumeParams'
export type { ThreadResumeResponse as ChatResumeResponse } from './generated/v2/ThreadResumeResponse'

// ── 轮次与条目 ──────────────────────────────────────────────────────
export type { Turn } from './generated/v2/Turn'
export type { TurnStatus } from './generated/v2/TurnStatus'
export type { TurnStartParams } from './generated/v2/TurnStartParams'
export type { ThreadItem as Entry } from './generated/v2/ThreadItem'
export type { UserInput } from './generated/v2/UserInput'

// ── 运行策略 ────────────────────────────────────────────────────────
export type { AskForApproval } from './generated/v2/AskForApproval'
export type { SandboxMode } from './generated/v2/SandboxMode'
export type { SandboxPolicy } from './generated/v2/SandboxPolicy'
export type { ReasoningEffort } from './generated/ReasoningEffort'

// ── 握手 ────────────────────────────────────────────────────────────
export type { InitializeParams } from './generated/InitializeParams'
export type { InitializeResponse } from './generated/InitializeResponse'
export type { ClientInfo } from './generated/ClientInfo'

// ── 审批（服务端反向请求） ──────────────────────────────────────────
export type { CommandExecutionRequestApprovalParams as CommandApprovalParams } from './generated/v2/CommandExecutionRequestApprovalParams'
export type { FileChangeRequestApprovalParams as FileChangeApprovalParams } from './generated/v2/FileChangeRequestApprovalParams'
export type { CommandExecutionApprovalDecision as CommandApprovalDecision } from './generated/v2/CommandExecutionApprovalDecision'
export type { FileChangeApprovalDecision } from './generated/v2/FileChangeApprovalDecision'
