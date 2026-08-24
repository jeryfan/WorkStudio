import { useMemo, useState } from 'react'
import { useChatRuntime } from '../state/ChatRuntimeContext'
import { Composer } from '../components/composer/Composer'
import { latestTodos, turnsToRows } from './adapter/entryToContent'
import { ChatActionsProvider } from './ChatActionsContext'
import { ThreadScrollContainer } from './ThreadScrollContainer'
import { ThreadTurn, ThreadTurnGap, ThreadUserMessage } from './ThreadTurn'
import { ThreadTurnBody } from './ThreadTurnBody'
import { MarkdownPart } from './parts/MarkdownPart'
import { TodoListPart } from './parts/TodoListPart'
import { UserMessageActions, UserMessageEditForm } from './parts/UserMessageActions'

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
 * 回复侧的渲染(过程段 / 状态行 / 最终回复)在 `ThreadTurnBody`,
 * 预览页共用 —— 两侧的差异只能来自数据,不会来自结构。
 *
 * adapter 仍然产出 request/response 两种行(那层是协议投影,与渲染无关),
 * 这里按 id 把相邻的 request+response 合成一个 turn。
 */
export function ChatView(): React.JSX.Element {
  const {
    turns,
    approvals,
    loading,
    readOnly,
    readOnlyReason,
    error,
    respondToApproval,
    editUserMessage
  } = useChatRuntime()
  const rows = useMemo(() => turnsToRows(turns, approvals), [turns, approvals])
  // 当前计划挂在输入框上方,不进回复流 —— 与上游一致,理由见 TodoListPart
  const todos = useMemo(() => latestTodos(turns), [turns])
  /*
   * 正在行内编辑的用户消息(一次至多一条,Codex 同)。
   * 只有最新一轮的用户消息可编辑(Codex 实测:历史轮没有 Edit 按钮)。
   */
  const [editingTurnKey, setEditingTurnKey] = useState<string | null>(null)

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

  const lastRequestKey = useMemo(() => {
    for (let i = turnGroups.length - 1; i >= 0; i--)
      if (turnGroups[i].request) return turnGroups[i].key
    return null
  }, [turnGroups])

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
          /*
           * Edit message 的显隐门(Codex `onEditUserMessage` 的 undefined 分支):
           * 最新一轮 + 轮次不在跑 + 会话可写。
           */
          const canEdit =
            req != null &&
            group.key === lastRequestKey &&
            !readOnly &&
            (res == null || res.isComplete)
          return (
            <ThreadTurn key={group.key} turnKey={group.key}>
              {req && (
                <ThreadUserMessage
                  unitKey={group.key}
                  sentTime={formatUserMessageTime(req.timestamp)}
                  actions={
                    <UserMessageActions
                      text={req.text}
                      onEdit={canEdit ? () => setEditingTurnKey(group.key) : undefined}
                    />
                  }
                  editing={
                    editingTurnKey === group.key ? (
                      <UserMessageEditForm
                        initialText={req.text}
                        onCancel={() => setEditingTurnKey(null)}
                        onSubmit={(text) => {
                          setEditingTurnKey(null)
                          void editUserMessage(group.key, text).catch(() => {})
                        }}
                      />
                    ) : undefined
                  }
                >
                  <MarkdownPart
                    content={{ kind: 'markdownContent', content: req.text, phase: null }}
                    textStyle="user-message"
                  />
                </ThreadUserMessage>
              )}
              {req && res && <ThreadTurnGap />}
              {res && <ThreadTurnBody row={res} isLastResponse={res.id === lastResponseId} />}
            </ThreadTurn>
          )
        })}
      </ThreadScrollContainer>
    </ChatActionsProvider>
  )
}

/** 用户消息悬浮行里的时间 —— Codex 实测形如 `Aug 16, 2:28 PM` */
function formatUserMessageTime(ms: number | null): string | undefined {
  if (ms == null) return undefined
  const d = new Date(ms)
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}
