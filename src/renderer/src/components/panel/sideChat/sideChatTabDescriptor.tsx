import type {
  AppShellTabDescriptorInput,
  AppShellTabPanelController
} from '../../../state/AppShellContext'
import { SideChatIcon } from '../../icons'
import { SideChatTab } from './SideChatTab'
import { discardSideChatConversation } from './sideChatService'
import {
  isSkipCloseConfirmation,
  requestSideChatCloseConfirmation,
  sideChatTurnCount
} from './sideChatCloseGuard'

/**
 * Side chat tab 描述符 —— Codex `J`(local-conversation-side-chat)的 tab 部分:
 * - tabId:`sidechat:<conversationId>`(Codex `m = `sidechat:${p}``)
 * - icon:SideChatIcon(Codex 生成中会切 sparkle,WS 未接该状态 —— 标记差异)
 * - onBeforeClose:有过轮次且未勾"Don't ask again" → 否决 + 弹确认框
 *   (Codex `ke`:确认后清钩子批量关;WS 用 closeGuard 的 pending 列表)
 * - onClose:丢弃会话(Codex `discard-conversation-from-cache`;WS thread/delete)
 */
export function createSideChatTabDescriptor(
  controller: AppShellTabPanelController,
  conversationId: string,
  title: string
): AppShellTabDescriptorInput {
  const tabId = `sidechat:${conversationId}`
  return {
    tabId,
    title,
    icon: <SideChatIcon className="icon-sm" />,
    defaultState: () => ({}),
    onBeforeClose: () => {
      if (isSkipCloseConfirmation() || sideChatTurnCount(conversationId) === 0) return true
      requestSideChatCloseConfirmation([
        {
          close: () => {
            controller.updateTab(tabId, { onBeforeClose: undefined })
            controller.closeTab(tabId)
          }
        }
      ])
      return false
    },
    onClose: () => onSideChatTabClosed(conversationId),
    renderPanel: () => <SideChatTab conversationId={conversationId} />
  }
}

/** Codex `Y`:关 tab 后丢弃会话 */
export function onSideChatTabClosed(conversationId: string): void {
  void discardSideChatConversation(conversationId)
}
