import { join } from 'node:path'
import type { WebContents, WebPreferences } from 'electron'
import { HOST_CHANNEL } from '@shared/host/channels'
import { browserPartition, configureBrowserSession } from './browserSession'
import type { BrowserSidebarManager } from './BrowserSidebarManager'

/**
 * `<webview>` 挂载拦截 —— 内置浏览器的安全边界就在这里。
 *
 * 取证：Codex 在应用窗口的 webContents 上监听 `will-attach-webview` /
 * `did-attach-webview`，在 will 阶段**无条件覆盖**这些字段（`qB` + `GB`）：
 *   params:         删掉 allowpopups / disablewebsecurity / webpreferences
 *   partition:      强制 persist:codex-browser-app
 *   webPreferences: session / preload 由宿主给；sandbox=true、contextIsolation=true、
 *                   webSecurity=true、nodeIntegration*=false、webviewTag=false、
 *                   plugins=false、allowRunningInsecureContent=false、disablePopups=true
 *
 * 为什么必须在主进程覆盖而不是在渲染层写对：渲染层写的一切都可能被页面脚本
 * 或注入的代码改掉；只有主进程的这次覆盖是页面无法绕过的。删掉
 * `webpreferences` 属性尤其关键 —— 那个属性能整体替换 guest 的 webPreferences。
 */
export function attachBrowserWebviewHooks(
  owner: WebContents,
  manager: BrowserSidebarManager
): () => void {
  const preloadPath = join(__dirname, '../preload/browserPage.js')

  const onWillAttach = (
    event: { preventDefault(): void },
    webPreferences: WebPreferences,
    params: Record<string, string>
  ): void => {
    // Electron 把 webview 元素的内部 instanceId 放在 params 里（不是我们的自定义属性）
    const instanceId = Number(params.instanceId)
    const route = manager.takePendingRoute(Number.isInteger(instanceId) ? instanceId : null)
    if (route == null) {
      // 没有登记过的 webview 一律拒绝：宁可少一个页面，也不放一个不受管的 guest
      console.warn('[browser] rejected unregistered webview attach', { instanceId })
      event.preventDefault()
      return
    }
    console.log('[browser] will-attach webview', {
      instanceId,
      conversationId: route.conversationId,
      browserTabId: route.browserTabId
    })

    params.partition = browserPartition()
    /*
     * 清掉 src：**宿主是唯一的导航者**（Codex 在 will-attach 里做的就是
     * `params.src = ''`）。让渲染层给的 src 生效会出现两条导航来源，
     * agent 通过 CDP 导航后渲染层一次重渲染就可能把页面拽回原来的 URL。
     */
    params.src = ''
    delete params.allowpopups
    delete params.disablewebsecurity
    delete params.webpreferences

    webPreferences.session = configureBrowserSession()
    webPreferences.preload = preloadPath
    webPreferences.sandbox = true
    webPreferences.contextIsolation = true
    webPreferences.webSecurity = true
    webPreferences.nodeIntegration = false
    webPreferences.nodeIntegrationInSubFrames = false
    webPreferences.nodeIntegrationInWorker = false
    webPreferences.allowRunningInsecureContent = false
    webPreferences.webviewTag = false
    webPreferences.plugins = false
    webPreferences.devTools = true
    /*
     * 关掉后台节流：agent 会在面板不可见时驱动页面（导航、等加载、截图），
     * 被节流的 guest 会把定时器和合成压到极低频率，表现为"agent 那边像卡住"。
     * Codex 在 will-attach 里对 browser_use 的页面做的是同一件事。
     */
    webPreferences.backgroundThrottling = false
    Object.assign(webPreferences, { disablePopups: true })
  }

  const onDidAttach = (_event: unknown, guest: WebContents): void => {
    const route = manager.attachGuest(guest)
    if (route == null) {
      console.warn('[browser] did-attach without a claimed route', { guestId: guest.id })
      return
    }
    console.log('[browser] did-attach webview', {
      guestId: guest.id,
      browserTabId: route.browserTabId
    })

    /*
     * 页面 preload 的同步询问：WebMCP 是否开启（Codex 用 ipc-message-sync，
     * 因为页面脚本注入前就要知道结果）。
     *
     * 这个监听器必须无条件挂上：`sendSync` 一旦没人应答就会把 guest 渲染进程
     * 永久挂住，连带整个窗口失去响应 —— 宁可多挂一个空监听。
     */
    guest.on('ipc-message-sync', (event, channel) => {
      if (channel === HOST_CHANNEL.getBrowserWebmcpEnabled) {
        // WebMCP 运行时未实现，恒为 false（见 preload/browserPage.ts 的说明）
        event.returnValue = false
      }
    })
  }

  owner.on('will-attach-webview', onWillAttach)
  owner.on('did-attach-webview', onDidAttach)

  return () => {
    owner.removeListener('will-attach-webview', onWillAttach)
    owner.removeListener('did-attach-webview', onDidAttach)
  }
}
