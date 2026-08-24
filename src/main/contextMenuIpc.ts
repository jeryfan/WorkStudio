import { BrowserWindow, Menu, ipcMain, nativeImage } from 'electron'
import { join } from 'path'

/**
 * 原生右键菜单 —— 对齐 Codex 的 `window.electronBridge.showContextMenu(items)`:
 * 渲染层给序列化菜单项,宿主弹原生菜单,resolve 选中项的 id(取消 → null)。
 *
 * 图标:Codex 的菜单项带 app 图标(Open in VS Code 等),资源在渲染层 assets。
 * 这里接受**渲染层打包后的资源文件名**(仅限 assets/apps 白名单目录),
 * 主进程解析成本地图片。其他来源一律忽略,避免任意文件读。
 */

export interface NativeContextMenuItem {
  id: string
  label: string
  /** 缺省 true */
  enabled?: boolean
  /** 'separator' 时忽略其余字段 */
  type?: 'normal' | 'separator'
  /** assets/apps 下的图标文件名(如 vscode.png) */
  iconFile?: string
  submenu?: NativeContextMenuItem[]
}

/** 一次只允许一个菜单;期间再次调用直接返回 null(宿主行为同上) */
let menuOpen = false

function toTemplate(
  items: NativeContextMenuItem[],
  onSelect: (id: string) => void
): Electron.MenuItemConstructorOptions[] {
  return items.map((item) => {
    if (item.type === 'separator') return { type: 'separator' }
    const option: Electron.MenuItemConstructorOptions = {
      id: item.id,
      label: item.label,
      enabled: item.enabled !== false,
      click: () => onSelect(item.id)
    }
    if (item.iconFile) {
      // 只允许 assets/apps 白名单内的图标文件
      const safe = /^[\w.-]+$/.test(item.iconFile) ? item.iconFile : null
      if (safe) {
        // dev: 渲染层源码目录;prod: 打包后的 resources。两处都尝试。
        const candidates = [
          join(__dirname, '../../src/renderer/src/assets/apps', safe),
          join(process.resourcesPath ?? '', 'apps', safe)
        ]
        for (const p of candidates) {
          try {
            const image = nativeImage.createFromPath(p)
            if (!image.isEmpty()) {
              option.icon = image.resize({ width: 16, height: 16 })
              break
            }
          } catch {
            /* 下一个候选 */
          }
        }
      }
    }
    if (item.submenu) option.submenu = toTemplate(item.submenu, onSelect)
    return option
  })
}

export function registerContextMenuIpc(): void {
  ipcMain.handle('context-menu:show', async (event, items: NativeContextMenuItem[]) => {
    if (menuOpen || !Array.isArray(items) || items.length === 0) return null
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    menuOpen = true
    try {
      return await new Promise<string | null>((resolve) => {
        let settled = false
        const finish = (id: string | null): void => {
          if (!settled) {
            settled = true
            resolve(id)
          }
        }
        const menu = Menu.buildFromTemplate(toTemplate(items, finish))
        menu.popup({
          window: win,
          callback: () => {
            menuOpen = false
            finish(null)
          }
        })
      })
    } finally {
      menuOpen = false
    }
  })
}
