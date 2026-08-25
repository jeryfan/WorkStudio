import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { AgentRuntime } from './agent/AgentRuntime'
import { ProjectRegistry } from './workspace/ProjectRegistry'
import { WindowContext } from './host/WindowContext'

/**
 * 开发期打开 CDP 端口。
 *
 * 样式对齐要能拿计算样式和上游逐项比数值，肉眼看截图不够准。开关必须在
 * app ready 之前设置，否则不生效。仅 dev —— 打包产物不会带这个端口。
 */
if (is.dev) {
  // 9222 常被 Chrome/Edge 占用，换一个不冲突的
  app.commandLine.appendSwitch('remote-debugging-port', '9333')
}

/** agent 运行时：全应用一个实例，窗口关闭不影响进行中的任务 */
const agentRuntime = new AgentRuntime()

/** 项目注册表与宿主上下文都要 userData 路径，只能在 ready 之后建 */
let projectRegistry: ProjectRegistry | null = null
let windowContext: WindowContext | null = null

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  projectRegistry = new ProjectRegistry(app.getPath('userData'))

  /*
   * 装配顺序是有约束的：
   *   1. WindowContext 里的服务与菜单必须在第一个窗口创建前就位
   *      （preload 会同步取首屏快照，窗口一建就会来问）；
   *   2. agent 运行时也要先起，路由要在渲染层首次发消息前存在；
   *      二进制不可用时不阻塞界面，状态经连接状态消息暴露给渲染层。
   */
  windowContext = new WindowContext(projectRegistry, agentRuntime)
  windowContext.registerIpc()

  void agentRuntime.start()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  windowContext.windowManager.createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windowContext?.windowManager.createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 退出前收回 agent 子进程，避免留下孤儿进程占用会话锁
app.on('before-quit', (event) => {
  // 未落盘的项目变更在这里强制写出，防抖窗口内退出不应丢失
  projectRegistry?.persistNow()
  if (!agentRuntime.host.isRunning) return
  event.preventDefault()
  void Promise.all([windowContext?.dispose(), agentRuntime.stop()]).finally(() => app.exit(0))
})
