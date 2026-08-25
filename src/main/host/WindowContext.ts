import {
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  type MessagePortMain,
  type WebContents
} from 'electron'
import { join } from 'node:path'
import { HOST_CHANNEL } from '@shared/host/channels'
import type { SystemThemeVariant, ViewMessage } from '@shared/host/messages'
import type { AppViewMain } from '@shared/host/appHost'
import type { BootstrapPayload } from '@shared/workspace/types'
import type { ProjectRegistry } from '../workspace/ProjectRegistry'
import type { AgentRuntime } from '../agent/AgentRuntime'
import { ApplicationMenuManager } from '../menu/ApplicationMenuManager'
import { registerContextMenuIpc } from '../menu/contextMenu'
import { BrowserSidebarManager } from '../browser/BrowserSidebarManager'
import { BrowserSessionRegistry } from '../browser/BrowserSessionRegistry'
import { attachBrowserWebviewHooks } from '../browser/webviewAttach'
import { SharedObjectRepository } from './SharedObjectRepository'
import { WindowManager } from './WindowManager'
import { ElectronMessageHandler } from './ElectronMessageHandler'
import { newMessagePortMainRpcSession } from './messagePortSession'
import { AppHost } from './services/AppHost'

/**
 * 应用级上下文。
 *
 * 取证：Codex 的 `getContextForWebContents(wc)` 返回的是**同一个实例**
 *（`hasRegisteredWebContents(wc) ? I : null`），也就是说它是应用级单例而不是
 * 每窗口一个；窗口相关的东西（`registeredWindows` / `appViewsByWebContentsId` /
 * `fileDragServices`）都是它内部按 webContents id 的表。本项目照这个形状来。
 *
 * 它负责三件事：
 *   1. 拥有全部宿主服务与管理器（生命周期比任何窗口都长）；
 *   2. 把窗口接进 app-server 连接、菜单、浏览器 attach 钩子；
 *   3. 提供首屏 sendSync 快照的数据源。
 */
export class WindowContext {
  readonly sharedObjects = new SharedObjectRepository()
  readonly windowManager = new WindowManager()
  readonly menuManager: ApplicationMenuManager
  readonly browserManager: BrowserSidebarManager
  readonly browserSessions: BrowserSessionRegistry
  private readonly messageHandler: ElectronMessageHandler
  private readonly appHosts = new Map<number, AppHost>()
  private readonly appViews = new Map<number, AppViewMain>()
  private readonly readyWebContentsIds = new Set<number>()
  private readonly disposers: Array<() => void> = []

  constructor(
    private readonly registry: ProjectRegistry,
    private readonly agent: AgentRuntime
  ) {
    this.menuManager = new ApplicationMenuManager(this.windowManager)
    this.browserManager = new BrowserSidebarManager(this.windowManager)
    this.browserSessions = new BrowserSessionRegistry(this.browserManager)
    this.messageHandler = new ElectronMessageHandler({
      sharedObjects: this.sharedObjects,
      windowManager: this.windowManager,
      browserManager: this.browserManager,
      appServer: this.agent.connection,
      onReady: (webContents) => this.readyWebContentsIds.add(webContents.id)
    })

    // shared object 变更 → 广播（渲染层的本地镜像靠它更新）
    this.disposers.push(
      this.sharedObjects.addSubscriber((key) => {
        this.windowManager.sendMessageToAllWindows(this.sharedObjects.updateMessage(key))
      })
    )

    // 系统外观：唯一可靠信号源是 nativeTheme 的 updated（会随日出日落自动切）
    const onThemeUpdated = (): void => {
      const variant = currentThemeVariant()
      for (const target of this.windowManager.getAllWebviewWindows()) {
        target.webContents.send(HOST_CHANNEL.systemThemeVariantUpdated, variant)
      }
    }
    nativeTheme.on('updated', onThemeUpdated)
    this.disposers.push(() => nativeTheme.removeListener('updated', onThemeUpdated))

    // 新窗口：接进 app-server 连接 + 挂 webview attach 钩子
    this.disposers.push(
      this.windowManager.onWindowRegistered((target) => {
        this.agent.registerWebviewWindow(target)
        const detach = attachBrowserWebviewHooks(target.webContents, this.browserManager)
        target.onDestroyed(() => {
          detach()
          this.appHosts.get(target.id)?.dispose()
          this.appHosts.delete(target.id)
          this.appViews.delete(target.id)
          this.readyWebContentsIds.delete(target.id)
        })
      })
    )

    /*
     * browser_use 的宿主钩子（Codex 的 BrowserUseThreadConfig +
     * ensureBackendForSession + dispatchTurnEnded 三件事）。
     *
     * 环境变量以 `shell_environment_policy.set.<VAR>` 的扁平点号键塞进
     * thread/start 的 config —— code-mode 沙箱是 app-server 起的子进程，
     * 只有走它的环境策略才能把值送进去。
     */
    this.agent.connection.setHooks({
      threadStartConfig: () => {
        const config: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(this.browserSessions.browserUseThreadEnv())) {
          config[`shell_environment_policy.set.${key}`] = value
        }
        return config
      },
      turnStarted: async (conversationId) => {
        await this.browserSessions.ensureBackendForSession(conversationId)
      },
      turnEnded: (conversationId, turnId) =>
        this.browserSessions.dispatchTurnEnded(conversationId, turnId)
    })

    this.menuManager.rebuild()
  }

  /** 注册宿主 IPC —— 全应用只有这一处 ipcMain 注册点 */
  registerIpc(): void {
    ipcMain.handle(HOST_CHANNEL.messageFromView, async (event, message: ViewMessage) => {
      if (!this.isTrusted(event.sender)) return
      await this.messageHandler.handleMessage(event.sender, message)
    })

    ipcMain.on(HOST_CHANNEL.chunkedMessageAck, (event, transferId: string, sequence: number) => {
      this.windowManager.chunkedMessageSender.acknowledge(event.sender, transferId, sequence)
    })

    // 首屏同步快照：三条都只读内存态，不落盘、不等 agent
    ipcMain.on(HOST_CHANNEL.getSharedObjectSnapshot, (event) => {
      event.returnValue = this.isTrusted(event.sender) ? this.sharedObjects.getSnapshot() : {}
    })
    ipcMain.on(HOST_CHANNEL.getInitialSidebarBootstrap, (event) => {
      event.returnValue = this.isTrusted(event.sender) ? this.getInitialSidebarBootstrap() : null
    })
    ipcMain.on(HOST_CHANNEL.getSystemThemeVariant, (event) => {
      event.returnValue = currentThemeVariant()
    })

    ipcMain.on(HOST_CHANNEL.startFileDrag, (event, paths: string[]) => {
      const host = this.appHosts.get(event.sender.id)
      event.returnValue = host?.fileDrags.startDrag(paths) ?? false
    })

    /*
     * 服务树握手：渲染层转移过来一个 MessagePort。
     * 之后主/渲染是点对点通道，服务调用不再与事件流抢同一条队列。
     */
    ipcMain.on(HOST_CHANNEL.connectAppHost, (event) => {
      if (!this.isTrusted(event.sender)) return
      const [port] = event.ports as MessagePortMain[]
      if (port == null) return
      this.connectAppHost(event.sender, port)
    })

    // 内置浏览器页面 preload 的事件（发件人是 guest，不在 trusted 表里）
    ipcMain.on(HOST_CHANNEL.browserPageEvent, (event, pageEvent) => {
      if (!this.browserManager.isBrowserPageWebContents(event.sender)) return
      this.browserManager.handlePageEvent(event.sender, pageEvent)
    })

    // 右键菜单图标搜索根：只允许渲染层打包资源目录，防任意文件读探测
    this.disposers.push(
      registerContextMenuIpc([
        join(__dirname, '../../src/renderer/src/assets/apps'),
        join(process.resourcesPath ?? '', 'apps')
      ])
    )
  }

  private connectAppHost(webContents: WebContents, port: MessagePortMain): void {
    const host = new AppHost({
      webContents,
      registry: this.registry,
      windowManager: this.windowManager,
      menuManager: this.menuManager,
      browserManager: this.browserManager,
      pickDirectories: () => this.pickDirectories()
    })
    this.appHosts.set(webContents.id, host)
    // 双向：把 host 暴露出去，同时拿到渲染层导出的服务树
    const view = newMessagePortMainRpcSession<AppViewMain>(port, host)
    void Promise.resolve(view.services)
      .then(() => {
        this.appViews.set(webContents.id, view)
        console.log(`[host] app host connected — webContents ${webContents.id}`)
      })
      .catch((error: unknown) => {
        console.warn('[host] failed to register AppView services', error)
      })
  }

  /** 让渲染层的查询缓存失效（Codex `broadcastQueryCacheInvalidation`） */
  broadcastQueryCacheInvalidation(queryKey: readonly string[]): void {
    for (const view of this.appViews.values()) {
      void Promise.resolve(view.services)
        .then((services) => services.clientCoordination.invalidateQueryCache({ queryKey }))
        .catch((error: unknown) => {
          console.warn('[host] failed to publish query cache invalidation', error)
        })
    }
  }

  /**
   * 侧栏首屏快照。
   *
   * 侧栏若等异步服务调用返回再渲染，第一帧必然是空列表，用户看到的是
   * "闪一下才出内容"。这里只读内存态，代价是阻塞一次 IPC 往返。
   */
  getInitialSidebarBootstrap(): BootstrapPayload {
    return { workspace: this.registry.snapshot() }
  }

  private async pickDirectories(): Promise<string[]> {
    // 挂到当前窗口上，macOS 才会以 sheet 形式呈现而不是独立窗口
    const parent = this.windowManager.getPrimaryWindow()
    const options = {
      properties: ['openDirectory', 'createDirectory', 'multiSelections'] as Array<
        'openDirectory' | 'createDirectory' | 'multiSelections'
      >
    }
    const result =
      parent != null
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  }

  /**
   * 只接受本应用窗口的消息。
   * 内置浏览器里的页面也在同一个进程组里，若不校验发件人，网页就能
   * 直接调宿主能力 —— Codex 的 `isTrustedIpcEvent` 做的是同一件事。
   */
  private isTrusted(webContents: WebContents): boolean {
    return this.windowManager.hasRegisteredWebContents(webContents)
  }

  async dispose(): Promise<void> {
    for (const dispose of this.disposers) dispose()
    for (const host of this.appHosts.values()) await host.dispose()
    this.appHosts.clear()
    this.appViews.clear()
    await this.browserSessions.disposeAll()
  }
}

function currentThemeVariant(): SystemThemeVariant {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

export { BrowserWindow }
