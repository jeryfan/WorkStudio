/**
 * Loading tab 内容(Codex `LocalConversationSideChatLoadingTab.pending`):
 * 居中加载指示。Codex 本体是 spinner;WS 用文字态(与 ChatView 的 Loading 同款)。
 */
export function SideChatLoadingTab(): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-token-main-surface-primary">
      <div className="text-sm text-token-description-foreground">Loading…</div>
    </div>
  )
}
