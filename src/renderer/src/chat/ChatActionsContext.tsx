/* eslint-disable react-refresh/only-export-components -- Context 文件：Provider 与 hook 同文件是标准模式 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { ApprovalDecision } from './model/approval'

/**
 * 对话里的交互回调。
 *
 * 单独开一个 context 而不是让 part 直接用 `useChatRuntime`：后者的值里有
 * `turns`，流式期间每帧都换新引用，任何订阅它的组件都会跟着重渲染。审批按钮
 * 只需要一个稳定的回调，订阅整个运行时是不必要的代价。
 *
 * 也是分层的一部分：parts 拿到的是 `ApprovalDecision`（model 层的类型），
 * 协议的 decision 形状仍然只出现在 adapter 里。
 */
interface ChatActions {
  respondToApproval(requestKey: string, decision: ApprovalDecision): void
}

const ChatActionsContext = createContext<ChatActions | null>(null)

export function ChatActionsProvider({
  respondToApproval,
  children
}: ChatActions & { children: ReactNode }): React.JSX.Element {
  const value = useMemo(() => ({ respondToApproval }), [respondToApproval])
  return <ChatActionsContext.Provider value={value}>{children}</ChatActionsContext.Provider>
}

/**
 * 没有 Provider 时返回一组空实现而不是抛错。
 *
 * 预览页（preview.tsx）只挂 parts、不接运行时，那里按钮点了不该做事，但也不该
 * 让整棵树崩掉——审批的视觉状态本身就是要在预览里看的东西之一。
 */
export function useChatActions(): ChatActions {
  return useContext(ChatActionsContext) ?? NO_ACTIONS
}

const NO_ACTIONS: ChatActions = { respondToApproval: () => {} }
