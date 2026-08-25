import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { delimiter } from 'node:path'
import { LineDecoder, decodeLine, encodeLine } from '@shared/rpc/jsonl'
import type { RpcMessage } from '@shared/rpc/messages'
import type { RpcTransport } from '@shared/rpc/peer'
import { resolveAgentRuntime } from './binaryPath'

/**
 * agent 进程以 app-server 子命令运行，stdio 上跑 JSONL 报文。
 *
 * 取证：Codex 的本地 app-server 由 `YB`（StdioConnection）spawn，参数由 `sV()`
 * 拼出，环境由 `QB()` 拼出。两处都逐项照搬，理由见下。
 */

/**
 * Codex `NB`：code_mode_host 依赖同目录的宿主可执行文件，显式开启才能拿到与
 * 上游桌面端一致的工具集。
 */
const CODE_MODE_HOST_ARGS = ['-c', 'features.code_mode_host=true'] as const

/**
 * Codex `PB`：两个 base url 覆盖，走环境变量进来、以 `-c` 落到 config。
 * 值用 `JSON.stringify` 包一层是必须的 —— `-c` 的值按 TOML 解析，裸字符串里
 * 的 `:`、`/` 会让解析失败后退化成字面量，行为不确定。
 */
const BASE_URL_OVERRIDES = [
  { configKey: 'chatgpt_base_url', envVar: 'CODEX_APP_SERVER_CHATGPT_BASE_URL' },
  { configKey: 'openai_base_url', envVar: 'CODEX_APP_SERVER_OPENAI_BASE_URL' }
] as const

/**
 * Codex `MB`：originator 覆盖值。服务端把它当客户端标识上报，
 * 不设的话 app-server 用它自己的默认值。
 */
const ORIGINATOR = 'WorkStudio'

/**
 * Codex `sV()`。两处刻意的差异：
 *
 * 1. **不传 `--listen stdio://`** —— `--help` 里 `stdio://` 就是 `--listen` 的
 *    默认值，Codex 本地连接也不传。传了不错，但多一个参数就多一处将来会和
 *    上游漂移的地方。
 * 2. **不传 `--analytics-default-enabled`** —— Codex 传了这个，作用是把
 *    analytics 的默认值翻成"开"（app-server 自身默认是关的）。那是第一方对
 *    自己产品的选择；本项目照搬等于替用户把遥测打开、且数据发往 OpenAI。
 *    需要时加回来即可，这是唯一一处主动偏离。
 */
function buildAgentArgs(env: NodeJS.ProcessEnv): string[] {
  const overrides = BASE_URL_OVERRIDES.flatMap(({ configKey, envVar }) => {
    const value = env[envVar]?.trim()
    return value == null || value === '' ? [] : ['-c', `${configKey}=${JSON.stringify(value)}`]
  })
  return [...CODE_MODE_HOST_ARGS, ...overrides, 'app-server']
}

/**
 * 读当前 env 里的 PATH 键名（Codex `HI`/`II`）。
 *
 * Windows 的环境变量名大小写不敏感，但 `{...process.env}` 之后对象上可能
 * 同时存在 `Path` 与 `PATH`：只改一个，子进程拿到的是另一个。
 */
function pathKey(env: NodeJS.ProcessEnv): string {
  if (process.platform !== 'win32') return 'PATH'
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
}

/** 写 PATH，并清掉同名异写的重复键（Codex `LI`） */
function setPath(env: NodeJS.ProcessEnv, value: string): void {
  const key = pathKey(env)
  if (process.platform === 'win32') {
    for (const other of Object.keys(env)) {
      if (other !== key && other.toLowerCase() === 'path') delete env[other]
    }
  }
  env[key] = value
}

/** 追加一个目录到 PATH 末尾，已存在则原样返回（Codex `cV`） */
function appendToPath(current: string | undefined, entry: string): string {
  const value = current ?? ''
  if (value.split(delimiter).includes(entry)) return value
  return value.length > 0 ? `${value}${delimiter}${entry}` : entry
}

/**
 * Codex `QB()` 的环境部分。
 *
 * agent 目录是**追加**而不是前置（Codex 用 `cV` 追加 rg 目录与 codex bin
 * 目录）：用户机器上自己的 rg/git 优先，我们只兜底。前置会静默改变用户
 * 环境里同名工具的解析结果。
 */
function buildAgentEnv(agentDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LOG_FORMAT: 'json',
    RUST_LOG: process.env.RUST_LOG ?? 'warn',
    CODEX_INTERNAL_ORIGINATOR_OVERRIDE: ORIGINATOR
  }
  setPath(env, appendToPath(env[pathKey(env)], agentDir))
  return env
}

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

    const { binary, dir: agentDir } = resolveAgentRuntime()

    // 附属可执行文件（rg 等）与主程序同目录，需要在子进程 PATH 里可见
    const env = buildAgentEnv(agentDir)

    const child = spawn(binary, buildAgentArgs(env), {
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
