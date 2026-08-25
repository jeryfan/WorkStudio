/**
 * 宿主 IPC 通道 —— 通道名与 Codex 桌面版逐字一致。
 *
 * 取证：`ChatGPT.app/Contents/Resources/app.asar/.vite/build/preload.js` 与
 * 主进程 chunk `window-all-closed-*.js`（常量 cH/lH/uH/dH/fH/…）。
 *
 * 设计要点（这是 Codex 与"每个功能开一个 ipcMain.handle"的关键分野）：
 * 业务消息只走 `message-from-view` / `message-for-view` 两条泛化通道，
 * 类型靠信封里的 `type` 判别，新增功能不需要动 preload。
 * 只有三类东西才配专用通道：
 *   1. 必须同步返回的首屏快照（sendSync）；
 *   2. 需要转移 MessagePort 的（postMessage 才能带 port）；
 *   3. 需要 invoke 语义拿返回值的原生弹窗（右键菜单）。
 */
export const HOST_CHANNEL = {
  /** 渲染 → 主：所有业务消息（invoke，返回 void） */
  messageFromView: 'codex_desktop:message-from-view',
  /** 主 → 渲染：所有业务消息（preload 再派发为 window 的 message 事件） */
  messageForView: 'codex_desktop:message-for-view',
  /** 分块消息的背压 ACK（send，无返回） */
  chunkedMessageAck: 'codex_desktop:chunked-message-ack',

  /** 原生右键菜单（invoke → `{ id: string | null }`） */
  showContextMenu: 'codex_desktop:show-context-menu',
  /** 反向拖拽：把工作区文件拖到 Finder/Explorer（sendSync → boolean） */
  startFileDrag: 'codex_desktop:start-file-drag',

  /** 首屏同步快照（sendSync） */
  getSharedObjectSnapshot: 'codex_desktop:get-shared-object-snapshot',
  getInitialSidebarBootstrap: 'codex_desktop:get-initial-sidebar-bootstrap',
  getSystemThemeVariant: 'codex_desktop:get-system-theme-variant',
  /** 系统外观变化推送 */
  systemThemeVariantUpdated: 'codex_desktop:system-theme-variant-updated',

  /** 服务树握手：渲染层转移 MessagePort，之后主/渲染点对点 RPC */
  connectAppHost: 'codex_desktop:connect-app-host',

  /** 内置浏览器：页面 preload → 主进程的页面事件（send） */
  browserPageEvent: 'codex_desktop:browser-page-event',
  /** 内置浏览器：页面内 runtime（标注层等）→ 主进程（invoke） */
  browserSidebarRuntimeMessage: 'codex_desktop:browser-sidebar-runtime-message',
  /** 页面 preload 同步询问 WebMCP 是否开启（ipc-message-sync） */
  getBrowserWebmcpEnabled: 'codex_desktop:get-browser-webmcp-enabled'
} as const

/** worker 独立频道：按 worker id 分频道，不与主消息总线抢序 */
export function workerChannelFromView(workerId: string): string {
  return `codex_desktop:worker:${workerId}:from-view`
}

export function workerChannelForView(workerId: string): string {
  return `codex_desktop:worker:${workerId}:for-view`
}

/** Codex 的 windowType 常量：渲染层据此判断宿主是 Electron 还是 web */
export const WINDOW_TYPE_ELECTRON = 'electron'

const PLATFORM_LABEL: Record<string, string> = {
  darwin: 'Mac OS',
  linux: 'X11; Linux',
  win32: 'Windows NT 10.0'
}

/** Codex `Codex Desktop/{ver} (Mac OS; arm64)` —— 内置浏览器与上传都用它 */
export function desktopUserAgent(options: {
  appVersion: string
  platform?: string
  arch?: string
}): string {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  return `WorkStudio Desktop/${options.appVersion} (${PLATFORM_LABEL[platform] ?? platform}; ${arch})`
}
