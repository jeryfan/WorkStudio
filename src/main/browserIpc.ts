import { BrowserWindow, dialog, ipcMain, session } from 'electron'
import { writeFileSync } from 'fs'
import { basename, join } from 'path'
import { homedir } from 'os'

/**
 * Browser tab 的宿主能力(Browser options 菜单用):
 * - `browser:save-data-url`:截图落盘(dataURL → 保存对话框)
 * - `browser:clear-data`:清 webview 分区(persist:browser)的缓存/cookies
 *
 * Codex 对应宿主消息:capture-screenshot / clear browsing data(cookies/cache/downloads)。
 */
export function registerBrowserIpc(): void {
  ipcMain.handle('browser:save-data-url', async (event, dataUrl: string, suggestedName: string) => {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return false
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      defaultPath: join(homedir(), 'Downloads', basename(suggestedName)),
      filters: [{ name: 'PNG', extensions: ['png'] }]
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return false
    writeFileSync(
      result.filePath,
      Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64')
    )
    return true
  })

  ipcMain.handle('browser:clear-data', async (_e, kind: 'cookies' | 'cache') => {
    const s = session.fromPartition('persist:browser')
    if (kind === 'cookies') await s.clearStorageData({ storages: ['cookies'] })
    else await s.clearCache()
    return true
  })
}
