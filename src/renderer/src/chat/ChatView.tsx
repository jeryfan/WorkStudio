import { useMemo } from 'react'
import { useChatRuntime } from '../state/ChatRuntimeContext'
import { Composer } from '../components/composer/Composer'
import { latestTodos, turnsToRows } from './adapter/entryToContent'
import { ChatActionsProvider } from './ChatActionsContext'
import { ChatList } from './ChatList'
import { TodoListPart } from './parts/TodoListPart'

/**
 * 对话视图 —— 新实现的入口，对应旧的 `components/session/SessionView`。
 *
 * 这一层很薄：拿轮次、投影成行、交给列表。所有协议知识在 adapter，所有渲染
 * 知识在 parts，这里两边都不碰。
 *
 * 但它是**整页**，不只是消息流：输入区、只读横幅、会话级错误都归它。上游的
 * `.interactive-session` 同样把输入区包在里面（`.interactive-input-part` 是
 * `.interactive-list` 的兄弟），所以 Composer 作为 footer 传给 ChatList，
 * 而不是套在外层——那样高度就得自己算，还会盖住最后一条消息。
 *
 * 待决审批作为 `turnsToRows` 的第二个入参，而不是让审批按钮自己去 context 里
 * 取：这样"某条工具调用正等确认"是一个纯函数的输出，可以脱离 React 断言
 * （见 verify-chat-adapter.mjs）。回传决定才走 context——那是副作用，本来就
 * 不属于投影。
 */
export function ChatView(): React.JSX.Element {
  const { turns, approvals, loading, readOnly, readOnlyReason, error, respondToApproval } =
    useChatRuntime()
  const rows = useMemo(() => turnsToRows(turns, approvals), [turns, approvals])
  // 当前计划挂在输入框上方，不进回复流——与上游一致，理由见 TodoListPart
  const todos = useMemo(() => latestTodos(turns), [turns])

  return (
    <ChatActionsProvider respondToApproval={respondToApproval}>
      {/* pt-11：TopBar 是 fixed 的悬浮层，不留出来第一条消息会被压在底下 */}
      <div className="flex h-full min-h-0 flex-col pt-11">
        {readOnly && readOnlyReason && (
          <div className="mx-auto mt-2 w-full max-w-[950px] shrink-0 px-8">
            <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700">
              {readOnlyReason}
            </div>
          </div>
        )}

        <ChatList
          rows={rows}
          placeholder={loading ? 'Loading…' : null}
          footer={
            <>
              <TodoListPart todos={todos} />
              {/*
               * 会话级错误（resume 失败、连接断了）。轮次自身的失败已经作为
               * errorDetails 块渲染在正文里，这里只放那些不属于任何一轮的。
               * 放在输入框上方而不是消息流末尾：它描述的是"现在能不能发"。
               */}
              {error && (
                <div className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-600">
                  {error}
                </div>
              )}
              <Composer inline />
            </>
          }
        />
      </div>
    </ChatActionsProvider>
  )
}
