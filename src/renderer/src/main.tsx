import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './chat/theme/ThemeProvider'
import { initAppHost } from './host/appHost'
import { notifyViewReady } from './host/hostMessages'

/*
 * 宿主握手要在 React 挂载之前发起（Codex 的 `R8e` 也在启动路径最前面）：
 * 服务树是异步就绪的，越早开始，第一次真正用到服务时越不需要等。
 * `ready` 则要在首帧之后发 —— 它的语义是"渲染层可以收事件了"，
 * 宿主收到后才会冲刷排队的通知。
 */
void initAppHost()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
)

requestAnimationFrame(() => notifyViewReady())
