/**
 * turn 的三段式派生值 —— 分段、折叠头显隐、折叠头文案。
 *
 * 放在 model 层而不是 `ChatView.tsx` 里的理由与 `toolDisplay.ts` 相同:
 * 它们是纯函数、预览页与 ChatView 都要用,而 react-refresh 要求组件文件
 * 只导出组件(混着导出会让整个模块在热更新时重建,丢掉所有展开状态)。
 */
import { formatDuration } from '../../utils/time.ts'
import type { ChatContent, ChatToolInvocationContent } from './content'
import {
  isItemInProgress,
  splitAgentActivityRuns,
  type AgentActivityRun,
  type RenderUnit
} from './renderUnits.ts'

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
 * `!showFullTranscript`、`!startAfterTurnIntro` 是 Codex 特有的视图模式,
 * `Et`(后台 subagent 行)WS 没有这一路数据,三者恒等于放行。
 *
 * ## 更正:`turnStatus == null` **不是**"轮次没在跑"
 *
 * 上一版把 `jn` 里的 `n == null` 读成"轮次不在跑",于是运行中一律不给折叠头。
 * 把轮次组件的入参逐个对完之后,那个 `n` 是 **`voiceWorkActivity`** 这个 prop
 * (同一处还有 `n === 'active'` / `n === 'terminal'` 两个比较,状态枚举不长这样),
 * 语音工作流的展示态 —— WS 没有语音,恒 `null`,恒放行。
 *
 * 于是真实行为是:**回答一开始流式产出(且 phase 是 final_answer),折叠头就出现**,
 * 而不是等轮次跑完。`wo` 那边 `isCollapsed = persistedCollapsed ?? !preventAutoCollapse`,
 * 常态下 `preventAutoCollapse` 为假 → 默认折叠 —— 所以观感是"回答一开始写,
 * 上面的过程就收成一行"。上一版要等轮次结束才收,过程条目会在回答下面多挂一阵。
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
  /** `Dat` 的 `completed` 那一支:轮次收尾了,空正文也算"回答已开始" */
  isTurnInProgress: boolean
}): boolean {
  const assistant = final[0]
  // Dat(B):phase 必须是显式的 final_answer,且这条真的有内容(或轮次已收尾)
  const hasFinalAssistantStarted =
    assistant?.kind === 'markdownContent' &&
    assistant.phase === 'final_answer' &&
    (assistant.content.trim().length > 0 || !isTurnInProgress)

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

// ── 轮次运行态(Codex `ja` + 轮次组件里的 `On`/`kn`/`An`/`W`)──────────

/**
 * Codex `ja` 的返回 —— 轮次的展示态。
 *
 * 上一版这里是个布尔("状态行显不显示")。真实的 `ja` 返回四种态,而且
 * **分支顺序就是优先级**:探索 > 计划 > 无 > 在想。四态各有承载者:
 *
 * | 态 | 谁在表达进度 |
 * |---|---|
 * | `exploring` | 组表头的 active 文案("Reading foo.ts") |
 * | `planning` | 计划卡片(协议没有 proposed-plan 条目,进不来) |
 * | `none` | 那一行工具自己的流光,或者审批控件,或者已经在写回答了 |
 * | `thinking` | 底部的 thinking-placeholder(或被组表头吸收) |
 */
export type TurnStatus =
  | { type: 'thinking'; isVisible: boolean }
  | { type: 'exploring' }
  | { type: 'planning' }
  | { type: 'none' }

/**
 * Codex `ko` + `Ea` —— 尾部连续的动态工具调用里有没有还在跑的。
 *
 * 为什么单拎出来:动态工具的摘要是"一串调用共用一行"的形态,尾部那一串
 * 只要有一个没完就仍在表达进度,底部的状态行不该再重复一句 "Thinking"。
 * Codex 还有一档 `continuesLiveActivityBetweenCalls`(工具注册表里声明
 * "两次调用之间也算活着"),WS 没有注册表,落不了地。
 */
function hasActiveDynamicToolCallSummary(
  runs: AgentActivityRun[],
  isTurnInProgress: boolean
): boolean {
  if (!isTurnInProgress) return false
  const trailing: ChatToolInvocationContent[] = []
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i]
    if (run.kind !== 'item') break
    const { item } = run
    if (
      item.kind !== 'toolInvocation' ||
      item.invocation.data.kind !== 'inputOutput' ||
      item.invocation.data.source.kind !== 'dynamic'
    ) {
      break
    }
    trailing.unshift(item)
  }
  return trailing.some(isItemInProgress)
}

/** Codex `ja` —— 轮次展示态。分支顺序即优先级,不能重排 */
export function turnStatus({
  isTurnInProgress,
  assistantInProgress,
  hasFinalAssistantStarted,
  isExploring,
  hasActiveWebSearch,
  hasActiveDynamicToolCall,
  isAnyNonExploringAgentItemInProgress,
  hasBlockingRequest
}: {
  isTurnInProgress: boolean
  /** Codex `pi(assistantItem)` —— 最终回答那条还在流 */
  assistantInProgress: boolean
  /** Codex `g(assistantItem)` = `Dat` —— 已进入 final_answer 且有内容 */
  hasFinalAssistantStarted: boolean
  isExploring: boolean
  hasActiveWebSearch: boolean
  hasActiveDynamicToolCall: boolean
  isAnyNonExploringAgentItemInProgress: boolean
  hasBlockingRequest: boolean
}): TurnStatus {
  // `forceThinking` 是外部强制档(WS 没有调用方传它)
  if (!isTurnInProgress) return { type: 'none' }
  if (isExploring) return { type: 'exploring' }
  /*
   * `pi(proposedPlanItem)` → planning:协议没有 proposed-plan 条目,
   * 这一档进不来。保留注释而不是删掉分支,是为了让这台状态机与源码同形 ——
   * 下次协议加了 plan 条目,补在这里就行。
   */
  if (
    hasBlockingRequest ||
    hasFinalAssistantStarted ||
    hasActiveWebSearch ||
    hasActiveDynamicToolCall
  ) {
    return { type: 'none' }
  }
  // 回答还在流(且还不是 final_answer)→ 仍然显示"在想",**优先于**下面那条
  if (assistantInProgress) return { type: 'thinking', isVisible: true }
  if (isAnyNonExploringAgentItemInProgress) return { type: 'none' }
  return { type: 'thinking', isVisible: true }
}

/** 轮次运行态的全部派生值 —— 渲染层照着摆就行,不再自己算条件 */
export interface TurnRunningState {
  status: TurnStatus
  /** 给组表头(`Yr`)的入参 */
  isExploring: boolean
  /** Codex `Qt` —— `isActivitySliceClosed`:回答已有内容,组表头停止播实况 */
  isActivitySliceClosed: boolean
  /** Codex `An` —— thinking-placeholder 挂不挂载 */
  showThinkingPlaceholder: boolean
  /** Codex `W` —— 挂载后可不可见(不可见时占位但 `invisible`) */
  isThinkingVisible: boolean
  /** Codex `kn` —— 状态行被最末那个组的表头吸收,底部不重复 */
  absorbedByLastUnit: boolean
}

/**
 * 轮次组件里那四个派生值。
 *
 * ```
 * Qt = H && (!P || !Pe)
 * On = P && Qt && !Yt && !jt && turnStatus.type === 'none' && postAssistantUnits.length === 0
 * kn = !Me && !hasPendingItems && turnStatus.type === 'thinking' && !Qt && lastUnit?.kind === 'group'
 * An = !Me && (turnStatus.type === 'thinking' || On) && !kn && !hasPendingItems
 * W  = (turnStatus.type === 'thinking' && turnStatus.isVisible) || On
 * ```
 *
 * 三个恒定项:`Me`(安全缓冲 UI)、`hasPendingItems`(生成图片的占位)、
 * `postAssistantUnits`(尾部的自动审批复盘)WS 都没有数据源,恒假/恒空。
 *
 * `Pe` 是按会话记的「这一轮不要自动折叠」标记(`wS` 那个派生 atom)。
 * 它同时进 `wo` 的 `preventAutoCollapse`,而 Codex 的实测行为是**完成态默认折叠**
 * —— 也就是常态下 `Pe` 为假。所以这里按 `Pe = false` 落地,`Qt` 退化成 `H`
 * (回答已有内容)。这个取值同时让 `On` 这一档活着:回答在流式产出**旁白**
 * (phase 不是 final_answer)、而某个非探索工具正在跑时,底部仍显示"在想"。
 */
export function turnRunningState({
  process,
  units,
  isTurnInProgress,
  assistantContent,
  assistantPhase,
  hasBlockingRequest
}: {
  process: ChatContent[]
  units: RenderUnit[]
  isTurnInProgress: boolean
  /** 最终回答那条的正文;没有最终回答时为 null */
  assistantContent: string | null
  assistantPhase: 'commentary' | 'final_answer' | null
  hasBlockingRequest: boolean
}): TurnRunningState {
  /*
   * `Nt = pi(assistantItem) || pi(proposedPlanItem)` —— 助手正文还在流。
   * WS 的条目级 `completed` 没有,用轮次状态做代理:轮次在跑且已经有最终回答
   * 那条,就是它在流。
   */
  const assistantInProgress = assistantContent != null && isTurnInProgress
  // `H` —— 回答那条已经有内容(或轮次收尾了)
  const assistantHasContent =
    assistantContent != null && (assistantContent.trim().length > 0 || !isTurnInProgress)
  // `Yt = je || g(B)`,`g` = `Dat`:phase 必须是显式的 final_answer 且这条真有内容
  const hasFinalAssistantStarted = assistantPhase === 'final_answer' && assistantHasContent

  const { renderableAgentItems, isExploring, isAnyNonExploringAgentItemInProgress } =
    splitAgentActivityRuns({
      items: process,
      isTurnInProgress,
      isAnyNonAgentItemInProgress: assistantInProgress
    })

  const lastRun = renderableAgentItems[renderableAgentItems.length - 1]
  const status = turnStatus({
    isTurnInProgress,
    assistantInProgress,
    hasFinalAssistantStarted,
    isExploring,
    hasActiveWebSearch:
      isTurnInProgress &&
      lastRun?.kind === 'item' &&
      lastRun.item.kind === 'toolInvocation' &&
      lastRun.item.invocation.data.kind === 'search',
    hasActiveDynamicToolCall: hasActiveDynamicToolCallSummary(
      renderableAgentItems,
      isTurnInProgress
    ),
    isAnyNonExploringAgentItemInProgress,
    hasBlockingRequest
  })

  const isActivitySliceClosed = assistantHasContent

  const lastUnit = units[units.length - 1]
  // `On`
  const showThinkingWhileCommentaryStreams =
    isTurnInProgress &&
    isActivitySliceClosed &&
    !hasFinalAssistantStarted &&
    !hasBlockingRequest &&
    status.type === 'none'
  // `kn`
  const absorbedByLastUnit =
    status.type === 'thinking' && !isActivitySliceClosed && lastUnit?.kind === 'group'
  // `An`
  const showThinkingPlaceholder =
    (status.type === 'thinking' || showThinkingWhileCommentaryStreams) && !absorbedByLastUnit
  // `W`
  const isThinkingVisible =
    (status.type === 'thinking' && status.isVisible) || showThinkingWhileCommentaryStreams

  return {
    status,
    isExploring,
    isActivitySliceClosed,
    showThinkingPlaceholder,
    isThinkingVisible,
    absorbedByLastUnit
  }
}
