import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerFileIpc } from './fileIpc'
import icon from '../../resources/icon.png?asset'

const isMac = process.platform === 'darwin'

function createWindow(): void {
  // 尺寸依据 prototype/1.html 的绝对定位反推：
  // 卡片区底边 433+104=537，输入框顶边 = 视口高-141 → 视口高需 ≥678
  // 卡片 714px + 左右 48px 边距，侧边栏 299px+1px 边框 → 窗口宽需 ≥1062
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    // 1.html 的顶栏是 fixed 横跨全宽 + 侧边栏 padding-top:44px 让位，
    // 本就是在模拟无边框窗口
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 13, y: 15 } }
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: { color: '#f4f4f5', symbolColor: '#6f6f74', height: 44 }
        }),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // BrowserTab 内嵌浏览器（<webview>），页面内默认 nodeIntegration=false
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // 文件服务 IPC（file:listDir / file:readFile）
  registerFileIpc()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
