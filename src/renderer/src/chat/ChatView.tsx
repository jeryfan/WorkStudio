import { useMemo } from 'react'
import { useChatRuntime } from '../state/ChatRuntimeContext'
import { Composer } from '../components/composer/Composer'
import { latestTodos, turnsToRows } from './adapter/entryToContent'
import { ChatActionsProvider } from './ChatActionsContext'
import { ThreadScrollContainer } from './ThreadScrollContainer'
import {
  ThreadAssistantMessage,
  ThreadItem,
  ThreadItems,
  ThreadProcessSection,
  ThreadTurn,
  ThreadTurnGap,
  ThreadUserMessage
} from './ThreadTurn'
import { formatDuration } from '../utils/time'
import type { ChatContent } from './model/content'
import { ChatContentPart } from './parts/ChatContentPart'
import { MarkdownPart } from './parts/MarkdownPart'
import { ChatResponseFooter } from './parts/ChatResponseFooter'
import { contentKey } from './model/contentKey'
import { responsePlainText } from './model/responseText'
import { TodoListPart } from './parts/TodoListPart'

/**
 * 会话视图 —— 骨架逐层对齐 Codex(见 ThreadScrollContainer / ThreadTurn 里的层级注释)。
 *
 * 与之前实现的三处根本差异:
 *
 * 1. **不再是"请求行 + 回复行"的扁平列表**。Codex 以 turn 为单位组织:
 *    一个 `data-turn-key` 里依次是用户消息 → 中间条目 → 最终回复,
 *    段间用空的 `div.w-full` 分隔。之前跟着 VS Code Chat 拆成两行是因为要
 *    虚拟滚动按行测高,而 Codex 不做窗口化,这个约束不存在了。
 * 2. **去掉 react-virtuoso**。Codex 靠 `[content-visibility:auto]` +
 *    `[overflow-anchor:none]`,DOM 完整,搜索定位和滚动锚点才能工作。
 * 3. **输入区在 sticky 底槽里**(`[data-thread-scroll-footer]`),是消息流的兄弟,
 *    不再作为列表的 footer 传进去。
 *
 * adapter 仍然产出 request/response 两种行(那层是协议投影,与渲染无关),
 * 这里按 id 把相邻的 request+response 合成一个 turn。
 */
export function ChatView(): React.JSX.Element {
  const { turns, approvals, loading, readOnly, readOnlyReason, error, respondToApproval } =
    useChatRuntime()
  const rows = useMemo(() => turnsToRows(turns, approvals), [turns, approvals])
  // 当前计划挂在输入框上方,不进回复流 —— 与上游一致,理由见 TodoListPart
  const todos = useMemo(() => latestTodos(turns), [turns])

  /*
   * 把扁平的 request/response 行合回 turn。
   * adapter 保证同一轮的两行 id 相同且相邻(request 在前),所以一次线性扫描即可。
   */
  const turnGroups = useMemo(() => {
    const groups: {
      key: string
      request?: (typeof rows)[number]
      response?: (typeof rows)[number]
    }[] = []
    for (const row of rows) {
      const last = groups[groups.length - 1]
      if (row.kind === 'request') {
        groups.push({ key: row.id, request: row })
      } else if (last && last.key === row.id && !last.response) {
        last.response = row
      } else {
        groups.push({ key: row.id, response: row })
      }
    }
    return groups
  }, [rows])

  const lastResponseId = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].kind === 'response') return rows[i].id
    return null
  }, [rows])

  return (
    <ChatActionsProvider respondToApproval={respondToApproval}>
      <ThreadScrollContainer
        footer={
          <>
            <TodoListPart todos={todos} />
            {/*
             * 会话级错误(resume 失败、连接断了)。轮次自身的失败已经作为
             * errorDetails 块渲染在正文里,这里只放那些不属于任何一轮的。
             * 放在输入框上方而不是消息流末尾:它描述的是"现在能不能发"。
             */}
            {error && (
              <div className="mb-2 rounded-lg bg-token-editor-error-foreground/10 px-3 py-2 text-sm text-token-editor-error-foreground">
                {error}
              </div>
            )}
            <Composer placement="thread" />
          </>
        }
      >
        {readOnly && readOnlyReason && (
          <div className="rounded-lg bg-token-editor-warning-foreground/10 px-3 py-2 text-sm text-token-editor-warning-foreground">
            {readOnlyReason}
          </div>
        )}
        {turnGroups.length === 0 && loading && (
          <div className="text-sm text-token-description-foreground">Loading…</div>
        )}
        {turnGroups.map((group) => {
          const req = group.request?.kind === 'request' ? group.request : undefined
          const res = group.response?.kind === 'response' ? group.response : undefined
          const text = res ? responsePlainText(res) : ''
          // 尾部连续的 markdown = 最终输出;它之前的一切都是过程
          const split = splitTurnContent(res?.content ?? [])
          const process = split.process
          const final = split.final
          return (
            <ThreadTurn key={group.key} turnKey={group.key}>
              {req && (
                <ThreadUserMessage unitKey={group.key}>
                  <MarkdownPart
                    content={{ kind: 'markdownContent', content: req.text }}
                    textStyle="user-message"
                  />
                </ThreadUserMessage>
              )}
              {req && res && <ThreadTurnGap />}
              {/*
               * 过程段 —— Codex 的 turn 是**三段式**:用户消息 / 过程(可折叠) /
               * 最终回复,三者是兄弟,段间夹 `div.w-full[aria-hidden]`。
               * 之前 WS 把思考、工具调用和最终 markdown 全塞在同一个
               * ThreadAssistantMessage 里,所以既没有「Worked for」折叠头,
               * 过程也没法收起来。
               *
               * 怎么分:最终输出是**尾部连续的 markdown**,它前面的一切
               * (思考、工具调用、进度、hook…)都算过程。实测依据是中间推理文字
               * 与最终回复用的是同一套结构,区别只在最终那段的父级带
               * `data-local-conversation-final-assistant` —— 所以按"位置"分而不是
               * 按"类型"分,才和 Codex 一致。
               */}
              {res && process.length > 0 && (
                <>
                  <ThreadProcessSection
                    summary={turnSummaryLabel(res.startedAtMs, res.completedAtMs, process.length)}
                  >
                    <ThreadItems>
                      {process.map((content, index) => (
                        <ThreadItem key={contentKey(content, index)}>
                          <ChatContentPart content={content} />
                        </ThreadItem>
                      ))}
                    </ThreadItems>
                  </ThreadProcessSection>
                  <ThreadTurnGap />
                </>
              )}
              {res && (
                <ThreadAssistantMessage
                  unitKey={group.key}
                  targetId={res.id}
                  sentTime={
                    res.completedAtMs != null ? formatClockTime(res.completedAtMs) : undefined
                  }
                  actions={
                    // 流式期间不给操作条:此时复制会拿到半截内容
                    res.isComplete && text.length > 0 ? (
                      <ChatResponseFooter text={text} />
                    ) : undefined
                  }
                >
                  <div
                    data-markdown-text-style="assistant-message"
                    className="codex-MarkdownRoot [&>*:last-child]:mb-0 [&>ol:first-child]:mt-0 [&>ul:first-child]:mt-0"
                  >
                    {final.map((content, index) => (
                      <ChatContentPart key={contentKey(content, index)} content={content} />
                    ))}
                  </div>
                </ThreadAssistantMessage>
              )}
              {res && res.id === lastResponseId && <ThreadTurnGap />}
            </ThreadTurn>
          )
        })}
      </ThreadScrollContainer>
    </ChatActionsProvider>
  )
}

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
 * WS 的 `ChatContent` 没有 `phase` 字段(协议不给),所以 `phase === 'final_answer'`
 * 这一条落不了地 —— 退化成"取最后一条 markdown"。这是数据缺失,不是判断错误:
 * Codex 在拿不到 phase 时走的也是 `isAssistantMessage(R[z])` 那条直接分支。
 */
function splitTurnContent(content: ChatContent[]): {
  process: ChatContent[]
  final: ChatContent[]
} {
  let z = content.length - 1
  if (content[z]?.kind !== 'markdownContent') {
    // 往前跳过"已完成的推理"(WS 没有 elicitation / subagent-activity 两类)
    let e = z
    while (e >= 0 && content[e].kind === 'thinking' && !isActiveThinking(content[e])) e -= 1
    if (content[e]?.kind === 'markdownContent') z = e
  }
  if (content[z]?.kind !== 'markdownContent') return { process: content, final: [] }
  // 只摘走这一条 —— 它前面的一切(含别的 markdown)都是过程
  return { process: [...content.slice(0, z), ...content.slice(z + 1)], final: [content[z]] }
}

function isActiveThinking(item: ChatContent): boolean {
  return item.kind === 'thinking' && item.isActive
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
function turnSummaryLabel(
  startedAtMs: number | null | undefined,
  completedAtMs: number | null | undefined,
  processCount: number
): string {
  if (startedAtMs != null && completedAtMs != null && completedAtMs > startedAtMs) {
    return `Worked for ${formatDuration(completedAtMs - startedAtMs)}`
  }
  return processCount === 1 ? '1 previous message' : `${processCount} previous messages`
}

/** `span[data-assistant-message-sent-time]` 里那个时间 —— Codex 实测形如 `Friday 12:01 AM` */
function formatClockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
