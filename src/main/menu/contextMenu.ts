import {
  BrowserWindow,
  Menu,
  ipcMain,
  nativeImage,
  type MenuItemConstructorOptions
} from 'electron'
import { join, normalize, sep } from 'node:path'
import { HOST_CHANNEL } from '@shared/host/channels'
import type { NativeContextMenuItem, NativeContextMenuResult } from '@shared/host/contextMenu'

/**
 * 原生右键菜单。
 *
 * 取证：Codex 的 `ipcMain.handle('codex_desktop:show-context-menu')` 把渲染层给的
 * 序列化菜单项翻译成 `Menu.buildFromTemplate(...).popup({window, callback})`，
 * **返回 `{ id }`**（取消是 `{ id: null }`）；图标是路径，在
 * `nativeContextMenuIconSearchRoots` 里逐个搜，搜不到就不显示图标。
 *
 * 为什么返回对象而不是裸 id：裸 id 的 `null` 和"选了一个 id 为空串的项"没法区分，
 * 而对象形态还留了将来加字段（比如按下的修饰键）的余地。
 */
export function registerContextMenuIpc(iconSearchRoots: string[]): () => void {
  const roots = iconSearchRoots.map((root) => normalize(root))

  ipcMain.handle(
    HOST_CHANNEL.showContextMenu,
    async (event, items: NativeContextMenuItem[]): Promise<NativeContextMenuResult> => {
      if (!Array.isArray(items) || items.length === 0) return { id: null }
      const window = BrowserWindow.fromWebContents(event.sender)

      return new Promise<NativeContextMenuResult>((resolve) => {
        let settled = false
        const finish = (id: string | null): void => {
          if (settled) return
          settled = true
          resolve({ id })
        }
        const template = items.map((item) => toTemplate(item, roots, finish))
        Menu.buildFromTemplate(template).popup({
          window: window ?? undefined,
          callback: () => finish(null)
        })
      })
    }
  )

  return () => ipcMain.removeHandler(HOST_CHANNEL.showContextMenu)
}

function toTemplate(
  item: NativeContextMenuItem,
  roots: string[],
  onSelect: (id: string) => void
): MenuItemConstructorOptions {
  if (item.type === 'separator') return { type: 'separator' }
  const option: MenuItemConstructorOptions = {
    id: item.id,
    label: item.label,
    enabled: item.enabled !== false,
    click: () => onSelect(item.id)
  }
  if (item.role != null) option.role = item.role as MenuItemConstructorOptions['role']
  if (item.type === 'checkbox') {
    option.type = 'checkbox'
    option.checked = item.checked === true
  }
  if (item.toolTip != null) option.toolTip = item.toolTip
  if (item.icon != null) {
    const image = resolveIcon(item.icon, roots)
    if (image != null) option.icon = image
  }
  if (item.submenu != null) {
    option.submenu = item.submenu.map((child) => toTemplate(child, roots, onSelect))
  }
  return option
}

/**
 * 图标解析：只接受落在搜索根内的相对路径。
 * 不做这层校验的话，渲染层传 `../../../etc/passwd` 就变成任意文件读探测。
 */
function resolveIcon(icon: string, roots: string[]): Electron.NativeImage | null {
  for (const root of roots) {
    const candidate = normalize(join(root, icon))
    if (candidate !== root && !candidate.startsWith(root + sep)) continue
    try {
      const image = nativeImage.createFromPath(candidate)
      if (!image.isEmpty()) return image.resize({ width: 16, height: 16 })
    } catch {
      /* 下一个搜索根 */
    }
  }
  return null
}
