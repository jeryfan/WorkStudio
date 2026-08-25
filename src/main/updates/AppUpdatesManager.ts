import { app, dialog, BrowserWindow } from 'electron'
import type { AppUpdateViewState } from '@shared/host/appHost'

/**
 * 自动更新 —— Codex 的 `sparkleManager` 在本项目的对应物。
 *
 * **实现差异（结构性，不是风格）**：Codex 用 Sparkle（macOS 原生框架，
 * `native/sparkle.node`），本项目用已有的 electron-updater。对外的状态形状
 * 保持 Codex 的 `getAppUpdateViewState()`，因为渲染层是按那几个字段画的；
 * 内部的事件来源换成 electron-updater 的 autoUpdater 事件。
 *
 * electron-updater 是**惰性加载**的：它一被 import 就会读 `app-update.yml`，
 * 开发环境里那个文件是 `dev-app-update.yml`，没有配好 publish 时会打警告。
 * 更要紧的是打包产物里没有签名/publish 配置时它会抛 —— 那不该拖垮主进程启动。
 */

interface AutoUpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  checkForUpdates(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
  on(event: string, listener: (...args: unknown[]) => void): unknown
}

export class AppUpdatesManager {
  private state: AppUpdateViewState = {
    downloadProgressPercent: null,
    downloadedUpdateAppBrand: null,
    installProgressPercent: null,
    isUpdateReady: false,
    lifecycleState: 'idle',
    relaunchNotice: null
  }
  private updater: AutoUpdaterLike | null = null
  private loadFailed = false
  private readonly listeners = new Set<(state: AppUpdateViewState) => void>()
  /**
   * Codex 的 `setSparkleQueryParams` 会把参数拼进 Sparkle 的 feed URL。
   * electron-updater 的 feed 地址来自打包时写死的 `app-update.yml`，运行期改不了，
   * 所以这里只记录 —— 记录而不是忽略，是为了让"渲染层设了但没生效"这件事
   * 在调试时看得见，而不是变成一个静默的空实现。
   */
  private sparkleQueryParams: Record<string, string> = {}

  getState(): AppUpdateViewState {
    return { ...this.state }
  }

  addListener(listener: (state: AppUpdateViewState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setSparkleQueryParams(params: Record<string, string>): void {
    this.sparkleQueryParams = { ...params }
  }

  getSparkleQueryParams(): Record<string, string> {
    return { ...this.sparkleQueryParams }
  }

  checkForUpdates(): void {
    const updater = this.ensureUpdater()
    if (updater == null) return
    this.patch({ lifecycleState: 'checking' })
    void updater.checkForUpdates().catch((error: unknown) => {
      this.patch({ lifecycleState: 'error', relaunchNotice: describe(error) })
    })
  }

  /**
   * Codex `installUpdate`：macOS 上先弹确认框。
   *
   * 确认不是礼貌 —— 装更新会 quit 整个应用，而 quit 会杀掉这台机器上**正在跑
   * 的本地会话**。Codex 的对话框正文说的就是这件事。
   */
  async installUpdate(origin?: Electron.WebContents): Promise<void> {
    const updater = this.ensureUpdater()
    if (updater == null) return
    if (!this.state.isUpdateReady) return
    if (process.platform === 'darwin') {
      const appName = app.getName()
      const options: Electron.MessageBoxOptions = {
        type: 'warning',
        buttons: ['Update', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        title: `Update ${appName} now?`,
        message: `Update ${appName} now?`,
        detail: `${appName} will quit to install the update, which will interrupt active local sessions on this machine`
      }
      const window =
        (origin == null ? null : BrowserWindow.fromWebContents(origin)) ??
        BrowserWindow.getAllWindows()[0] ??
        null
      const result =
        window == null
          ? await dialog.showMessageBox(options)
          : await dialog.showMessageBox(window, options)
      if (result.response !== 0) return
    }
    updater.quitAndInstall()
  }

  /**
   * 真正加载 electron-updater。
   *
   * 延迟到第一次用：打包配置没有 publish 段时 `autoUpdater` 的 getter 会抛，
   * 放在启动路径上就是"整个应用起不来，而坏掉的只是更新检查"。
   */
  private ensureUpdater(): AutoUpdaterLike | null {
    if (this.updater != null) return this.updater
    if (this.loadFailed) return null
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- 见上方说明：必须延迟加载
      const { autoUpdater } = require('electron-updater') as { autoUpdater: AutoUpdaterLike }
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      this.bind(autoUpdater)
      this.updater = autoUpdater
      return autoUpdater
    } catch (error) {
      this.loadFailed = true
      this.patch({ lifecycleState: 'error', relaunchNotice: describe(error) })
      console.warn('[host] auto updater unavailable', error)
      return null
    }
  }

  private bind(updater: AutoUpdaterLike): void {
    updater.on('checking-for-update', () => this.patch({ lifecycleState: 'checking' }))
    updater.on('update-not-available', () =>
      this.patch({ lifecycleState: 'idle', downloadProgressPercent: null })
    )
    updater.on('update-available', () =>
      this.patch({ lifecycleState: 'available', downloadProgressPercent: 0 })
    )
    updater.on('download-progress', (...args: unknown[]) => {
      const percent = (args[0] as { percent?: number } | undefined)?.percent
      this.patch({
        lifecycleState: 'downloading',
        downloadProgressPercent: typeof percent === 'number' ? Math.round(percent) : null
      })
    })
    updater.on('update-downloaded', () =>
      this.patch({
        lifecycleState: 'ready',
        downloadProgressPercent: 100,
        installProgressPercent: 100,
        isUpdateReady: true,
        relaunchNotice: `Restart ${app.getName()} to finish updating`
      })
    )
    updater.on('error', (...args: unknown[]) =>
      this.patch({ lifecycleState: 'error', relaunchNotice: describe(args[0]) })
    )
  }

  private patch(next: Partial<AppUpdateViewState>): void {
    this.state = { ...this.state, ...next }
    const snapshot = this.getState()
    for (const listener of Array.from(this.listeners)) listener(snapshot)
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
