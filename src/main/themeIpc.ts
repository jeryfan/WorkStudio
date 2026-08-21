import { ipcMain, nativeTheme, BrowserWindow } from 'electron'

/**
 * 系统外观 IPC —— 对齐 Codex 的做法。
 *
 * Codex 没有应用内主题选择器:它只订阅宿主上报的系统外观(bridge 上的
 * getSystemThemeVariant / subscribeToSystemThemeVariant),渲染层据此在 <html>
 * 上切 electron-light / electron-dark。这里复刻同一条通路,方法名保持一致,
 * 渲染层的代码就能和 Codex 逐行对照。
 *
 * 为什么是推送而不是让渲染层轮询:macOS 的外观可以随日出日落自动切换,
 * 也可以被用户在系统设置里改。nativeTheme 的 'updated' 是唯一可靠的信号源。
 */

export type SystemThemeVariant = 'light' | 'dark'

const CHANNEL = {
  get: 'theme:getSystemVariant',
  changed: 'theme:systemVariantChanged'
} as const

function currentVariant(): SystemThemeVariant {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

export function registerThemeIpc(): void {
  ipcMain.handle(CHANNEL.get, () => currentVariant())

  nativeTheme.on('updated', () => {
    const variant = currentVariant()
    // 广播给所有窗口:多窗口下每个都要跟着切,漏一个就会出现半明半暗
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(CHANNEL.changed, variant)
    }
  })
}

export { CHANNEL as THEME_CHANNEL }
