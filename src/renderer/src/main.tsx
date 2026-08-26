import './assets/main.css'

import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './chat/theme/ThemeProvider'
import { LoadingIndicator } from './components/loading/LoadingIndicator'
import { initAppHost, whenStartupReady } from './host/appHost'
import { notifyViewReady } from './host/hostMessages'

/**
 * 启动序列 —— 逐段对齐 Codex 的入口 `app-main-*.js`（函数 `B()`）：
 *
 *   await initializeAppHostServices()        // 服务树握手，**render 之前**
 *   const startupReady = appServices.startup.whenReady()
 *   root.render(
 *     <StrictMode>
 *       <ErrorBoundary name="App" fallback={…}>
 *         <span ref={el => el && startup.reach('renderer_ready')} aria-hidden hidden/>
 *         <Suspense fallback={<LoadingIndicator debugName="Startup"/>}>
 *           <App startupReady={startupReady}/>
 *         </Suspense>
 *       </ErrorBoundary>
 *     </StrictMode>)
 *
 * 三处与本项目原实现不同、且都是有理由的：
 *
 * 1. **握手改成 await**。原来是 `void initAppHost()` —— 服务树还没连上就渲染，
 *    于是每个用到宿主服务的地方都得自己处理"还没连上"。Codex 在 render 前
 *    就把它 await 掉，之后 `hostServices` 一定存在。
 * 2. **`ready` 由一个隐藏 span 的 ref 发**，不再用 requestAnimationFrame。
 *    它必须在 Suspense **外面**：App 挂起期间宿主也得知道渲染层活着
 *    （宿主收到 `ready` 才冲刷排队的通知）。rAF 那种写法能凑巧生效，
 *    但顺序不是由结构保证的。
 * 3. **整个应用被 `<Suspense>` 包住**，fallback 就是那个 56px blossom 流光 ——
 *    与 index.html 里的 HTML 闪屏是同一个视觉，接管那一帧看不出切换。
 */
async function boot(): Promise<void> {
  await initAppHost()

  const root = document.getElementById('root')
  if (root == null) throw new Error('Root container not found')

  createRoot(root).render(
    <StrictMode>
      <ThemeProvider>
        {/* Codex 的那个 span：ref 触发即上报，不进视觉 */}
        <span
          ref={(el) => {
            if (el != null) notifyViewReady()
          }}
          aria-hidden
          hidden
        />
        <Suspense fallback={<LoadingIndicator debugName="Startup" />}>
          <App startupReady={whenStartupReady()} />
        </Suspense>
      </ThemeProvider>
    </StrictMode>
  )
}

void boot()
