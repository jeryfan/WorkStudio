import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { TrayMenuThread, TrayMenuThreads } from '@shared/host/messages'

/**
 * tray（菜单栏/托盘）与 dock 菜单 —— Codex 的 `FEe`（tray）+ dock 菜单控制器。
 *
 * 两个菜单**不一样**，这不是随意的：
 *   tray：Running / Unread / Pinned / Recent / Usage + New Chat + Open <App> + Quit
 *   dock：只有 Unread 与 Recent（Codex 的 dock 类只读这两组）
 * dock 菜单是右键 dock 图标弹出来的，那里已经有系统给的 Quit/Show，重复放
 * 一遍只会挤掉真正有用的会话行。
 *
 * 清单本身**由渲染层推上来**（`tray-menu-threads-changed`）——口径在渲染层，
 * 见该消息的说明。
 */

/** Codex `Hu` / `Z8`：每组直接列几条，多出来的收进 “More” 子菜单 */
const VISIBLE_PER_SECTION = 3
/** Codex `Uu` / `Q8`：标题超过这个字符数就截断加省略号 */
const TITLE_MAX_CHARS = 35

/** Codex 的默认文案（`zu`/`Vu`/`Nu`/`Lu`/`ju`/`Fu`/`Yre`/`qre`/`Zre`） */
const LABELS = {
  more: 'More',
  projectless: 'Chats',
  running: 'Running',
  unread: 'Unread',
  pinned: 'Pinned',
  recent: 'Recent',
  usage: 'Usage',
  newChat: 'New Chat',
  openApp: (appName: string) => `Open ${appName}`
} as const

const EMPTY: TrayMenuThreads = {
  runningThreads: [],
  unreadThreads: [],
  pinnedThreads: [],
  recentThreads: [],
  usageLimits: []
}

export interface TrayMenuCallbacks {
  /** 点击一条会话：path 是 `navigate-to-route` 的 path */
  openThread(path: string): void
  openNewThread(): void
  openMainWindow(): void
}

export class TrayMenuManager {
  private tray: Tray | null = null
  private threads: TrayMenuThreads = EMPTY

  constructor(private readonly callbacks: TrayMenuCallbacks) {}

  /**
   * 建 tray。图标加载不了就不建 —— Electron 用空图标建出来的是一个看不见但
   * 能点的托盘项，比没有更糟。
   */
  start(): void {
    if (this.tray != null) return
    const icon = loadTrayIcon()
    if (icon == null) {
      // 静默不建会让"菜单栏里没有图标"变成一个查不出原因的现象
      console.warn('[host] tray icon asset missing — tray and dock menus are disabled')
      return
    }
    this.tray = new Tray(icon)
    this.tray.setToolTip(app.getName())
    this.bindTrayClicks(this.tray)
    this.refresh()
    console.log('[host] tray created')
  }

  /** Codex `handleMessage` 里那唯一一条 case */
  setThreads(threads: TrayMenuThreads): void {
    this.threads = threads
    this.refresh()
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }

  private bindTrayClicks(tray: Tray): void {
    /*
     * 三个平台的行为不同，照搬 Codex：
     *   linux  —— 只能挂常驻 contextMenu（popUpContextMenu 在多数 DE 上无效）
     *   darwin —— 左右键都弹菜单（菜单栏项没有“主操作”的概念）
     *   win32  —— 左键激活窗口，右键弹菜单（Windows 的托盘惯例）
     */
    if (process.platform === 'linux') {
      tray.on('click', () => this.callbacks.openMainWindow())
      return
    }
    if (process.platform === 'darwin') {
      tray.on('click', () => this.popUp())
      tray.on('right-click', () => this.popUp())
      return
    }
    tray.on('click', () => this.callbacks.openMainWindow())
    tray.on('right-click', () => this.popUp())
  }

  private popUp(): void {
    this.tray?.popUpContextMenu(Menu.buildFromTemplate(this.trayTemplate()))
  }

  private refresh(): void {
    // linux 的 tray 菜单必须是常驻的，改了要重新 set
    if (process.platform === 'linux' && this.tray != null) {
      this.tray.setContextMenu(Menu.buildFromTemplate(this.trayTemplate()))
    }
    if (process.platform === 'darwin') {
      app.dock?.setMenu(Menu.buildFromTemplate(this.dockTemplate()))
    }
  }

  /** Codex `getNativeTrayMenuItems` */
  private trayTemplate(): MenuItemConstructorOptions[] {
    const sections = [
      this.section(LABELS.running, this.threads.runningThreads),
      this.section(LABELS.unread, this.threads.unreadThreads),
      this.section(LABELS.pinned, this.threads.pinnedThreads),
      this.section(LABELS.recent, this.threads.recentThreads),
      this.usageSection()
    ]
    const body = joinSections(sections)
    return [
      ...body,
      ...(body.length > 0 ? [{ type: 'separator' as const }] : []),
      { label: LABELS.newChat, click: () => this.callbacks.openNewThread() },
      { type: 'separator' },
      // win32 的托盘左键已经是“打开窗口”，菜单里再来一条是重复的
      ...(process.platform === 'win32'
        ? []
        : [
            {
              label: LABELS.openApp(app.getName()),
              click: () => this.callbacks.openMainWindow()
            },
            { type: 'separator' as const }
          ]),
      { role: 'quit' }
    ]
  }

  /** Codex dock 菜单控制器的 `refreshMenu`：只有 Unread 与 Recent */
  private dockTemplate(): MenuItemConstructorOptions[] {
    /*
     * Recent 要剔掉已经出现在 Unread 里的那些（Codex 用 unread 的 path 集合
     * 过滤）。不剔的话同一个会话在一个菜单里出现两次。
     */
    const unreadPaths = new Set(this.threads.unreadThreads.map((thread) => thread.path))
    return joinSections([
      this.section(LABELS.unread, this.threads.unreadThreads),
      this.section(
        LABELS.recent,
        this.threads.recentThreads.filter((thread) => !unreadPaths.has(thread.path))
      )
    ])
  }

  /** Codex `Wu` / `t5`：一组 = 不可点的标题 + 前 3 条 + “More” 子菜单 */
  private section(label: string, threads: TrayMenuThread[]): MenuItemConstructorOptions[] {
    if (threads.length === 0) return []
    const visible = threads.slice(0, VISIBLE_PER_SECTION)
    const overflow = threads.slice(VISIBLE_PER_SECTION)
    return [
      { label, enabled: false },
      ...visible.map((thread) => this.threadItem(thread)),
      ...(overflow.length > 0
        ? [{ label: LABELS.more, submenu: overflow.map((thread) => this.threadItem(thread)) }]
        : [])
    ]
  }

  /** Codex `Gu` */
  private threadItem(thread: TrayMenuThread): MenuItemConstructorOptions {
    const sublabel = thread.isProjectless ? LABELS.projectless : thread.projectLabel
    return {
      label: truncateTitle(thread.title),
      ...(sublabel.length > 0 ? { sublabel } : {}),
      click: () => this.callbacks.openThread(thread.path)
    }
  }

  /** 配额说明：Codex 只在 darwin 上显示，且整组都是不可点的 */
  private usageSection(): MenuItemConstructorOptions[] {
    if (process.platform !== 'darwin' || this.threads.usageLimits.length === 0) return []
    return [
      { label: LABELS.usage, enabled: false },
      ...this.threads.usageLimits.map(({ label }) => ({ label, enabled: false }))
    ]
  }
}

/** 组之间插分隔符；空组不占位（Codex 的 `filter(len>0).flatMap`） */
function joinSections(sections: MenuItemConstructorOptions[][]): MenuItemConstructorOptions[] {
  return sections
    .filter((section) => section.length > 0)
    .flatMap((section, index) =>
      index === 0 ? section : [{ type: 'separator' as const }, ...section]
    )
}

/**
 * Codex `Gu` 的截断：按 **码点**切而不是 `slice`。
 * `String.prototype.slice` 会把 emoji 与非 BMP 字符切成半个代理对，
 * 菜单里显示成方框。
 */
function truncateTitle(title: string): string {
  const codePoints = Array.from(title)
  if (codePoints.length <= TITLE_MAX_CHARS) return title
  return `${codePoints
    .slice(0, TITLE_MAX_CHARS - 1)
    .join('')
    .trimEnd()}…`
}

/**
 * tray 图标。
 *
 * **不确定**：Codex 用的是 `chatgptTemplate.png` / `@2x`（macOS 的 template
 * image，随明暗主题自动反色）。本项目没有对应的模板图，先用 `resources/icon.png`
 * 缩到 16pt。macOS 上它不会跟着主题反色 —— 需要一张单色模板图才能对齐，
 * 那是资产问题不是代码问题。
 */
function loadTrayIcon(): Electron.NativeImage | null {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'icon.png')]
    : [join(app.getAppPath(), 'resources', 'icon.png')]
  for (const path of candidates) {
    if (!existsSync(path)) continue
    const image = nativeImage.createFromPath(path)
    if (image.isEmpty()) continue
    return image.resize({ width: 16, height: 16 })
  }
  return null
}
