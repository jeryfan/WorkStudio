import './assets/main.css'
// VSCode 主题 token（四档，由 scripts/gen-vscode-tokens.mjs 生成）+ widget 级别名。
// 对话区的图标字体。移植过来的 VSCode CSS 里直接写 `.codicon-xxx` 选择器，
// 靠这个字体生效。
import '@vscode/codicons/dist/codicon.css'

// 会话内容块(parts/)的样式 —— 仍是 VS Code Chat 移植版。
// A3 已把**会话骨架**换成 Codex 的 thread 结构(ThreadScrollContainer / ThreadTurn),
// 但 23 个 parts 内部的类名(interactive-* / chat-* / rendered-markdown / codicon)
// 还没换,所以这批 CSS 暂时保留。它们原先挂在 ChatList 上,ChatList 已删除。
import './chat/media/chat.css'
import './chat/media/chatContentParts.css'
import './chat/media/chatMarkdown.css'
import './chat/media/codeBlockPart.css'
import './chat/media/chatFooter.css'
import './chat/media/chatCollapsible.css'
import './chat/media/chatThinkingContent.css'
import './chat/media/chatToolInvocation.css'
import './chat/media/chatConfirmationWidget.css'
import './chat/media/chatMiscParts.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './chat/theme/ThemeProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
)
