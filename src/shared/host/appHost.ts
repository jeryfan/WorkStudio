import type { SystemThemeVariant, BrowserTabState, BrowsingDataKind } from './messages'
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
 * 命名严格沿用 Codex 的服务名。Codex 有而本项目没有对应实现的服务（terminal /
 * realtimeVoice / avatarOverlay / chronicle / codexMicro / remoteControl* …）
 * 这里不声明 —— 声明了却不实现只会让调用方以为能用。
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
export interface AppHostServices {
  appInfo: AppInfoService
  applicationMenu: ApplicationMenuService
  clipboard: ClipboardService
  openIn: OpenInService
  workspaceFiles: WorkspaceFilesService
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

export interface AppViewServices {
  clientCoordination: ClientCoordinationService
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
