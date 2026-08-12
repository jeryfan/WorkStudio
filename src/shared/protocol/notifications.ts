/**
 * 通知订阅策略。
 *
 * 握手时把 `false` 项作为 `optOutNotificationMethods` 下发，agent 便不再推送
 * 这些通知。这是一项实打实的带宽优化——原始响应流与进程输出流的量级远超
 * UI 实际消费的部分，退订后进程间传输量能降一个数量级。
 *
 * 本表**穷举**当前协议版本声明的全部通知：`Record<NotificationMethod, boolean>`
 * 要求每个方法都有取值，因此重新生成协议类型后若出现新方法，编译会直接失败，
 * 强制显式表态，避免新通知被默默忽略或默默放行。
 */

import type { ServerNotification } from './generated/ServerNotification'

type NotificationMethod = ServerNotification['method']

export const NOTIFICATION_POLICY: Record<NotificationMethod, boolean> = {
  // ── 会话生命周期 ──────────────────────────────────────────────
  'thread/started': true,
  'thread/status/changed': true,
  'thread/name/updated': true,
  'thread/settings/updated': true,
  'thread/tokenUsage/updated': true,
  'thread/archived': true,
  'thread/unarchived': true,
  'thread/deleted': true,
  'thread/closed': true,
  'thread/goal/updated': true,
  'thread/goal/cleared': true,

  // ── 轮次 ──────────────────────────────────────────────────────
  'turn/started': true,
  'turn/completed': true,
  'turn/diff/updated': true,
  'turn/plan/updated': true,

  // 钩子在 turn 内、条目产出之前执行，UI 需要据此显示"正在执行钩子"
  'hook/started': true,
  'hook/completed': true,

  // ── 条目（会话视图的主数据源）────────────────────────────────
  'item/started': true,
  'item/completed': true,
  'item/agentMessage/delta': true,
  'item/reasoning/summaryTextDelta': true,
  'item/reasoning/summaryPartAdded': true,
  'item/reasoning/textDelta': true,
  'item/commandExecution/outputDelta': true,
  'item/commandExecution/terminalInteraction': true,
  'item/fileChange/outputDelta': true,
  'item/fileChange/patchUpdated': true,
  'item/mcpToolCall/progress': true,
  'item/autoApprovalReview/started': true,
  'item/autoApprovalReview/completed': true,

  // ── 环境与扩展 ────────────────────────────────────────────────
  'mcpServer/startupStatus/updated': true,
  'mcpServer/oauthLogin/completed': true,
  'skills/changed': true,
  'app/list/updated': true,
  'fs/changed': true,
  'serverRequest/resolved': true,

  // ── 账号与模型 ────────────────────────────────────────────────
  'account/updated': true,
  'account/rateLimits/updated': true,
  'account/login/completed': true,
  'model/rerouted': true,
  'model/verification': true,
  'model/safetyBuffering/updated': true,

  // ── 提示类 ────────────────────────────────────────────────────
  error: true,
  warning: true,
  guardianWarning: true,
  configWarning: true,
  deprecationNotice: true,
  'windowsSandbox/setupCompleted': true,
  'fuzzyFileSearch/sessionUpdated': true,
  'fuzzyFileSearch/sessionCompleted': true,
  'externalAgentConfig/import/completed': true,

  // ── 退订：原始流，量大且 UI 不消费 ───────────────────────────
  // 条目层面的 delta 已经覆盖了渲染所需，原始响应流只在排障时有用。
  'rawResponse/completed': false,
  'rawResponseItem/completed': false,

  /*
   * 退订：计划的流式增量。
   *
   * 协议自己标了 EXPERIMENTAL，并注明"不要假设拼接起来的增量等于完成后的
   * 条目内容"——那就没法拿它做增量渲染。计划的最终状态由 turn/plan/updated
   * （结构化，带每一步状态）和 item/completed（文本）给到，两者都是全量。
   */
  'item/plan/delta': false,

  // ── 退订：独立进程/终端流 ─────────────────────────────────────
  // 终端面板走 command/exec 请求-响应通道单独订阅，不需要全局广播。
  'command/exec/outputDelta': false,
  'process/outputDelta': false,
  'process/exited': false,

  // ── 退订：本项目暂未实现的能力 ───────────────────────────────
  'thread/realtime/started': false,
  'thread/realtime/closed': false,
  'thread/realtime/error': false,
  'thread/realtime/itemAdded': false,
  'thread/realtime/sdp': false,
  'thread/realtime/outputAudio/delta': false,
  'thread/realtime/transcript/delta': false,
  'thread/realtime/transcript/done': false,
  'remoteControl/status/changed': false,
  'externalAgentConfig/import/progress': false,
  'thread/environment/connected': false,
  'thread/environment/disconnected': false,
  'windows/worldWritableWarning': false,
  'turn/moderationMetadata': false,
  // 压缩完成会通过 item/completed 体现，单独的通知目前无消费方
  'thread/compacted': false
}

/** 握手时下发的退订清单 */
export const OPT_OUT_NOTIFICATIONS: string[] = Object.entries(NOTIFICATION_POLICY)
  .filter(([, subscribed]) => !subscribed)
  .map(([method]) => method)

/** 本项目订阅的通知，用于事件转发时的白名单校验 */
export const SUBSCRIBED_NOTIFICATIONS = new Set<string>(
  Object.entries(NOTIFICATION_POLICY)
    .filter(([, subscribed]) => subscribed)
    .map(([method]) => method)
)
