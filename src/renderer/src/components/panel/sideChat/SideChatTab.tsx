import { useEffect } from 'react'
import { SideChatRuntimeProvider, useChatRuntime } from '../../../state/ChatRuntimeContext'
import { ChatView } from '../../../chat/ChatView'
import { markSideChatTurn } from './sideChatCloseGuard'

/**
 * Side chat tab 内容 —— Codex 的 local-conversation-thread:面板里是一个完整的
 * 本地会话线程(消息流 + composer),由独立的会话运行时承载(与主会话并存)。
 *
 * WS 复用 ChatView(它消费最近的 ChatRuntimeContext —— SideChatRuntimeProvider
 * 把 fork 出的会话钉进去,Composer/ThreadTurn 等零改动)。
 */
export function SideChatTab({ conversationId }: { conversationId: string }): React.JSX.Element {
  return (
    <SideChatRuntimeProvider conversationId={conversationId}>
      <div className="flex h-full min-h-0 flex-col bg-token-main-surface-primary">
        <SideChatActivityMarker conversationId={conversationId} />
        <ChatView />
      </div>
    </SideChatRuntimeProvider>
  )
}

/** 轮次计数同步给关闭守卫(Codex `le` signalFamily:有轮次的会话关闭要确认) */
function SideChatActivityMarker({ conversationId }: { conversationId: string }): null {
  const { turns } = useChatRuntime()
  useEffect(() => {
    if (turns.length > 0) markSideChatTurn(conversationId)
  }, [conversationId, turns.length])
  return null
}
