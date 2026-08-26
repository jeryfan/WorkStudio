import type { SystemThemeVariant, BrowserTabState, BrowsingDataKind } from './messages'
import type { SettingsSnapshot } from '../settings/definitions'
import type { WorkspaceSnapshot, CreateProjectInput, ProjectSelection } from '../workspace/types'

/**
 * 宿主服务树的类型契约。
 *
 * 取证：Codex 主进程 `createAppHost(webContents)` 返回 `new AppHost({ …70 个服务 })`，
 * 经 capnweb 走 MessagePort 暴露给渲染层；渲染层 `Bm = await hostStub.services`
 * 之后直接 `Bm.workspaceFiles.saveCopy(...)` 调用（promise pipelining）。
 *
 * 为什么不是"每个能力开一个 ipcRenderer.invoke 通道"：
 *   1. 服务是**对象**而不是一堆扁平方法名，边界与生命周期跟着窗口走；
 *   2. 新增服务不需要动 preload、不需要新通道名、不需要在两端各写一遍字符串；
 *   3. capnweb 的 promise pipelining 让 `a.b().c()` 只走一次往返。
 *
 * 命名严格沿用 Codex 的服务名。Codex 有而本项目没有对应实现的服务（realtimeVoice /
 * avatarOverlay / chronicle / codexMicro / remoteControl* …）这里不声明 ——
 * 声明了却不实现只会让调用方以为能用。
 */

// ── appInfo（Codex `fae`，只有一个 get） ───────────────────────────────
export interface AppInfoSnapshot {
  appVersion: string
  platform: string
  arch: string
  isPackaged: boolean
  /** 内置浏览器与上传统一使用的 UA */
  userAgent: string
  /** 渲染层把绝对路径缩写为 ~/… 时要用 */
  homeDir: string
}

export interface AppInfoService {
  get(): AppInfoSnapshot
}

// ── applicationMenu（Codex `Qoe`：getSnapshot / invokeItem） ────────────
export interface ApplicationMenuItemSnapshot {
  id: string
  label: string
  enabled: boolean
  visible: boolean
  /** 已解析的 accelerator 展示串（⌘T），Windows 自绘菜单栏直接显示 */
  accelerator?: string
  type?: 'normal' | 'separator' | 'submenu' | 'checkbox'
  checked?: boolean
  submenu?: ApplicationMenuItemSnapshot[]
}

export interface ApplicationMenuService {
  /** Windows/Linux 的自绘菜单栏用它渲染，保证与原生菜单同一份定义 */
  getSnapshot(): ApplicationMenuItemSnapshot[]
  /** 自绘菜单栏点击后回调原生菜单项的 click */
  invokeItem(id: string): void
}

// ── clipboard（Codex `Dce`：只有 writeText） ────────────────────────────
export interface ClipboardService {
  writeText(text: string): void
}

// ── openIn（Codex `ohe`） ──────────────────────────────────────────────
export interface OpenInTarget {
  /** 稳定 id（Codex target 名，如 'vscode'） */
  target: string
  label: string
  appPath: string
  kind: 'editor' | 'terminal'
}

export interface OpenInRequest {
  path: string
  target: string
  appPath?: string
  line?: number
  column?: number
}

export interface OpenInService {
  getTargets(): Promise<OpenInTarget[]>
  detectTarget(target: string): Promise<OpenInTarget | null>
  /** 图标由主进程读出并转成 data URL —— 渲染层不需要打包一份编辑器图标 */
  loadTargetIcon(target: string): Promise<string | null>
  open(request: OpenInRequest): Promise<void>
  setGlobalPreferredTarget(target: string | null): Promise<void>
}

// ── workspaceFiles（Codex `nfe`） ─────────────────────────────────────
export interface WorkspaceFileMetadata {
  path: string
  size: number
  isDirectory: boolean
  isFile: boolean
}

export interface WorkspaceFilesService {
  read(path: string): Promise<string>
  write(path: string, contents: string): Promise<void>
  /** 系统保存对话框 + 复制（Codex 的「另存为」） */
  saveCopy(path: string, suggestedName?: string): Promise<boolean>
  /** 直接落到下载目录，不弹对话框 */
  downloadCopy(path: string, suggestedName?: string): Promise<string | null>
  createTemporaryFile(name: string, contents: string): Promise<string>
  releaseTemporaryFile(path: string): Promise<void>
  getDownloadsFolderIcon(): Promise<string | null>
}

// ── localProjects ─────────────────────────────────────────────────────
/**
 * 项目注册表。协议里没有 project 概念（agent 只认 cwd），Codex 把它放在
 * 宿主侧的 `localProjects` 服务里，本项目同构。
 *
 * 偏差记录：Codex 的方法是 create/edit/remove/rename/upsert；本项目的侧栏
 * 还有排序与置顶（Codex 那部分状态走 `threadProjectAssignments` 与 scopedState），
 * 因此多出 reorder/select/setPinned 三组。已有方法保持 Codex 原名。
 */
export interface LocalProjectsService {
  getSnapshot(): WorkspaceSnapshot
  create(input: CreateProjectInput): WorkspaceSnapshot
  rename(projectId: string, name: string): WorkspaceSnapshot
  remove(projectId: string): WorkspaceSnapshot
  reorder(projectIds: string[]): WorkspaceSnapshot
  select(selection: ProjectSelection): WorkspaceSnapshot
  setPinned(projectId: string, pinned: boolean): WorkspaceSnapshot
  reorderPinnedItems(itemKeys: string[]): WorkspaceSnapshot
  reorderThreads(projectId: string, chatIds: string[]): WorkspaceSnapshot
  /** 系统目录选择框；用户取消时返回空数组 */
  pickDirectories(): Promise<string[]>
}

// ── threadProjectAssignments（Codex `aF`） ─────────────────────────────
export interface ThreadDecorations {
  pinnedChatIds: string[]
  chatAssignments: WorkspaceSnapshot['chatAssignments']
}

export interface ThreadProjectAssignmentsService {
  getDecorations(): ThreadDecorations
  setAssignment(chatId: string, projectId: string | null, cwd: string): WorkspaceSnapshot
  setPinned(chatId: string, pinned: boolean): WorkspaceSnapshot
  /** 会话删除后清掉本地附带状态，避免注册表随使用无限增长 */
  forget(chatId: string): WorkspaceSnapshot
}

// ── browserSidebar（Codex `Xse` 的本项目子集） ─────────────────────────
export interface BrowserSidebarService {
  /**
   * 渲染层挂 `<webview>` 前先登记路由，宿主据此在 will-attach-webview 里
   * 按 instanceId 认领并强制 partition/preload/安全项。
   */
  registerWebviewHost(params: {
    conversationId: string
    browserTabId: string
    instanceId: number
    url: string | null
  }): Promise<void>
  getState(conversationId: string): Promise<BrowserTabState[]>
  setAudioMuted(params: {
    conversationId: string
    browserTabId: string
    muted: boolean
  }): Promise<void>
  /** 截图进剪贴板（Codex `captureScreenshotToClipboard`） */
  captureScreenshotToClipboard(params: {
    conversationId: string
    browserTabId: string
  }): Promise<boolean>
  /** 截图另存（弹保存对话框） */
  captureScreenshotToFile(params: {
    conversationId: string
    browserTabId: string
  }): Promise<boolean>
  openSiteInfo(params: { conversationId: string; browserTabId: string }): Promise<void>
  clearBrowsingData(kinds: BrowsingDataKind[]): Promise<void>
  /** 关闭会话时回收该会话的所有页与 browser_use 路由 */
  deleteConversation(conversationId: string): Promise<void>
}

// ── chromiumBrowser（Codex `wce`） ────────────────────────────────────
export interface ChromiumBrowserService {
  /** 已安装的外部浏览器族（chrome/edge/…），渲染层据此决定「在外部浏览器打开」的图标 */
  getInstalledBrowserFamilies(): Promise<string[]>
  /** 在系统默认（或指定）浏览器里打开；仅 http/https */
  openUrl(url: string, family?: string): Promise<void>
}

// ── windowNavigation（Codex `Fxe`） ───────────────────────────────────
export interface WindowNavigationService {
  /** macOS 触控板双指左右滑动的前进/后退开关 */
  setHistorySwipeNavigationState(state: { canGoBack: boolean; canGoForward: boolean }): void
}

// ── systemPermissions（Codex `lbe`；非 macOS 时整个服务为 null） ────────
export interface SystemPermissionsService {
  getNotificationPermissionStatus(): Promise<'granted' | 'denied' | 'not-determined'>
  requestMicrophoneAccess(): Promise<boolean>
  openNotificationSettings(): Promise<void>
  openScreenRecordingSettings(): Promise<void>
  openAccessibilitySettings(): Promise<void>
  showPermissionSettingsAppInFinder(): Promise<void>
}

// ── notifications（Codex `Xye`：show / hide） ──────────────────────────
export interface NotificationsService {
  show(params: { id: string; title: string; body?: string; silent?: boolean }): void
  hide(id: string): void
}

// ── fileDrags（Codex `sfe`：prepareDrag） ──────────────────────────────
export interface FileDragsService {
  /** 反向拖拽前先备好拖拽图标与路径，随后由 sendSync 的 start-file-drag 真正发起 */
  prepareDrag(paths: string[]): Promise<void>
}

// ── theme：Codex 没有单独服务（走 sendSync + 推送），这里也保持一致 ────

/** 主进程暴露给渲染层的完整服务树 */
/**
 * 桌面端设置的读写（Codex 的 `get-settings` / `set-setting` handler）。
 *
 * 真值在主进程的 settings store 里，落盘在 app-server 的 config
 *（`[desktop]` 表）。渲染层拿到的两张表就是 Codex 的响应形状：
 * `values` 是生效值（配置值 ?? default），`configuredValues` 只有显式配过的键。
 */
export interface SettingsService {
  getSettings(): SettingsSnapshot
  setSetting(key: string, value: unknown): { success: true }
}

// ── startup（Codex `appServices.startup`） ─────────────────────────────
/**
 * 启动门禁。
 *
 * 取证：Codex 的入口 `app-main-*.js` 在 `await initializeAppHostServices()` 之后
 * 取 `appServices.startup.whenReady()`，把它作为 promise 交给 `<App startupReady>`，
 * App 第一行就是 `use(startupReady)` —— 也就是说**宿主没就绪之前 React 一直挂起**，
 * 屏幕上停在 `<Suspense fallback={<LoadingIndicator debugName="Startup"/>}>`，
 * 视觉上与 HTML 闪屏是同一个 56px 流光标记，用户看不出接管的那一帧。
 *
 * 宿主侧的实现（主进程 chunk 的 `Fwe`）额外有一个阶段机（`reach(phase)`：
 * host_ready → window_created → renderer_ready → first_content_visible →
 * background_ready），用来把后台服务推迟到首帧之后。**本项目不声明 `reach`**：
 * 我们目前没有需要按阶段延后启动的后台服务，声明一个只会记日志的方法就是死代码。
 *
 * 本项目的"宿主就绪"取的是 **agent 连接不再是 starting**（ready 或 failed）。
 * 这不是随便挑的边界：`getAuthStatus` 要经 app-server 才能答，而登录门禁又必须
 * 等它回答才能决定进应用还是进登录页。在这之前渲染任何一边都是猜。
 */
export interface StartupService {
  /**
   * agent 连接离开 `starting` 时 resolve —— **失败也 resolve**。
   * 失败要让界面能画出失败（连接状态经 `codex-app-server-connection-state`
   * 已经在渲染层了），一直挂起只会得到一个永远转圈的空壳。
   */
  whenReady(): Promise<void>
}

export interface AppHostServices {
  startup: StartupService
  appInfo: AppInfoService
  appUpdates: AppUpdatesService
  terminal: TerminalService
  applicationMenu: ApplicationMenuService
  clipboard: ClipboardService
  openIn: OpenInService
  workspaceFiles: WorkspaceFilesService
  settings: SettingsService
  localProjects: LocalProjectsService
  threadProjectAssignments: ThreadProjectAssignmentsService
  browserSidebar: BrowserSidebarService
  chromiumBrowser: ChromiumBrowserService
  windowNavigation: WindowNavigationService
  notifications: NotificationsService
  fileDrags: FileDragsService
  /** 仅 macOS/Windows 提供 */
  systemPermissions?: SystemPermissionsService
}

// ── appUpdates（Codex `Tce`） ─────────────────────────────────────────
/**
 * 更新状态。字段名与 Codex `getAppUpdateViewState()` 逐字一致 ——
 * 渲染层的 app header 就是按这几个字段画的。
 */
export interface AppUpdateViewState {
  /** 0–100；不在下载中为 null */
  downloadProgressPercent: number | null
  /** 已下载的那个包属于哪个 brand（Codex 同一个 Sparkle 服务多 brand 共用） */
  downloadedUpdateAppBrand: string | null
  installProgressPercent: number | null
  /** 装完了、等重启 */
  isUpdateReady: boolean
  /**
   * **不确定**：Codex 这里是 Sparkle 的生命周期枚举，具体取值在
   * `sparkleManager`（原生 `sparkle.node`）里，压缩代码里挖不到完整表。
   * 下面这组是本项目按 electron-updater 的事件推导出来的，语义对齐但不保证
   * 与 Sparkle 的字符串逐字相同。
   */
  lifecycleState: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'
  /** 需要重启才能生效时给用户的一句话；没有就是 null */
  relaunchNotice: string | null
}

export interface AppUpdatesService {
  checkForUpdates(): void
  /**
   * 安装并重启。
   * Codex 在 macOS 且有活动本地会话时先弹确认（"will quit to install the update,
   * which will interrupt active local sessions"）—— 装更新会杀掉正在跑的任务。
   */
  installUpdate(): Promise<void>
  /**
   * Codex 用它给 Sparkle 的 feed URL 追加查询参数（灰度分桶、channel）。
   * electron-updater 没有 feed 查询参数这一层，本项目把它记下来但**不使用** ——
   * 见主进程实现里的说明。
   */
  setSparkleQueryParams(params: Record<string, string>): void
}

// ── terminal（Codex `tTe`） ────────────────────────────────────────────
/**
 * 终端会话的事件流。
 *
 * 取证：Codex 的 `TerminalManager` 只往订阅者推这五种。形状逐字照搬 ——
 * 渲染层的 `attached` 是"可以开始渲染了"的信号，`init-log` 是宿主自己的诊断
 * （shell 起不来、cwd 不存在这类），两者混成一种的话前端分不清该显示 banner
 * 还是该往缓冲区里写。
 */
export type TerminalEvent =
  | { type: 'data'; sessionId: string; data: string }
  | { type: 'exit'; sessionId: string; code: number | null; signal: string | null }
  | { type: 'init-log'; sessionId: string; log: string }
  | { type: 'attached'; sessionId: string; cwd: string; shell: string }
  | { type: 'error'; sessionId: string; message: string }

/**
 * Windows 上可选的集成终端。
 * 非 Windows 恒为空数组（Codex `$we` 第一行就 return []）—— macOS/Linux 只用
 * `$SHELL`，没有"挑一个 shell"的概念。
 */
export type TerminalShellPreference = 'powershell' | 'commandPrompt' | 'gitBash' | 'wsl'

export interface TerminalCreateParams {
  /** 不给就由宿主生成 UUID */
  sessionId?: string
  /** 会话（thread）id：同一窗口同一会话复用同一个终端会话 */
  conversationId?: string
  /** 注入成 `CODEX_APP_TITLE`，shell 提示符/标题可以用它 */
  conversationTitle?: string
  cwd?: string
  cols?: number
  rows?: number
  /** 窗口销毁时保留会话（下次 attach 回来） */
  preserveOnOwnerDestroy?: boolean
}

export interface TerminalSnapshot {
  cwd: string
  shell: string
  /** 回放缓冲（尾部 16000 字符，与 Codex 同值） */
  buffer: string
  /** 缓冲已达上限，前面的输出已经丢了 */
  truncated: boolean
}

export interface TerminalService {
  create(params: TerminalCreateParams): Promise<string | null>
  attach(params: TerminalCreateParams): Promise<string | null>
  write(sessionId: string, data: string): void
  resize(sessionId: string, cols: number, rows: number, repaint?: boolean): void
  close(sessionId: string): void
  /** 在已有会话里跑一条命令（Codex 的实现是重启会话并把命令喂进去） */
  runAction(sessionId: string, cwd: string | null, command: string): void
  getAvailableShells(): TerminalShellPreference[]
  getShellCwd(sessionId: string, cwd: string): string | null
  getThreadSnapshot(conversationId: string): TerminalSnapshot | null
  subscribe(listener: (event: TerminalEvent) => void): void
  unsubscribe(): void
}

/** capnweb 的对端主对象：渲染层 `await stub.services` 拿到上面那棵树 */
export interface AppHostMain {
  readonly services: AppHostServices
}

// ── 反向：渲染层暴露给主进程的服务（Codex `AppView`） ────────────────
export interface ClientCoordinationService {
  /**
   * 让渲染层的查询缓存失效。
   *
   * Codex 的 `clientCoordination.invalidateQueryCache({sourceClientId, params})`
   * ——宿主侧改了状态（项目重命名、下载完成…）不需要各自定义一条推送消息，
   * 统一让渲染层重新拉对应的 query。
   */
  invalidateQueryCache(params: { queryKey: readonly string[] }): void
}

/**
 * 反向推送更新状态（Codex `broadcastAppUpdateState` → `appUpdates.stateChanged`）。
 *
 * 为什么是反向服务而不是宿主消息：更新状态是**快照**语义，新窗口注册时必须
 * 立刻拿到当前值。走消息就得再定义一条"请给我当前状态"的请求，两条消息表达
 * 一件事；反向服务只要在 registerAppView 里调一次。
 */
export interface AppUpdatesViewService {
  stateChanged(state: AppUpdateViewState): void
}

export interface AppViewServices {
  clientCoordination: ClientCoordinationService
  appUpdates: AppUpdatesViewService
}

export interface AppViewMain {
  readonly services: AppViewServices
}

export type { SystemThemeVariant }

/**
 * capnweb stub 上的调用一律是异步的（即使实现是同步方法）。
 *
 * 渲染层拿到的不是服务对象本身而是它的 stub，所以类型也要跟着变成
 * "所有方法返回 Promise"。不做这层映射的话，`const x = services.appInfo.get()`
 * 会被类型系统当成同步值，运行期拿到的却是 Promise —— 这种错编译期发现不了。
 */
export type RemoteService<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : T[K]
}

export type RemoteAppHostServices = {
  [K in keyof AppHostServices]-?: undefined extends AppHostServices[K]
    ? RemoteService<NonNullable<AppHostServices[K]>> | undefined
    : RemoteService<NonNullable<AppHostServices[K]>>
}
