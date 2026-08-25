import { app, type WebContents } from 'electron'
import type { ViewMessage } from '@shared/host/messages'
import type { SharedObjectRepository } from './SharedObjectRepository'
import type { WindowManager } from './WindowManager'
import type { AppServerConnection } from '../agent/AppServerConnection'
import type { BrowserSidebarManager } from '../browser/BrowserSidebarManager'

/**
 * 宿主消息分发。
 *
 * 取证：Codex 的 `ElectronMessageHandler`（`getElectronMessageHandlerForWindow` /
 * `windowContext.handleMessage`）。主进程侧只有**一个** `ipcMain.handle`，
 * 所有业务消息在这里按 `type` 分流。
 *
 * 这个函数的规模就是"宿主到底提供了多少能力"的度量 —— Codex 那份有 300+ 分支。
 * 保持它是一个平铺的 switch 而不是拆成一堆注册表：分流逻辑集中在一处，
 * 想知道某条消息谁在处理，grep type 字符串就能到底。
 */
export class ElectronMessageHandler {
  constructor(
    private readonly deps: {
      sharedObjects: SharedObjectRepository
      windowManager: WindowManager
      browserManager: BrowserSidebarManager
      appServer: AppServerConnection
      onReady(webContents: WebContents): void
    }
  ) {}

  async handleMessage(webContents: WebContents, message: ViewMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        console.log(`[host] view ready — webContents ${webContents.id}`)
        this.deps.onReady(webContents)
        return

      case 'log-message':
        // 渲染层日志汇入主进程 —— 崩溃现场只看渲染层控制台是拿不到的
        console.log(`[view:${message.level}]`, message.message)
        return

      // ── shared object ────────────────────────────────────────────
      case 'shared-object-set':
        this.deps.sharedObjects.set(message.key, message.value)
        return
      case 'shared-object-subscribe':
      case 'shared-object-unsubscribe':
        // 本项目对所有窗口广播全部 key（量很小）；订阅表留待 key 变多再加
        return

      // ── 窗口 ──────────────────────────────────────────────────────
      case 'electron-window-focus-request': {
        const window = this.deps.windowManager.getPrimaryWindow()
        if (window != null) {
          if (window.isMinimized()) window.restore()
          window.show()
          window.focus()
        }
        return
      }
      case 'electron-set-badge-count':
        if (typeof message.count === 'number') app.setBadgeCount(Math.max(0, message.count))
        return
      case 'open-current-main-window': {
        const window = await this.deps.windowManager.showPrimaryWindow()
        if (window != null && message.focusComposer === true) {
          this.deps.windowManager.sendMessageToWindow(window, { type: 'focus-composer' })
        }
        return
      }
      case 'open-in-new-window': {
        const window = this.deps.windowManager.createWindow()
        this.deps.windowManager.sendMessageToWindow(window, {
          type: 'navigate-to-route',
          path: message.path
        })
        return
      }
      case 'show-settings': {
        const window = await this.deps.windowManager.showPrimaryWindow()
        if (window != null) {
          this.deps.windowManager.sendMessageToWindow(window, {
            type: 'navigate-to-route',
            path: `/settings/${message.section}`,
            state: message.state
          })
        }
        return
      }
      case 'quit-app':
        app.quit()
        return
      case 'mac-menu-bar-enabled-changed':
        // macOS 菜单栏常驻项未实现（Codex 的 tray/dock 控制器那一档）
        return

      // ── app-server ────────────────────────────────────────────────
      case 'mcp-request': {
        const target = this.deps.windowManager.getWebviewWindow(webContents)
        if (target == null) return
        await this.deps.appServer.handleClientRequest(target, message.request)
        return
      }
      case 'mcp-response':
        this.deps.appServer.handleClientResponse(message.message)
        return
      case 'mcp-request-abandon': {
        const target = this.deps.windowManager.getWebviewWindow(webContents)
        if (target != null) this.deps.appServer.abandonRequest(target, message.id)
        return
      }

      // ── 内置浏览器 ────────────────────────────────────────────────
      case 'browser-sidebar-sync':
        this.deps.browserManager.registerWebviewHost({
          conversationId: message.conversationId,
          browserTabId: message.browserTabId,
          instanceId: message.instanceId,
          url: message.url
        })
        return
      case 'browser-sidebar-command':
        await this.deps.browserManager.runCommand(
          message.conversationId,
          message.browserTabId,
          message.command
        )
        return
      case 'browser-sidebar-webview-destroyed':
        this.deps.browserManager.closePage(message.conversationId, message.browserTabId)
        return
      case 'browser-sidebar-clear-browsing-data':
        await this.deps.browserManager.clearBrowsingData(message.kinds)
        return
    }
  }
}
