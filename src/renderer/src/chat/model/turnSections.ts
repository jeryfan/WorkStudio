/**
 * turn 的三段式派生值 —— 分段、折叠头显隐、折叠头文案。
 *
 * 放在 model 层而不是 `ChatView.tsx` 里的理由与 `toolDisplay.ts` 相同:
 * 它们是纯函数、预览页与 ChatView 都要用,而 react-refresh 要求组件文件
 * 只导出组件(混着导出会让整个模块在热更新时重建,丢掉所有展开状态)。
 */
import { formatDuration } from '../../utils/time'
import type { ChatContent } from './content'

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
  let z = content.length - 1
  if (content[z]?.kind !== 'markdownContent') {
    // 往前跳过"已完成的推理"(WS 没有 elicitation / subagent-activity 两类)
    let e = z
    while (e >= 0 && content[e].kind === 'thinking' && !isActiveThinking(content[e])) e -= 1
    /*
     * 只有**明确标了 `final_answer`** 的才值得往回跳。phase 未知(null)时不跳:
     * 那等于凭"它是 markdown"就把推理之前的一段旁白提成最终回答,
     * 而 Codex 在这一支上要求的正是显式的 final_answer。
     */
    const candidate = content[e]
    if (candidate?.kind === 'markdownContent' && candidate.phase === 'final_answer') z = e
  }
  if (content[z]?.kind !== 'markdownContent') return { process: content, final: [] }
  // 只摘走这一条 —— 它前面的一切(含别的 markdown)都是过程
  return { process: [...content.slice(0, z), ...content.slice(z + 1)], final: [content[z]] }
}

function isActiveThinking(item: ChatContent): boolean {
  return item.kind === 'thinking' && item.isActive
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
  process,
  cancelled
}: {
  final: ChatContent[]
  process: ChatContent[]
  cancelled: boolean
}): boolean {
  const assistant = final[0]
  // Dat(B):phase 必须是显式的 final_answer,且这条真的有内容
  const hasFinalAssistantStarted =
    assistant?.kind === 'markdownContent' &&
    assistant.phase === 'final_answer' &&
    assistant.content.trim().length > 0

  if (!hasFinalAssistantStarted || cancelled) return false
  // Pn > 0:折叠起来至少得有一条东西
  if (process.length === 0) return false
  /*
   * Fn —— 只有一条上下文压缩时不给折叠头。压缩条目本身就是一行"已压缩"的提示,
   * 把它收进"Worked for …"后面等于用一行字盖住另一行字。
   */
  if (process.length === 1 && process[0].kind === 'contextCompaction') return false
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
