import { app } from 'electron'
import { AgentServerHost } from './AgentServerHost'
import { ProtocolClient } from './ProtocolClient'
import { AppServerConnection } from './AppServerConnection'
import { AgentBinaryError, verifyAgentBinary } from './binaryPath'
import { resolveNodeRuntime } from './nodeRuntime'
import type { WebviewWindow } from '../host/WebviewWindow'

/**
 * agent 运行时的装配点：进程托管 → 协议客户端 → 宿主侧连接门面。
 *
 * 三者的依赖是单向的：ProtocolClient 不知道 Electron 的存在，
 * AgentServerHost 不知道协议语义，AppServerConnection 不知道进程怎么起。
 */
export class AgentRuntime {
  readonly host = new AgentServerHost()
  readonly client: ProtocolClient
  readonly connection: AppServerConnection

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
    this.connection = new AppServerConnection(this.client)
  }

  async start(): Promise<void> {
    this.connection.start()

    let version: string
    try {
      const verified = await verifyAgentBinary()
      version = verified.version
    } catch (err) {
      const isKnown = err instanceof AgentBinaryError
      this.connection.setConnectionState({
        state: 'failed',
        error: err instanceof Error ? err.message : String(err),
        hint: isKnown ? err.hint : undefined
      })
      console.error('[agent] runtime unavailable:', err)
      return
    }

    /*
     * 随包 Node 运行时的自述（Codex 的 `browser_use_runtime_paths_selected`
     * 遥测事件同义）。打出来而不是静默：nodePath 少了、或者被环境变量顶掉了，
     * 都会在插件真正要用时才炸，那时错误离根因很远。
     */
    const nodeRuntime = resolveNodeRuntime()
    console.log(
      `[agent] node runtime — node=${nodeRuntime.nodePathSource}` +
        `(${nodeRuntime.nodePath ?? 'none'})` +
        ` node_repl=${nodeRuntime.nodeReplPathSource}` +
        ` moduleDirs=${nodeRuntime.nodeModuleDirs.length}`
    )

    this.host.on('stderr', (line) => console.warn('[agent:stderr]', line))
    this.host.on('diagnostic', (msg, detail) => console.warn('[agent]', msg, detail ?? ''))

    this.host.on('fatal', (error) => {
      this.connection.setConnectionState({ state: 'failed', error: error.message })
      this.connection.reportFatalError(error.message)
    })

    // 进程重启后必须重放握手：服务端在握手前会拒绝一切业务请求
    this.host.on('ready', () => {
      this.client.resetForReconnect()
      this.client
        .initialize()
        .then((env) => {
          console.log(`[agent] ready — ${version}, dataDir=${env.codexHome}, os=${env.platformOs}`)
          this.connection.setConnectionState({ state: 'ready', version })
        })
        .catch((err: unknown) => {
          this.connection.setConnectionState({
            state: 'failed',
            error: err instanceof Error ? err.message : String(err)
          })
        })
    })

    this.host.start()
  }

  /** 新的渲染目标接进连接：先收到状态快照，再开始收事件 */
  registerWebviewWindow(target: WebviewWindow): void {
    this.connection.registerWebviewWindow(target)
  }

  async stop(): Promise<void> {
    this.connection.dispose()
    this.client.close('shutting down')
    await this.host.stop()
  }
}
