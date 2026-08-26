import type { RpcId, RpcRequest, RpcResponse } from '../rpc/messages'

/**
 * 宿主消息词表。
 *
 * 取证：Codex 主进程 chunk 里 `s.type === '…'` 的判别与 `type: '…'` 的发送点
 *（实测 300+ 个 type）。这里收录本项目实际路由的子集，type 字符串与 Codex
 * 逐字一致 —— 后续补功能时在这里加一条，preload 与通道定义都不用动。
 *
 * 方向命名沿用 Codex：
 *   ViewMessage —— 渲染层 → 宿主（`message-from-view`）
 *   HostMessage —— 宿主 → 渲染层（`message-for-view`，preload 再派发为 window message）
 */

/** app-server 连接的宿主 id。Codex 支持本地 + ssh/wsl/remote-control 多连接 */
export type HostId = string
export const LOCAL_HOST_ID: HostId = 'local'

/** Codex 的系统外观取值（渲染层据此在 <html> 上切 electron-light/electron-dark） */
export type SystemThemeVariant = 'light' | 'dark'

/** 菜单 accelerator 命中时合成的键盘事件，渲染层的命令处理器据此判重复 */
export interface SyntheticKeyboardEvent {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  repeat: boolean
}

/** 浏览器面板里对"当前可见页"执行的命令（Codex `runFocusedVisiblePageCommand`） */
export type BrowserPageCommand =
  | { type: 'navigate'; url: string }
  | { type: 'go-back' }
  | { type: 'go-forward' }
  | { type: 'reload'; ignoreCache?: boolean }
  | { type: 'stop' }
  | { type: 'set-zoom-percent'; zoomPercent: number }
  | { type: 'step-zoom'; delta: number }
  | { type: 'reset-zoom' }
  | { type: 'open-find' }
  | { type: 'set-find-query'; query: string }
  | { type: 'find-next' }
  | { type: 'find-previous' }
  | { type: 'close-find' }
  | { type: 'capture-screenshot' }
  | { type: 'open-in-browser' }
  | { type: 'print' }
  | { type: 'close-tab' }

/** 浏览器页面 preload 上报的页面事件（Codex `browser-page-event`） */
export type BrowserPageEvent =
  | { type: 'mounted'; url: string; title: string }
  | { type: 'navigate'; url: string; title: string }
  | { type: 'scroll'; scrollX: number; scrollY: number }
  | { type: 'viewport'; width: number; height: number; devicePixelRatio: number }
  | { type: 'click'; x: number; y: number }
  | { type: 'log-message'; level: string; message: string }

export type ViewMessage =
  /** 渲染层首帧就绪（Codex 用它决定何时冲刷排队的事件） */
  | { type: 'ready' }
  /** 渲染层日志汇入主进程日志文件 */
  | {
      type: 'log-message'
      level: 'trace' | 'debug' | 'info' | 'warning' | 'error'
      message: string
    }

  // ── shared object（跨窗口共享的小状态；首屏 sendSync 拿快照，之后订阅） ──
  | { type: 'shared-object-set'; key: string; value: unknown }
  | { type: 'shared-object-subscribe'; key: string }
  | { type: 'shared-object-unsubscribe'; key: string }

  // ── 窗口 ──
  | { type: 'electron-window-focus-request' }
  /**
   * 主窗口模式（Codex `electron-set-window-mode`）。
   *
   * 取证：登录/onboarding 目标确定之后，渲染层的路由门禁在 effect 里发这条消息，
   * 宿主的 `setPrimaryWindowMode` 据此把主窗口改成 onboarding 尺寸（v2 是
   * **1090×760**，v1 是 560×560），并记下原 bounds；回到 `app` 时恢复。
   * 也就是说"未登录不进应用"在 Codex 里不只是换一个页面，**窗口本身会变小**。
   */
  | {
      type: 'electron-set-window-mode'
      mode: 'app' | 'onboarding'
      onboardingVariant?: 'v2'
    }
  | { type: 'electron-set-badge-count'; count: number }
  | { type: 'open-current-main-window'; stealFocus?: boolean; focusComposer?: boolean }
  | { type: 'open-in-new-window'; path: string }
  | { type: 'show-settings'; section: string; state?: unknown }
  | { type: 'quit-app' }
  /**
   * tray / dock 菜单的会话清单（Codex `tray-menu-threads-changed`）。
   *
   * 为什么由渲染层推而不是主进程自己查：这五组的口径全在渲染层 —— 未读是
   * 渲染层的已读游标算的，pinned 来自侧栏的置顶顺序，recent 是侧栏的排序结果，
   * usageLimits 是配额条的文案。主进程重算一遍必然和界面显示的不一致。
   *
   * 注意 payload 嵌在 `trayMenuThreads` 里而不是拍平（实测形状）。
   */
  | { type: 'tray-menu-threads-changed'; trayMenuThreads: TrayMenuThreads }
  | { type: 'mac-menu-bar-enabled-changed'; enabled: boolean }

  // ── app-server（协议报文骑在宿主信封上，与 Codex 同构） ──
  /** 渲染层发起请求 */
  | {
      type: 'mcp-request'
      hostId: HostId
      request: RpcRequest
      priority?: AppServerRequestPriority
    }
  /** 渲染层应答服务端反向请求（审批等） */
  | { type: 'mcp-response'; hostId: HostId; message: RpcResponse }
  /** 放弃仍在排队的请求（窗口切走/组件卸载） */
  | { type: 'mcp-request-abandon'; hostId: HostId; id: RpcId }

  // ── 内置浏览器 ──
  /**
   * 呈现态同步：渲染层把"这个 tab 现在有没有被显示出来、显示在哪"告诉宿主。
   *
   * 取证：Codex `BrowserSidebarManager.sync(webContents, payload)`。宿主拿它
   * 推导两件事：
   *   `presented = payload.presented ?? (payload.visible && payload.bounds != null)`
   *   `presented` 为真时把 `activeConversationId/activeBrowserTabId` 挪到这条路由
   * 这是 `browser_visibility_get` 的唯一数据来源 —— 面板开没开只有渲染层知道，
   * 但**判断**必须在宿主，因为提问的是 native pipe 上的 agent。
   *
   * 注意这里不再带 instanceId/url：路由登记走 `browserSidebar.registerWebviewHost`
   * 服务，两条路都能登记就会出现两份互相打架的路由表。
   */
  | {
      type: 'browser-sidebar-sync'
      conversationId: string
      browserTabId: string
      /** 这个 tab 是否处在"可见"的 UI 位置（面板开着且它是当前 tab） */
      visible: boolean
      /** 锚点矩形；null 表示当前没有可见位置（停在捕获表面上） */
      bounds: { x: number; y: number; width: number; height: number } | null
    }
  | {
      type: 'browser-sidebar-command'
      conversationId: string
      browserTabId: string
      command: BrowserPageCommand
    }
  | { type: 'browser-sidebar-webview-destroyed'; conversationId: string; browserTabId: string }
  | { type: 'browser-sidebar-clear-browsing-data'; kinds: BrowsingDataKind[] }

export type HostMessage =
  // ── 命令派发（原生菜单 accelerator 命中 → 渲染层命令注册表） ──
  | { type: 'run-command'; id: string; keyboardEvent?: SyntheticKeyboardEvent }

  // ── 面板开关（Codex 为高频面板保留了专用消息，不走 run-command） ──
  | { type: 'toggle-sidebar' }
  | { type: 'toggle-bottom-panel' }
  /**
   * `open` 缺省是"翻转"，给出时是"设成这个值"。
   *
   * 取证：Codex 的 browser_use 路径发的是 `{open:true|false, browserTabId,
   * conversationId, source:'browser_use', initiator:'browser_use'}` —— agent 要的是
   * "显示/隐藏"而不是"翻转"，翻转会在面板已开时把它关掉。
   *
   * 与 Codex 的差异：不带 `conversationId`/`browserTabId`。Codex 是多窗口 + 每个
   * 窗口一份活动路由，必须指名道姓；本项目的浏览器面板是右面板里的一个 tab，
   * 关面板就是关当前的浏览器 tab，渲染层自己知道是哪个。
   */
  | {
      type: 'toggle-browser-panel'
      open?: boolean
      source?: 'manual' | 'browser_use'
      initiator?: 'app_menu' | 'command' | 'browser_use'
    }
  | { type: 'toggle-file-tree-panel' }
  | { type: 'toggle-terminal' }
  | { type: 'toggle-thread-pin' }

  // ── 导航与缩放 ──
  | { type: 'navigate-back' }
  | { type: 'navigate-forward' }
  | { type: 'navigate-to-route'; path: string; state?: unknown }
  | { type: 'step-zoom'; delta: number }
  | { type: 'reset-zoom' }
  | { type: 'step-window-zoom'; delta: number }
  | { type: 'reset-window-zoom' }

  // ── 会话与查找 ──
  | { type: 'find-in-thread' }
  | { type: 'find-next-in-thread' }
  | { type: 'find-previous-in-thread' }
  | { type: 'command-menu' }
  | { type: 'chat-search-command-menu' }
  | { type: 'file-search-command-menu' }
  | { type: 'new-projectless-task' }
  | { type: 'archive-thread' }
  | { type: 'rename-thread' }
  | { type: 'copy-deeplink' }
  | { type: 'copy-session-id' }
  | { type: 'copy-working-directory' }
  | { type: 'copy-conversation-path' }
  | { type: 'focus-composer' }
  | { type: 'close-follow-up' }

  // ── 标签页 ──
  | { type: 'open-browser-tab' }
  | { type: 'close-active-app-shell-tab' }

  // ── shared object 推送 ──
  | { type: 'shared-object-updated'; key: string; value: unknown }

  // ── app-server ──
  /** 服务端反向请求转给渲染层应答 */
  | { type: 'mcp-request'; hostId: HostId; request: RpcRequest }
  /** 渲染层请求的响应（hostMetrics 用于观测排队与往返耗时） */
  | {
      type: 'mcp-response'
      hostId: HostId
      message: RpcResponse
      requestMethod?: string
      receivedAtMs?: number
    }
  /** 服务端通知（thread/turn/item 事件流全走这条） */
  | { type: 'mcp-notification'; hostId: HostId; method: string; params?: unknown }
  | { type: 'codex-app-server-fatal-error'; hostId: HostId; errorMessage: string }
  /** 连接状态快照（进程重启/握手失败时渲染层据此显示明确状态而不是空白） */
  | {
      type: 'codex-app-server-connection-state'
      hostId: HostId
      state: 'starting' | 'ready' | 'failed'
      version?: string
      error?: string
      hint?: string
      isSnapshot?: boolean
    }

  // ── 窗口状态 ──
  | { type: 'electron-window-focus-changed'; focused: boolean }
  | { type: 'window-fullscreen-changed'; fullscreen: boolean }

  // ── 内置浏览器 ──
  | { type: 'browser-sidebar-state'; conversationId: string; tabs: BrowserTabState[] }
  | {
      type: 'browser-sidebar-page-loaded'
      conversationId: string
      browserTabId: string
      url: string
      title: string
    }
  | {
      type: 'browser-sidebar-find-state'
      conversationId: string
      browserTabId: string
      activeMatchOrdinal: number
      matches: number
    }
  | {
      type: 'browser-sidebar-tab-lifecycle'
      conversationId: string
      browserTabId: string
      phase: 'attached' | 'destroyed' | 'render-process-gone'
    }
  | { type: 'browser-sidebar-screenshot-copied'; conversationId: string; browserTabId: string }
  | { type: 'browser-sidebar-url-copied'; conversationId: string; browserTabId: string }
  /** browser_use 正在驱动这个 tab：渲染层据此显示接管态并让出输入 */
  | {
      type: 'browser-sidebar-browser-use-state'
      conversationId: string
      browserTabId: string | null
      active: boolean
    }
  /** browser_use 要求打开浏览器面板（agent 主动开页时） */
  | {
      type: 'browser-sidebar-open-panel-without-animation'
      conversationId: string
      browserTabId?: string
      source?: 'browser_use'
      initiator?: 'browser_use'
    }
  /**
   * browser_use 的视口覆盖（Codex `browser-sidebar-browser-use-viewport`）。
   *
   * 宿主已经把 `Emulation.setDeviceMetricsOverride` 下给页面了；这条是给渲染层
   * 的，让 webview 元素的物理尺寸跟着改 —— 只改 emulation 不改元素尺寸，页面
   * 会被缩放拉伸，截图与坐标都不对。
   */
  | {
      type: 'browser-sidebar-browser-use-viewport'
      conversationId: string
      browserTabId: string
      viewportSize: { width: number; height: number } | null
    }
  /**
   * 要求/释放捕获表面。
   *
   * 页面完全没有合成表面时 CDP 截图与 screencast 都拿不到帧（实测），
   * 所以宿主要截图前先让渲染层保证这个页面有表面 —— 对应 Codex 的
   * `setCaptureSurfaceForBrowserUseForRoute`。
   */
  | {
      type: 'browser-sidebar-browser-use-capture-surface'
      conversationId: string
      browserTabId: string
      required: boolean
    }

/** tray / dock 菜单里的一条会话（Codex `Gu` 读的就是这四个字段） */
export interface TrayMenuThread {
  title: string
  /** 点击后要导航到的路由（`navigate-to-route` 的 path） */
  path: string
  /** 未归属任何项目：菜单里显示成 “Chats” 而不是项目名 */
  isProjectless: boolean
  projectLabel: string
}

export interface TrayMenuThreads {
  runningThreads: TrayMenuThread[]
  unreadThreads: TrayMenuThread[]
  pinnedThreads: TrayMenuThread[]
  recentThreads: TrayMenuThread[]
  /** 只在 macOS 的 tray 菜单里显示，且是不可点的说明行 */
  usageLimits: Array<{ label: string }>
}

/** 浏览器 tab 的宿主权威状态（渲染层只读，不再自持一份） */
export interface BrowserTabState {
  browserTabId: string
  url: string
  title: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  zoomPercent: number
  /** 是否正被 browser_use 接管 */
  browserUseActive: boolean
}

export type BrowsingDataKind = 'cookies' | 'cache' | 'siteData'

/**
 * app-server 请求的优先级。
 *
 * 取证：Codex 渲染层按方法名分档并限制并发（critical 16 / interactive 64 /
 * background 128）。`thread/start`、`turn/start` 这类必须马上走，
 * `model/list`、`skills/list` 这类可以排队。
 */
export type AppServerRequestPriority = 'critical' | 'interactive' | 'background'

/** Codex `Jen`：critical 方法名（实测清单） */
export const CRITICAL_REQUEST_METHODS: ReadonlySet<string> = new Set([
  'thread/approveGuardianDeniedAction',
  'thread/resume',
  'thread/start',
  'turn/interrupt',
  'turn/start',
  'turn/steer'
])

/** Codex `Yen`：background 方法名（实测清单） */
export const BACKGROUND_REQUEST_METHODS: ReadonlySet<string> = new Set([
  'app/installed',
  'app/list',
  'app/read',
  'collaborationMode/list',
  'config/read',
  'configRequirements/read',
  'experimentalFeature/list',
  'hooks/list',
  'mcpServerStatus/list',
  'model/list',
  'permissionProfile/list',
  'plugin/list',
  'skills/list'
])

/** Codex `Ken`：各档并发上限 */
export const REQUEST_CONCURRENCY: Record<AppServerRequestPriority, number> = {
  critical: 16,
  interactive: 64,
  background: 128
}

/** Codex `Ren`：方法名 → 优先级 */
export function requestPriorityFor(
  method: string,
  explicit?: AppServerRequestPriority
): AppServerRequestPriority {
  if (explicit != null) return explicit
  if (CRITICAL_REQUEST_METHODS.has(method)) return 'critical'
  if (BACKGROUND_REQUEST_METHODS.has(method)) return 'background'
  return 'interactive'
}

export type ViewMessageType = ViewMessage['type']
export type HostMessageType = HostMessage['type']

/** 按 type 取出联合成员，订阅端用它拿到精确的 payload 类型 */
export type HostMessageOf<T extends HostMessageType> = Extract<HostMessage, { type: T }>
export type ViewMessageOf<T extends ViewMessageType> = Extract<ViewMessage, { type: T }>
