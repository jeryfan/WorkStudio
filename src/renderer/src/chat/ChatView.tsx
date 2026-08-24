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
import { shouldShowProcessToggle, splitTurnContent, turnSummaryLabel } from './model/turnSections'
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
                    content={{ kind: 'markdownContent', content: req.text, phase: null }}
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
                    showToggle={shouldShowProcessToggle({
                      final,
                      process,
                      cancelled: res.isCanceled
                    })}
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

/** `span[data-assistant-message-sent-time]` 里那个时间 —— Codex 实测形如 `Friday 12:01 AM` */
function formatClockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
