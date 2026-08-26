import { RpcTarget } from 'capnweb'
import type { StartupService as StartupContract } from '@shared/host/appHost'
import type { AppServerConnection } from '../../agent/AppServerConnection'

/**
 * 启动门禁 —— Codex `appServices.startup`（主进程 chunk 的 `Fwe`）。
 *
 * 契约与理由见 `@shared/host/appHost` 的 `StartupService`。这里只做一件事：
 * 把"agent 连接离开 starting"这个一次性事件变成一个 promise。
 *
 * 注意 **不能只看 `getConnectionState()` 的当前值就返回 resolved/pending**：
 * agent 重启时连接状态会回到 starting 再回到 ready，而 `whenReady()` 的语义是
 * "本次启动是否可以开始渲染"，不是"此刻连接是否健康"。所以第一次离开 starting
 * 之后就永久 resolved（`settled`），后续重启由渲染层的连接状态订阅处理。
 */
export class StartupService extends RpcTarget implements StartupContract {
  private settled = false
  private readonly ready: Promise<void>

  constructor(connection: AppServerConnection) {
    super()
    this.ready = new Promise<void>((resolve) => {
      const state = connection.getConnectionState().state
      if (state !== 'starting') {
        this.settled = true
        resolve()
        return
      }
      const dispose = connection.onConnectionStateChanged((next) => {
        if (next.state === 'starting') return
        this.settled = true
        dispose()
        resolve()
      })
    })
  }

  whenReady(): Promise<void> {
    return this.settled ? Promise.resolve() : this.ready
  }
}
