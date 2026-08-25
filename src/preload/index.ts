import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  HOST_CHANNEL,
  WINDOW_TYPE_ELECTRON,
  workerChannelForView,
  workerChannelFromView
} from '@shared/host/channels'
import { isChunkedMessage } from '@shared/host/chunked'
import type { ViewMessage, SystemThemeVariant } from '@shared/host/messages'
import type { NativeContextMenuItem, NativeContextMenuResult } from '@shared/host/contextMenu'
import type { BootstrapPayload } from '@shared/workspace/types'

/**
 * 宿主桥 —— 与 Codex 的 `electronBridge` 同名、同形状、同语义。
 *
 * 三条硬性设计（都从 Codex preload.js 逐行还原）：
 *
 * 1. **业务消息只有一个信封**。`sendMessageFromView` 把整条消息 invoke 给主进程，
 *    回程不是回调而是被**重新派发成 window 的 `message` 事件**。这样渲染层的
 *    消息处理代码在 Electron 宿主和 web/iframe 宿主里是同一份，
 *    `codexWindowType` 只用来做少量分支。新增功能不需要动这个文件。
 *
 * 2. **首屏同步取值**。外观、侧栏首屏数据、shared object 快照都用 `sendSync`：
 *    代价是阻塞一次进程往返，换来第一帧就有真实内容。外观还必须在
 *    `documentElement` 上**立刻**加 class —— 等渲染层 effect 再加就会闪白。
 *
 * 3. **分块消息在这一层只透传不重组**。preload 只认 marker 并提供 ACK 通道，
 *    重组交给渲染层，这样大 payload 的重建成本落在渲染进程自己的时间片里，
 *    不会卡住 preload 所在的主世界启动路径。
 */

const preloadStartedAtMs = performance.timeOrigin

/** 首屏同步快照：只取一次，之后由 shared-object-updated 维护本地镜像 */
const sharedObjectSnapshot: Record<string, unknown> =
  ipcRenderer.sendSync(HOST_CHANNEL.getSharedObjectSnapshot) ?? {}

let systemThemeVariant: SystemThemeVariant = ipcRenderer.sendSync(
  HOST_CHANNEL.getSystemThemeVariant
)

/**
 * 主题 class 必须在文档可用的第一刻就挂上。
 * document.documentElement 在 preload 早期可能还是 null（document-start 注入），
 * 此时用 MutationObserver 等它出现 —— 与 Codex 的写法一致。
 */
const themeClass = systemThemeVariant === 'dark' ? 'electron-dark' : 'electron-light'
const rootElement = document.documentElement
if (rootElement != null) {
  rootElement.classList.add(themeClass)
} else {
  const observer = new MutationObserver(() => {
    const root = document.documentElement
    if (root != null) {
      root.classList.add(themeClass)
      observer.disconnect()
    }
  })
  observer.observe(document, { childList: true })
}

const themeListeners = new Set<(variant: SystemThemeVariant) => void>()
ipcRenderer.on(HOST_CHANNEL.systemThemeVariantUpdated, (_event, variant: SystemThemeVariant) => {
  systemThemeVariant = variant
  themeListeners.forEach((listener) => listener(variant))
})

/** 本地镜像：渲染层自己写的值立刻可读，不必等主进程回推 */
function mirrorSharedObject(key: string, value: unknown): void {
  if (value === undefined) {
    delete sharedObjectSnapshot[key]
    return
  }
  sharedObjectSnapshot[key] = value
}

let sidebarBootstrap: BootstrapPayload | undefined

// ── worker 独立频道（按 worker id 分频道，不与主消息总线抢序） ──────────
const workerListeners = new Map<string, Set<(message: unknown) => void>>()
const workerForwarders = new Map<string, (event: unknown, message: unknown) => void>()

const electronBridge = {
  windowType: WINDOW_TYPE_ELECTRON,

  getPreloadStartedAtMs: (): number => preloadStartedAtMs,

  sendMessageFromView: async (message: ViewMessage): Promise<void> => {
    if (message.type === 'shared-object-set') mirrorSharedObject(message.key, message.value)
    await ipcRenderer.invoke(HOST_CHANNEL.messageFromView, message)
  },

  acknowledgeChunkedMessage: (transferId: string, sequence: number): void => {
    ipcRenderer.send(HOST_CHANNEL.chunkedMessageAck, transferId, sequence)
  },

  /** Electron 32+ 拿拖入文件真实路径的唯一正解 */
  getPathForFile: (file: File): string | null => webUtils.getPathForFile(file) || null,

  /** 反向拖拽：把工作区文件拖到 Finder/Explorer */
  startFileDrag: (paths: string[]): boolean =>
    ipcRenderer.sendSync(HOST_CHANNEL.startFileDrag, paths) === true,

  sendWorkerMessageFromView: async (workerId: string, message: unknown): Promise<void> => {
    await ipcRenderer.invoke(workerChannelFromView(workerId), message)
  },

  subscribeToWorkerMessages: (
    workerId: string,
    handler: (message: unknown) => void
  ): (() => void) => {
    let listeners = workerListeners.get(workerId)
    if (!listeners) {
      listeners = new Set()
      workerListeners.set(workerId, listeners)
    }
    let forwarder = workerForwarders.get(workerId)
    if (!forwarder) {
      forwarder = (_event: unknown, message: unknown): void => {
        workerListeners.get(workerId)?.forEach((listener) => listener(message))
      }
      workerForwarders.set(workerId, forwarder)
      ipcRenderer.on(workerChannelForView(workerId), forwarder)
    }
    listeners.add(handler)
    return () => {
      const current = workerListeners.get(workerId)
      if (!current) return
      current.delete(handler)
      if (current.size > 0) return
      workerListeners.delete(workerId)
      const registered = workerForwarders.get(workerId)
      if (registered) ipcRenderer.removeListener(workerChannelForView(workerId), registered)
      workerForwarders.delete(workerId)
    }
  },

  showContextMenu: (items: NativeContextMenuItem[]): Promise<NativeContextMenuResult> =>
    ipcRenderer.invoke(HOST_CHANNEL.showContextMenu, items),

  getSharedObjectSnapshotValue: (key: string): unknown => sharedObjectSnapshot[key],

  getInitialSidebarBootstrap: (): BootstrapPayload => {
    sidebarBootstrap ??= ipcRenderer.sendSync(HOST_CHANNEL.getInitialSidebarBootstrap)
    return sidebarBootstrap as BootstrapPayload
  },

  getSystemThemeVariant: (): SystemThemeVariant => systemThemeVariant,

  subscribeToSystemThemeVariant: (handler: (variant: SystemThemeVariant) => void): (() => void) => {
    themeListeners.add(handler)
    return () => {
      themeListeners.delete(handler)
    }
  }
}

/**
 * 主 → 渲染：不做回调分发，重新派发成 window 的 message 事件。
 * shared object 的变更顺手更新本地镜像，`getSharedObjectSnapshotValue`
 * 才能在渲染层同步读到最新值。
 */
ipcRenderer.on(HOST_CHANNEL.messageForView, (_event, payload: unknown) => {
  if (!isChunkedMessage(payload)) {
    const message = payload as { type?: string; key?: string; value?: unknown }
    if (message.type === 'shared-object-updated' && typeof message.key === 'string') {
      mirrorSharedObject(message.key, message.value)
    }
  }
  window.dispatchEvent(new MessageEvent('message', { data: payload }))
})

/**
 * 服务树握手：渲染层 `postMessage({type:'connect-app-host', port})`，
 * 这里把 MessagePort 转移给主进程。转移之后主/渲染是点对点通道，
 * 不再经过上面的主消息总线 —— 这是 Codex 让服务调用不被事件流阻塞的关键。
 */
window.addEventListener('message', (event) => {
  if (
    event.source !== window ||
    (event.data as { type?: string } | null)?.type !== 'connect-app-host'
  ) {
    return
  }
  const { port } = event.data as { port: MessagePort }
  ipcRenderer.postMessage(HOST_CHANNEL.connectAppHost, undefined, [port])
})

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('codexWindowType', WINDOW_TYPE_ELECTRON)
    contextBridge.exposeInMainWorld('electronBridge', electronBridge)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.codexWindowType = WINDOW_TYPE_ELECTRON
  // @ts-ignore (define in dts)
  window.electronBridge = electronBridge
}

export type ElectronBridge = typeof electronBridge
