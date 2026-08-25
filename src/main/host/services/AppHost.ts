import {
  app,
  clipboard,
  Notification,
  nativeImage,
  shell,
  systemPreferences,
  type WebContents
} from 'electron'
import { RpcTarget } from 'capnweb'
import { homedir } from 'node:os'
import { basename } from 'node:path'
import { desktopUserAgent } from '@shared/host/channels'
import type {
  AppHostMain,
  AppHostServices,
  AppInfoSnapshot,
  ApplicationMenuItemSnapshot,
  BrowserSidebarService as BrowserSidebarContract,
  ChromiumBrowserService as ChromiumBrowserContract,
  LocalProjectsService as LocalProjectsContract,
  NotificationsService as NotificationsContract,
  SystemPermissionsService as SystemPermissionsContract,
  ThreadDecorations,
  ThreadProjectAssignmentsService as ThreadAssignmentsContract,
  WindowNavigationService as WindowNavigationContract
} from '@shared/host/appHost'
import type { BrowsingDataKind, BrowserTabState } from '@shared/host/messages'
import type {
  CreateProjectInput,
  ProjectSelection,
  WorkspaceSnapshot
} from '@shared/workspace/types'
import type { ProjectRegistry } from '../../workspace/ProjectRegistry'
import type { WindowManager } from '../WindowManager'
import type { ApplicationMenuManager } from '../../menu/ApplicationMenuManager'
import type { BrowserSidebarManager } from '../../browser/BrowserSidebarManager'
import { OpenInService } from './OpenInService'
import { WorkspaceFilesService } from './WorkspaceFilesService'

/**
 * 服务树的装配点。
 *
 * 取证：Codex 的 `createAppHost(webContents)` 为**每个渲染目标**新建一棵服务树
 *（很多服务的构造参数里就带着 `webContents`），再经 capnweb 暴露。
 * 本项目同构：`AppHost` 每次 connect 都新建，与该窗口同生共死。
 *
 * 服务实现都 `extends RpcTarget` —— capnweb 只按引用传递 RpcTarget 的子类，
 * 普通对象会被按值序列化（方法丢失）。
 */

class AppInfoService extends RpcTarget {
  get(): AppInfoSnapshot {
    return {
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      isPackaged: app.isPackaged,
      userAgent: desktopUserAgent({ appVersion: app.getVersion() }),
      homeDir: homedir()
    }
  }
}

class ClipboardService extends RpcTarget {
  writeText(text: string): void {
    clipboard.writeText(text)
  }
}

class ApplicationMenuService extends RpcTarget {
  constructor(private readonly menuManager: ApplicationMenuManager) {
    super()
  }

  getSnapshot(): ApplicationMenuItemSnapshot[] {
    return this.menuManager.getSnapshot()
  }

  invokeItem(id: string): void {
    this.menuManager.invokeItem(id)
  }
}

class LocalProjectsService extends RpcTarget implements LocalProjectsContract {
  constructor(
    private readonly registry: ProjectRegistry,
    private readonly pickDirectoriesImpl: () => Promise<string[]>
  ) {
    super()
  }

  getSnapshot(): WorkspaceSnapshot {
    return this.registry.snapshot()
  }

  create(input: CreateProjectInput): WorkspaceSnapshot {
    if (!Array.isArray(input?.rootPaths) || input.rootPaths.length === 0) {
      throw new Error('A project needs at least one directory')
    }
    this.registry.create(input)
    return this.registry.snapshot()
  }

  rename(projectId: string, name: string): WorkspaceSnapshot {
    this.registry.rename(projectId, name)
    return this.registry.snapshot()
  }

  remove(projectId: string): WorkspaceSnapshot {
    this.registry.remove(projectId)
    return this.registry.snapshot()
  }

  reorder(projectIds: string[]): WorkspaceSnapshot {
    this.registry.reorder(projectIds ?? [])
    return this.registry.snapshot()
  }

  select(selection: ProjectSelection): WorkspaceSnapshot {
    this.registry.select(selection)
    return this.registry.snapshot()
  }

  setPinned(projectId: string, pinned: boolean): WorkspaceSnapshot {
    if (typeof projectId !== 'string') throw new Error('projectId is required')
    this.registry.setProjectPinned(projectId, pinned === true)
    return this.registry.snapshot()
  }

  reorderPinnedItems(itemKeys: string[]): WorkspaceSnapshot {
    this.registry.reorderPinnedItems(itemKeys ?? [])
    return this.registry.snapshot()
  }

  reorderThreads(projectId: string, chatIds: string[]): WorkspaceSnapshot {
    if (typeof projectId !== 'string') throw new Error('projectId is required')
    this.registry.reorderProjectThreads(projectId, chatIds ?? [])
    return this.registry.snapshot()
  }

  pickDirectories(): Promise<string[]> {
    return this.pickDirectoriesImpl()
  }
}

class ThreadProjectAssignmentsService extends RpcTarget implements ThreadAssignmentsContract {
  constructor(private readonly registry: ProjectRegistry) {
    super()
  }

  getDecorations(): ThreadDecorations {
    return {
      pinnedChatIds: this.registry.getPinnedChatIds(),
      chatAssignments: this.registry.snapshot().chatAssignments
    }
  }

  setAssignment(chatId: string, projectId: string | null, cwd: string): WorkspaceSnapshot {
    if (typeof chatId !== 'string') throw new Error('chatId is required')
    this.registry.assignChat(chatId, projectId ?? null, cwd ?? '')
    return this.registry.snapshot()
  }

  setPinned(chatId: string, pinned: boolean): WorkspaceSnapshot {
    if (typeof chatId !== 'string') throw new Error('chatId is required')
    this.registry.setChatPinned(chatId, pinned === true)
    return this.registry.snapshot()
  }

  forget(chatId: string): WorkspaceSnapshot {
    if (typeof chatId === 'string') this.registry.forgetChat(chatId)
    return this.registry.snapshot()
  }
}

class BrowserSidebarService extends RpcTarget implements BrowserSidebarContract {
  constructor(private readonly manager: BrowserSidebarManager) {
    super()
  }

  async registerWebviewHost(params: {
    conversationId: string
    browserTabId: string
    instanceId: number
    url: string | null
  }): Promise<void> {
    this.manager.registerWebviewHost(params)
  }

  async getState(conversationId: string): Promise<BrowserTabState[]> {
    return this.manager.getState(conversationId)
  }

  async setAudioMuted(params: {
    conversationId: string
    browserTabId: string
    muted: boolean
  }): Promise<void> {
    this.manager.setAudioMuted(params.conversationId, params.browserTabId, params.muted)
  }

  captureScreenshotToClipboard(params: {
    conversationId: string
    browserTabId: string
  }): Promise<boolean> {
    return this.manager.captureScreenshotToClipboard(params)
  }

  captureScreenshotToFile(params: {
    conversationId: string
    browserTabId: string
  }): Promise<boolean> {
    return this.manager.captureScreenshotToFile(params)
  }

  openSiteInfo(params: { conversationId: string; browserTabId: string }): Promise<void> {
    return this.manager.openSiteInfo(params.conversationId, params.browserTabId)
  }

  clearBrowsingData(kinds: BrowsingDataKind[]): Promise<void> {
    return this.manager.clearBrowsingData(kinds)
  }

  async deleteConversation(conversationId: string): Promise<void> {
    this.manager.deleteConversation(conversationId)
  }
}

class ChromiumBrowserService extends RpcTarget implements ChromiumBrowserContract {
  async getInstalledBrowserFamilies(): Promise<string[]> {
    // 只报告能确认存在的；未安装的浏览器不该出现在「在外部浏览器打开」里
    const families: string[] = []
    const { existsSync } = await import('node:fs')
    const candidates: Array<[string, string]> = [
      ['chrome', '/Applications/Google Chrome.app'],
      ['edge', '/Applications/Microsoft Edge.app'],
      ['safari', '/Applications/Safari.app'],
      ['arc', '/Applications/Arc.app'],
      ['firefox', '/Applications/Firefox.app']
    ]
    for (const [family, path] of candidates) {
      if (existsSync(path)) families.push(family)
    }
    return families
  }

  async openUrl(url: string): Promise<void> {
    // 只放 http/https：file:// 与自定义协议交给宿主打开等于给页面开了任意启动
    if (!/^https?:\/\//i.test(url)) return
    await shell.openExternal(url)
  }
}

class WindowNavigationService extends RpcTarget implements WindowNavigationContract {
  setHistorySwipeNavigationState(state: { canGoBack: boolean; canGoForward: boolean }): void {
    // macOS 的双指滑动前进/后退由 BrowserWindow 的 swipe 事件驱动，
    // 这里只记录可用性，真正的手势监听在 WindowManager 里挂。
    this.state = state
  }

  private state: { canGoBack: boolean; canGoForward: boolean } = {
    canGoBack: false,
    canGoForward: false
  }

  getState(): { canGoBack: boolean; canGoForward: boolean } {
    return this.state
  }
}

class NotificationsService extends RpcTarget implements NotificationsContract {
  private readonly shown = new Map<string, Notification>()

  show(params: { id: string; title: string; body?: string; silent?: boolean }): void {
    if (!Notification.isSupported()) return
    this.hide(params.id)
    const notification = new Notification({
      title: params.title,
      body: params.body ?? '',
      silent: params.silent === true
    })
    notification.on('close', () => this.shown.delete(params.id))
    this.shown.set(params.id, notification)
    notification.show()
  }

  hide(id: string): void {
    const existing = this.shown.get(id)
    if (existing == null) return
    this.shown.delete(id)
    existing.close()
  }
}

class FileDragsService extends RpcTarget {
  private pending: string[] = []

  constructor(private readonly webContents: WebContents) {
    super()
  }

  async prepareDrag(paths: string[]): Promise<void> {
    this.pending = paths.filter((path) => typeof path === 'string')
  }

  /**
   * 真正发起拖拽。
   *
   * 必须在同步 IPC 里调用：`startDrag` 只有在渲染层 dragstart 的同一个任务里
   * 才被系统接受，异步一拍就会被丢弃 —— 这也是 Codex 把它做成 sendSync 的原因。
   */
  startDrag(paths?: string[]): boolean {
    const files = paths != null && paths.length > 0 ? paths : this.pending
    if (files.length === 0) return false
    const icon = nativeImage.createEmpty()
    try {
      this.webContents.startDrag(
        files.length === 1
          ? { file: files[0] as string, icon }
          : { files, file: files[0] as string, icon }
      )
      return true
    } catch {
      return false
    }
  }
}

class SystemPermissionsService extends RpcTarget implements SystemPermissionsContract {
  async getNotificationPermissionStatus(): Promise<'granted' | 'denied' | 'not-determined'> {
    if (!Notification.isSupported()) return 'denied'
    return 'granted'
  }

  async requestMicrophoneAccess(): Promise<boolean> {
    if (process.platform !== 'darwin') return true
    return systemPreferences.askForMediaAccess('microphone')
  }

  async openNotificationSettings(): Promise<void> {
    await openPreferencePane('x-apple.systempreferences:com.apple.preference.notifications')
  }

  async openScreenRecordingSettings(): Promise<void> {
    await openPreferencePane(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
  }

  async openAccessibilitySettings(): Promise<void> {
    await openPreferencePane(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
    )
  }

  async showPermissionSettingsAppInFinder(): Promise<void> {
    shell.showItemInFolder('/System/Applications/System Settings.app')
  }
}

async function openPreferencePane(url: string): Promise<void> {
  if (process.platform !== 'darwin') return
  await shell.openExternal(url)
}

export interface AppHostDependencies {
  webContents: WebContents
  registry: ProjectRegistry
  windowManager: WindowManager
  menuManager: ApplicationMenuManager
  browserManager: BrowserSidebarManager
  pickDirectories(): Promise<string[]>
}

/**
 * capnweb 的对端主对象。渲染层 `await stub.services` 拿到整棵树。
 * Codex 的 `uae` 也是这个形状（一个 `services` getter）。
 */
export class AppHost extends RpcTarget implements AppHostMain {
  /*
   * `services` 必须是 **getter**，不能是实例属性。
   * capnweb 只允许对端访问类上的方法与 getter；实例属性会被拒绝
   * （"instance properties cannot be accessed over RPC"），
   * 这也是 Codex 的 AppHost 写成 `get services()` 的原因。
   */
  private readonly serviceTree: AppHostServices
  readonly fileDrags: FileDragsService
  readonly workspaceFiles: WorkspaceFilesService

  get services(): AppHostServices {
    return this.serviceTree
  }

  constructor(deps: AppHostDependencies) {
    super()
    this.fileDrags = new FileDragsService(deps.webContents)
    this.workspaceFiles = new WorkspaceFilesService()
    this.serviceTree = {
      appInfo: new AppInfoService(),
      applicationMenu: new ApplicationMenuService(deps.menuManager),
      clipboard: new ClipboardService(),
      openIn: new OpenInService(),
      workspaceFiles: this.workspaceFiles,
      localProjects: new LocalProjectsService(deps.registry, deps.pickDirectories),
      threadProjectAssignments: new ThreadProjectAssignmentsService(deps.registry),
      browserSidebar: new BrowserSidebarService(deps.browserManager),
      chromiumBrowser: new ChromiumBrowserService(),
      windowNavigation: new WindowNavigationService(),
      notifications: new NotificationsService(),
      fileDrags: this.fileDrags,
      // Codex 在非 macOS/Windows 上整个服务为 null，调用方必须判空
      ...(process.platform === 'darwin' || process.platform === 'win32'
        ? { systemPermissions: new SystemPermissionsService() }
        : {})
    }
  }

  async dispose(): Promise<void> {
    await this.workspaceFiles.dispose()
  }
}

export { basename }
