import type { AppShellTabPanelController } from '../../../state/AppShellContext'
import { SideChatIcon } from '../../icons'
import { forkSideChatConversation, discardSideChatConversation } from './sideChatService'
import { createSideChatTabDescriptor } from './sideChatTabDescriptor'
import { SideChatLoadingTab } from './SideChatLoadingTab'
import { seedForkedThread } from '../../../state/ChatRuntimeContext'

/**
 * 打开 side chat —— Codex `J`(local-conversation-side-chat)的移植:
 *
 * 1. 标题:数两个前缀的已有 tab(`sidechat:` / `sidechat-loading:`)+ 1;
 *    首个 "Side chat",其后 "Side chat {index}"(Codex `Te`)
 * 2. 先开 loading tab(`sidechat-loading:<sourceId>:<n>`,**isClosable=false**,
 *    内容是 LocalConversationSideChatLoadingTab.pending —— 居中加载态)
 * 3. fork(thread/fork,developerInstructions = SIDE_CHAT_INSTRUCTIONS,ephemeral)
 * 4. 开真 tab `sidechat:<id>`;**仅当目标面板当前开着才 activate**
 *    (Codex:`activate = existingConversationId != null || panelOpen`)
 * 5. 失败:关 loading tab、丢弃 fork 出的会话、抛错(调用方弹错误提示)
 */
export async function openSideChat({
  controller,
  sourceChatId,
  cwd,
  panelOpen,
  initialMessage
}: {
  controller: AppShellTabPanelController
  /** 源会话(当前 thread);Codex 要求非空(launcher 条件 `j = _ != null`) */
  sourceChatId: string
  cwd: string | null
  /** 目标面板当前是否开着(决定 activate;Codex 读面板信号) */
  panelOpen: boolean
  /**
   * 引用文本(Codex `initialMessage`):排队消息/选中文本开 side chat 时带上,
   * fork 时拼进 developerInstructions(见 sideChatService)
   */
  initialMessage?: string
}): Promise<void> {
  const count =
    controller.tabs.filter(
      (t) => t.tabId.startsWith('sidechat:') || t.tabId.startsWith('sidechat-loading:')
    ).length + 1
  const title = count === 1 ? 'Side chat' : `Side chat ${count}`
  const loadingTabId = `sidechat-loading:${sourceChatId}:${count}`

  controller.openTab({
    tabId: loadingTabId,
    title,
    icon: <SideChatIcon className="icon-sm" />,
    isClosable: false,
    defaultState: () => ({}),
    renderPanel: () => <SideChatLoadingTab />
  })

  let forkedId: string | null = null
  try {
    const thread = await forkSideChatConversation(sourceChatId, cwd, initialMessage)
    forkedId = thread.id
    seedForkedThread(thread)
    controller.openTab(createSideChatTabDescriptor(controller, thread.id, title), {
      activate: panelOpen
    })
    controller.closeTab(loadingTabId)
  } catch (error) {
    controller.closeTab(loadingTabId)
    if (forkedId != null) void discardSideChatConversation(forkedId)
    throw error
  }
}
