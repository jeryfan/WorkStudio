import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerFileIpc } from './fileIpc'
import { AgentRuntime } from './agent/AgentRuntime'
import { ProjectRegistry } from './workspace/ProjectRegistry'
import { registerProjectMethods } from './workspace/projectMethods'
import { registerChatMethods } from './workspace/chatMethods'
import { registerBootstrap } from './workspace/bootstrap'
import icon from '../../resources/icon.png?asset'

const isMac = process.platform === 'darwin'

/** agent 运行时：全应用一个实例，窗口关闭不影响进行中的任务 */
const agentRuntime = new AgentRuntime()

/** 项目注册表在 app ready 后创建：构造时要读 userData 路径 */
let projectRegistry: ProjectRegistry | null = null

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

  // 事件与反向请求需要有窗口可送达
  agentRuntime.attachWindow(mainWindow)

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

  // 项目注册表：文件服务与 RPC 都依赖它，且必须在窗口创建前就位
  //（preload 会同步取首屏快照）
  projectRegistry = new ProjectRegistry(app.getPath('userData'))

  // 文件服务 IPC（file:listDir / file:readFile）
  registerFileIpc(projectRegistry)

  // agent 运行时先于窗口启动：路由要在渲染层首次发消息前就位。
  // 二进制不可用时不阻塞界面，状态经 app/agent/status 暴露给渲染层。
  void agentRuntime.start()

  registerProjectMethods(agentRuntime.router, projectRegistry)
  registerChatMethods(agentRuntime.router, projectRegistry)
  registerBootstrap(ipcMain, projectRegistry)

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

// 退出前收回 agent 子进程，避免留下孤儿进程占用会话锁
app.on('before-quit', (event) => {
  // 未落盘的项目变更在这里强制写出，防抖窗口内退出不应丢失
  projectRegistry?.persistNow()
  if (!agentRuntime.host.isRunning) return
  event.preventDefault()
  void agentRuntime.stop().finally(() => app.exit(0))
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
