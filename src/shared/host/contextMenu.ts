/**
 * 原生右键菜单的序列化规格。
 *
 * 取证：Codex `showContextMenu(spec)` → `ipcMain.handle('codex_desktop:show-context-menu')`
 * → `Menu.buildFromTemplate(...).popup({window, callback})`，**返回 `{ id }`**
 * 而不是裸 id（取消时 `{ id: null }`）。图标是**磁盘路径**，主进程在
 * nativeContextMenuIconSearchRoots 里逐个搜索，搜不到就不显示图标。
 */
export type NativeContextMenuItem =
  | { type: 'separator' }
  | {
      type?: 'normal' | 'checkbox'
      id: string
      label: string
      enabled?: boolean
      checked?: boolean
      toolTip?: string
      /** Electron 的内置 role（copy/paste/…）；给了 role 就不需要自己实现 */
      role?: string
      /** 相对图标搜索根的文件名/相对路径 */
      icon?: string
      submenu?: NativeContextMenuItem[]
    }

export interface NativeContextMenuResult {
  /** 选中项的 id；用户取消为 null */
  id: string | null
}
