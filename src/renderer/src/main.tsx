import './assets/main.css'
// VSCode 主题 token（四档，由 scripts/gen-vscode-tokens.mjs 生成）+ widget 级别名。
// 顺序要紧：widget-tokens 引用 tokens 里定义的变量。
import './chat/theme/tokens.css'
import './chat/theme/widget-tokens.css'
// 对话区的图标字体。移植过来的 VSCode CSS 里直接写 `.codicon-xxx` 选择器，
// 靠这个字体生效。
import '@vscode/codicons/dist/codicon.css'

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
