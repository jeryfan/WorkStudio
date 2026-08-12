import { app, ipcMain, type BrowserWindow } from 'electron'
import { AgentServerHost } from './AgentServerHost'
import { ProtocolClient } from './ProtocolClient'
import { RpcRouter } from './RpcRouter'
import { AgentBinaryError, verifyAgentBinary } from './binaryPath'
import { LOCAL } from '@shared/protocol/local'

/**
 * agent 运行时的装配点：进程托管 → 协议客户端 → 渲染层路由。
 *
 * 三者的依赖是单向的，ProtocolClient 不知道 Electron 的存在，
 * AgentServerHost 不知道协议语义。
 */
export class AgentRuntime {
  readonly host = new AgentServerHost()
  readonly client: ProtocolClient
  readonly router: RpcRouter

  constructor() {
    this.client = new ProtocolClient(
      this.host,
      {
        clientName: 'workstudio',
        clientTitle: 'WorkStudio',
        clientVersion: app.getVersion()
      },
      { onDiagnostic: (msg, detail) => console.warn('[agent]', msg, detail ?? '') }
    )
    this.router = new RpcRouter(this.client, ipcMain)

    this.router.registerLocal(LOCAL.agentStatus, () => this.router.getAgentStatus())
    this.router.registerLocal(LOCAL.agentEnvironment, () => this.client.env)
  }

  async start(): Promise<void> {
    this.router.start()

    let version: string
    try {
      const verified = await verifyAgentBinary()
      version = verified.version
    } catch (err) {
      const isKnown = err instanceof AgentBinaryError
      this.router.setAgentStatus({
        state: 'failed',
        error: err instanceof Error ? err.message : String(err),
        hint: isKnown ? err.hint : undefined
      })
      console.error('[agent] runtime unavailable:', err)
      return
    }

    this.host.on('stderr', (line) => console.warn('[agent:stderr]', line))
    this.host.on('diagnostic', (msg, detail) => console.warn('[agent]', msg, detail ?? ''))

    this.host.on('fatal', (error) => {
      this.router.setAgentStatus({ state: 'failed', error: error.message })
    })

    // 进程重启后必须重放握手：服务端在握手前会拒绝一切业务请求
    this.host.on('ready', () => {
      this.client.resetForReconnect()
      this.client
        .initialize()
        .then((env) => {
          console.log(`[agent] ready — ${version}, dataDir=${env.codexHome}, os=${env.platformOs}`)
          this.router.setAgentStatus({ state: 'ready', version })
        })
        .catch((err: unknown) => {
          this.router.setAgentStatus({
            state: 'failed',
            error: err instanceof Error ? err.message : String(err)
          })
        })
    })

    this.host.start()
  }

  attachWindow(win: BrowserWindow): void {
    this.router.attachWindow(win)
  }

  async stop(): Promise<void> {
    this.router.dispose()
    this.client.close('shutting down')
    await this.host.stop()
  }
}
