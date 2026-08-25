/**
 * 内置浏览器的会话作用域。
 *
 * Codex 的浏览器 tab 是**挂在会话（conversation）上**的：路由键是
 * `(conversationId, browserTabId)`，会话切走时页面继续活着，browser_use 也按
 * conversationId 找页。
 *
 * 本项目的右面板 tab 目前还不带 conversationId（AppShell 层没有把当前会话
 * 传进面板），所以先用一个模块级的当前作用域顶着，等会话运行时把 threadId
 * 接进 AppShell 后改成从上下文读。**这是已知偏差，不是最终形态。**
 */
let activeConversationId = 'app'

export function browserConversationId(): string {
  return activeConversationId
}

export function setBrowserConversationId(conversationId: string): void {
  activeConversationId = conversationId === '' ? 'app' : conversationId
}
