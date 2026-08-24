/**
 * turn 的三段式派生值 —— 分段、折叠头显隐、折叠头文案。
 *
 * 放在 model 层而不是 `ChatView.tsx` 里的理由与 `toolDisplay.ts` 相同:
 * 它们是纯函数、预览页与 ChatView 都要用,而 react-refresh 要求组件文件
 * 只导出组件(混着导出会让整个模块在热更新时重建,丢掉所有展开状态)。
 */
import { formatDuration } from '../../utils/time.ts'
import type { ChatContent, ChatToolInvocationContent } from './content'
import type { RenderUnit } from './renderUnits'

/**
 * 把一轮回复拆成「过程」与「最终输出」—— 照 Codex 的
 * `splitItemsIntoRenderGroups`(`assets/split-items-into-render-groups-CBZe4KAV.js`)。
 *
 * ## Codex 的真实规则(上一版我猜错了)
 *
 * 我上一版写的是"**尾部连续的** markdown 全算最终输出"。Codex 的实现是:
 *
 * ```js
 * let z = R.length - 1
 * while (R[z]?.type === 'mcp-server-elicitation') --z        // 先跳过尾部的表单请求
 * if (!isAssistantMessage(R[z])) {                            // 最后一条不是回复?
 *   let e = z
 *   for (;;) {                                                // 继续往前跳
 *     let t = R[e]
 *     if (t?.type !== 'mcp-server-elicitation' &&
 *         t?.type !== 'subagent-activity' &&
 *         (t?.type !== 'reasoning' || !t.completed)) break     // 只跳这三类
 *     --e
 *   }
 *   if (isAssistantMessage(R[e]) && R[e].phase === 'final_answer') z = e
 * }
 * const V = isAssistantMessage(R[z]) ? R[z] : null
 * if (V) R.splice(z, 1)                                        // ← 只摘走**一条**
 * ```
 *
 * 两处关键差别:
 *
 * 1. **只有一条 assistant message 进最终段**(`splice(z, 1)`),它前面的 assistant
 *    message 全都留在过程段里。我那版会把尾部所有连续 markdown 一起搬走 ——
 *    模型分两段输出正文时(中间没有工具调用),第一段会被错误地当成最终输出的一部分。
 * 2. **可以跳过尾部的"已完成推理"去找它**。也就是说"回复之后又来了一段推理"时,
 *    最终输出仍然是那条回复,推理留在过程里。位置判据不是简单的"最后一条"。
 *
 * **更正上一轮的一条结论:`phase` 协议是给的。**
 * `ThreadItem` 的 `agentMessage` 分支带 `phase: MessagePhase | null`
 * (`MessagePhase = 'commentary' | 'final_answer'`,与 Codex 逐字相同),
 * 只是此前 adapter 把它丢了。现在接上了,跳跃分支的 `phase === 'final_answer'`
 * 也照抄了。
 *
 * 注意这个判断**只在跳跃分支里**:最后一条本来就是助手文本时,Codex 无条件把它
 * 当最终回答(`V = isAssistantMessage(R[z]) ? R[z] : null`),不看 phase。
 * 所以本机 agent 一条 phase 都不发时,分段行为与之前一致 —— 变的是折叠头
 * (见 `showProcessToggle`),不是分段。
 */
export function splitTurnContent(content: ChatContent[]): {
  process: ChatContent[]
  final: ChatContent[]
} {
  const z = content.length - 1
  /*
   * Codex 在「最末位不是助手文本」时会往回跳过尾部的「已完成推理 /
   * 表单请求 / subagent 活动」去找一条 final_answer。WS 的推理与那两类
   * 条目都不进内容流,没有可跳的 —— 最末位不是 markdown 就没有最终段。
   */
  if (content[z]?.kind !== 'markdownContent') return { process: content, final: [] }
  // 只摘走这一条 —— 它前面的一切(含别的 markdown)都是过程
  return { process: [...content.slice(0, z), ...content.slice(z + 1)], final: [content[z]] }
}

/**
 * 过程段**要不要有折叠头** —— Codex 的 `showToggle`(local-conversation-turn 源码 `Ln`)。
 *
 * ## 上一轮把机制搞错了
 *
 * 之前 WS 的判据是"有过程条目就显示折叠头",文案再按"有没有时间戳"选。用户报的
 * 「调研下工控猫」turn 0 两侧不一致(WS 有「Worked for 5m 33s」,Codex 什么都没有)
 * 就是这么来的。真实机制与时长**毫无关系**:
 *
 * ```js
 * // wo() —— shouldAllowCollapse
 * mn = hasFinalAssistantStarted && !isTurnCancelled && hasRenderableAgentItems
 * jn = turnStatus == null && !showFullTranscript && !startAfterTurnIntro && mn && wn
 * Ln = jn && collapsedMessageCount > 0 && !onlyContextCompaction
 * ```
 *
 * 而 `hasFinalAssistantStarted = Yt || (!P && Et)`,`Yt = je || Dat(B)`,
 * `Dat(e) = e?.phase === 'final_answer' && (content.trim() || completed || structuredOutput)`。
 * `B` 就是被分段算法摘走的那一条(`assistantItem` = `splitTurnContent` 的 `final[0]`)。
 *
 * **所以门槛是「最终回答那条的 phase 是 final_answer」。**
 * 时长(`workedDurationMs`)只参与选文案,而且它来自 turn 自己的 `durationMs`
 * (`workedDurationMs: Bt(c) ? null : c.durationMs ?? null`),已完成的轮次基本总有值
 * —— 也就是说"没有时长就不显示折叠头"这条猜测是错的,那只会让第三档文案
 * (`N previous messages`)永远不出现。
 *
 * ## 为什么本机看不到折叠头
 *
 * 实测那条会话的 rollout(`~/.codex/sessions/.../rollout-…-01a00942-0fb5-….jsonl`):
 * 10 条 `agent_message`,`phase` **全是 null**,一条 `final_answer` 都没有。
 * 于是 `Dat(B)` 为假 → `mn` 为假 → 没有折叠头,过程条目直接摊开 ——
 * 与 Codex 实测一致。协议自己也写明了这点:"Providers do not emit this
 * consistently, so callers must treat `None` as phase unknown"。
 *
 * 所以这个折叠头在当前 agent 下是**不出现**的。这不是把功能做没了:
 * 它出不出现由数据决定,换个会发 phase 的 provider 两边会一起亮起来。
 *
 * ## 落不了地的三个前置条件
 *
 * `turnStatus == null`(Codex 的 turn 有 `terminal` 等展示态)、`!showFullTranscript`、
 * `!startAfterTurnIntro` 都是 Codex 特有的视图模式,WS 没有对应物,恒等于放行。
 * `Et`(后台 subagent 行)同理,WS 没有这一路数据。
 */
export function shouldShowProcessToggle({
  final,
  processCount,
  units,
  cancelled,
  isTurnInProgress
}: {
  final: ChatContent[]
  /** 折叠计数 —— Codex `Pn = Ao(Tn)`:组按成员数展开计 */
  processCount: number
  /** 渲染单元 —— 只用末位的形态与「只有一条压缩」判定 */
  units: RenderUnit[]
  cancelled: boolean
  /** Codex `jn` 里的 `turnStatus == null`:轮次在跑时没有折叠头,过程全部摊开 */
  isTurnInProgress: boolean
}): boolean {
  // 轮次在跑(turnStatus === 'active')→ `jn` 为假 → 没有折叠头
  if (isTurnInProgress) return false
  const assistant = final[0]
  // Dat(B):phase 必须是显式的 final_answer,且这条真的有内容
  const hasFinalAssistantStarted =
    assistant?.kind === 'markdownContent' &&
    assistant.phase === 'final_answer' &&
    assistant.content.trim().length > 0

  if (!hasFinalAssistantStarted || cancelled) return false
  // Pn > 0:折叠起来至少得有一条东西
  if (processCount === 0) return false
  /*
   * Fn —— 只有一条上下文压缩时不给折叠头。压缩条目本身就是一行"已压缩"的提示,
   * 把它收进"Worked for …"后面等于用一行字盖住另一行字。
   */
  if (
    units.length === 1 &&
    units[0].kind === 'standalone' &&
    units[0].item.kind === 'contextCompaction'
  ) {
    return false
  }
  return true
}

/**
 * 过程段折叠头的文案 —— Codex 的 `CollapsedTurnSummary`(local-conversation-turn 源码 `ca`)。
 *
 * **三档**,不是一档:
 *
 * | 条件 | Codex 文案 id | 文案 |
 * |---|---|---|
 * | 有 `workedForItem`(运行中) | —— | 一个每秒 tick 的实时计时器 |
 * | 有 `workedDurationMs` | `localConversation.workedFor` | `Worked for {time}` |
 * | 都没有 | `localConversation.previousMessagesSummary` | `{count, plural, one {# previous message} other {# previous messages}}` |
 *
 * 上一版我在没有时长时编了一句 `Worked for a moment` —— Codex 不说这句,
 * 它换成**数条数**。这不是措辞偏好:没跑过工具的轮次谈"工作了多久"本身就没意义,
 * 而"N 条之前的消息"描述的是折叠起来的**内容量**,才是折叠头该给的信息。
 *
 * 运行中的实时计时器没做:WS 的 turn 模型没有"过程段仍在进行"这个状态位
 * (`res.completedAtMs == null` 只说明这一轮没结束,不等于过程段在跑)。
 */
export function turnSummaryLabel(
  startedAtMs: number | null | undefined,
  completedAtMs: number | null | undefined,
  processCount: number
): string {
  if (startedAtMs != null && completedAtMs != null && completedAtMs > startedAtMs) {
    return `Worked for ${formatDuration(completedAtMs - startedAtMs)}`
  }
  return processCount === 1 ? '1 previous message' : `${processCount} previous messages`
}

// ── 轮次状态行(Codex `ja` + `kn`/`An`/`W`)────────────────────────────

export interface ThinkingRowState {
  /** 底部状态行是否出现 */
  visible: boolean
  /**
   * 轮次是否处于「探索中」(尾部连续 read/search/list 且有未完成) ——
   * 组表头的 active 态标签要用它(Codex `Yr` 的 isExploring 入参)。
   */
  isExploring: boolean
}

/**
 * 「思考中」状态行的显隐 —— Codex `local-conversation-turn` 的 `ja`/`W`/`kn`。
 *
 * 源码条件展开后是这样(逐条都有出处):
 *
 * ```
 * W = P && !blocking && !exploring && !anyNonExploringRunning
 *     && (!assistantStarted || !finalAnswerPhase)
 * ```
 *
 * - `P`:轮次在跑。`assistantStarted`:最终回答已有内容(流式中也算)。
 * - `blocking`:有待决审批(审批控件自己就是等待的表达)。
 * - `exploring`:尾部是连续的探索命令且有在跑的 —— 状态由组表头的
 *   active 态承担("Reading foo.ts"),底部不再重复。
 * - `anyNonExploringRunning`:最末单元是非探索类工具且在跑 —— 那行自己
 *   带流光。注意 Codex 看的是**最末一条**(`jr` 的 `on`),不是任意一条。
 * - 回答流式期间也显示(Codex 的 `On` 分支),**除非**它已明确是
 *   final_answer(那时回答本身就是收尾,没有"还在想"可言)。
 *
 * 最后:`kn` —— 最末单元是组时,状态行进组表头(thinking 态),
 * 底部不重复出现。
 */
export function thinkingRowState({
  isTurnInProgress,
  assistantStarted,
  hasFinalAnswerPhase,
  hasBlockingRequest,
  units
}: {
  isTurnInProgress: boolean
  assistantStarted: boolean
  hasFinalAnswerPhase: boolean
  hasBlockingRequest: boolean
  units: RenderUnit[]
}): ThinkingRowState {
  const lastUnit = units[units.length - 1]
  const exploring = isTurnInProgress && lastUnit != null && isExplorationRun(lastUnit)
  const lastNonExploringRunning =
    lastUnit?.kind === 'standalone' &&
    lastUnit.item.kind === 'toolInvocation' &&
    !isExplorationInvocation(lastUnit.item) &&
    isInvocationInProgress(lastUnit.item)

  const wantsRow =
    isTurnInProgress &&
    !hasBlockingRequest &&
    !exploring &&
    !lastNonExploringRunning &&
    (!assistantStarted || !hasFinalAnswerPhase)

  // kn:最末单元是组 → 状态行收进组表头(thinking 态),底部不重复
  const absorbedByGroup = wantsRow && !assistantStarted && lastUnit?.kind === 'group'
  return { visible: wantsRow && !absorbedByGroup, isExploring: exploring }
}

/** 尾部单元是否「探索中」—— 组内全是探索命令且有在跑的(Codex `jr` 的 isExploring) */
function isExplorationRun(unit: RenderUnit): boolean {
  if (unit.kind !== 'group') return false
  if (!unit.items.every(isExplorationInvocation)) return false
  return unit.items.some(isInvocationInProgress)
}

function isExplorationInvocation(content: ChatToolInvocationContent): boolean {
  const { data } = content.invocation
  return (
    data.kind === 'terminal' &&
    (data.commandKind === 'read' ||
      data.commandKind === 'search' ||
      data.commandKind === 'listFiles')
  )
}

function isInvocationInProgress(content: ChatToolInvocationContent): boolean {
  const { state } = content.invocation
  return (
    state.type === 'executing' ||
    state.type === 'streaming' ||
    state.type === 'waitingForConfirmation'
  )
}
