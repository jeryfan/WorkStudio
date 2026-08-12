import type { IpcMain } from 'electron'
import { RPC_CHANNEL } from '@shared/rpc/channels'
import type { BootstrapPayload } from '@shared/workspace/types'
import type { ProjectRegistry } from './ProjectRegistry'

/**
 * 首屏同步快照。
 *
 * 侧栏若等异步 RPC 返回再渲染，第一帧必然是空列表，用户看到的是"闪一下才
 * 出内容"。preload 阶段同步取一份小快照，渲染层用它作为初始状态，首帧即有
 * 真实数据。
 *
 * 同步 IPC 会阻塞一次进程往返，因此只放首屏必需且数据量小的内容，并且只读
 * 内存态——这条路径上不做磁盘读取，也不等 agent。
 */
export function registerBootstrap(ipcMain: IpcMain, registry: ProjectRegistry): void {
  ipcMain.on(RPC_CHANNEL.bootstrap, (event) => {
    const workspace = registry.snapshot()
    console.log(
      `[workspace] bootstrap served — ${workspace.projects.length} project(s), ` +
        `selection=${workspace.selection.type}`
    )
    const payload: BootstrapPayload = { workspace }
    event.returnValue = payload
  })
}
