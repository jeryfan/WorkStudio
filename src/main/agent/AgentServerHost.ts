import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { dirname, delimiter } from 'node:path'
import { LineDecoder, decodeLine, encodeLine } from '@shared/rpc/jsonl'
import type { RpcMessage } from '@shared/rpc/messages'
import type { RpcTransport } from '@shared/rpc/peer'
import { resolveAgentBinary } from './binaryPath'

/**
 * agent 进程以 app-server 子命令运行，stdio 上跑 JSONL 报文。
 *
 * code_mode_host 特性依赖同目录的宿主可执行文件；这里显式开启以获得与
 * 上游桌面端一致的工具集。
 */
const AGENT_ARGS = [
  '-c',
  'features.code_mode_host=true',
  'app-server',
  '--listen',
  'stdio://'
] as const

/** 崩溃重启退避：避免二进制本身有问题时疯狂重拉 */
const RESTART_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000]
/** 稳定运行超过该时长即认为上次重启成功，重置退避 */
const STABLE_RUN_MS = 30_000

export interface AgentServerHostEvents {
  /** 进程就绪，可以开始握手。重启后会再次触发，调用方需重放握手 */
  ready: []
  exit: [code: number | null, signal: NodeJS.Signals | null]
  /** 已放弃重启 */
  fatal: [error: Error]
  stderr: [line: string]
  diagnostic: [message: string, detail?: unknown]
}

/**
 * 托管 agent 子进程的生命周期，并把 stdio 适配成 RpcTransport。
 *
 * 进程重启后 transport 实例保持不变——上层 RpcPeer 不需要重建，
 * 只需要在 `ready` 事件里重放握手。
 */
export class AgentServerHost extends EventEmitter<AgentServerHostEvents> implements RpcTransport {
  private child: ChildProcessWithoutNullStreams | null = null
  private readonly decoder = new LineDecoder({
    onOverflow: (bytes) => this.emit('diagnostic', `Dropped oversized line (${bytes} bytes)`)
  })
  private messageHandler: ((message: RpcMessage) => void) | null = null
  private closeHandler: ((reason?: string) => void) | null = null
  private restartAttempt = 0
  private startedAt = 0
  private restartTimer: NodeJS.Timeout | null = null
  private stopping = false

  start(): void {
    if (this.child) return
    this.stopping = false

    const binary = resolveAgentBinary()
    const agentDir = dirname(binary)

    // 附属可执行文件（rg 等）与主程序同目录，需要在子进程 PATH 里可见
    const env = {
      ...process.env,
      PATH: `${agentDir}${delimiter}${process.env.PATH ?? ''}`
    }

    const child = spawn(binary, [...AGENT_ARGS], {
      env,
      cwd: agentDir,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child = child
    this.startedAt = Date.now()

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      for (const line of this.decoder.push(chunk)) {
        const msg = decodeLine(line)
        if (msg) this.messageHandler?.(msg)
        else this.emit('diagnostic', 'Failed to parse message', line.slice(0, 500))
      }
    })

    // stderr 是纯诊断输出，不参与协议；不消费会在管道写满后阻塞子进程
    child.stderr.setEncoding('utf8')
    const errDecoder = new LineDecoder()
    child.stderr.on('data', (chunk: string) => {
      for (const line of errDecoder.push(chunk)) this.emit('stderr', line)
    })

    child.on('error', (err) => {
      this.emit('diagnostic', 'Agent process error', err.message)
    })

    child.once('exit', (code, signal) => {
      this.child = null
      this.decoder.reset()
      this.closeHandler?.(`agent exited (code=${code}, signal=${signal})`)
      this.emit('exit', code, signal)
      if (!this.stopping) this.scheduleRestart()
    })

    this.emit('ready')
  }

  private scheduleRestart(): void {
    // 上次运行足够久，说明不是启动即崩，退避从头开始
    if (Date.now() - this.startedAt > STABLE_RUN_MS) this.restartAttempt = 0

    if (this.restartAttempt >= RESTART_DELAYS_MS.length) {
      this.emit(
        'fatal',
        new Error(`Agent process kept exiting after ${RESTART_DELAYS_MS.length} restart attempts`)
      )
      return
    }

    const delay = RESTART_DELAYS_MS[this.restartAttempt++]
    this.emit('diagnostic', `Restarting agent in ${delay}ms (attempt ${this.restartAttempt})`)
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (!this.stopping) this.start()
    }, delay)
  }

  async stop(): Promise<void> {
    this.stopping = true
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    const child = this.child
    if (!child) return

    await new Promise<void>((resolve) => {
      const forceKill = setTimeout(() => child.kill('SIGKILL'), 3_000)
      child.once('exit', () => {
        clearTimeout(forceKill)
        resolve()
      })
      child.kill('SIGTERM')
    })
  }

  get isRunning(): boolean {
    return this.child !== null
  }

  // ── RpcTransport ──────────────────────────────────────────────
  send(message: RpcMessage): void {
    const child = this.child
    if (!child?.stdin.writable) {
      throw new Error('Agent process is not running')
    }
    child.stdin.write(encodeLine(message))
  }

  onMessage(handler: (message: RpcMessage) => void): void {
    this.messageHandler = handler
  }

  onClose(handler: (reason?: string) => void): void {
    this.closeHandler = handler
  }
}
