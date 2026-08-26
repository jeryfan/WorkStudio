import { LoadingIndicator } from '../../loading/LoadingIndicator'

/**
 * Loading tab 内容 —— Codex `LocalConversationSideChatLoadingTab.pending`
 * (`local-conversation-side-chat` chunk 里那句
 *  `w.openTab(e, () => <Loading fillParent debugName="LocalConversationSideChatLoadingTab.pending" />, …)`)。
 *
 * 与 thread 路由的加载态是**同一个组件同一档**(fillParent),不是另一套 ——
 * 所以这里不再自己写居中壳:`fillParent` 就是 `absolute inset-0`,
 * 由 tab 面板容器提供定位上下文。
 */
export function SideChatLoadingTab(): React.JSX.Element {
  return (
    <div className="relative h-full min-h-0 bg-token-main-surface-primary">
      <LoadingIndicator fillParent debugName="LocalConversationSideChatLoadingTab.pending" />
    </div>
  )
}
