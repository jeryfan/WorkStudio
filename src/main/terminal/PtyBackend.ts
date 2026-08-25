import { createRequire } from 'node:module'

/**
 * pty 后端 —— Codex `cTe`。
 *
 * 取证要点，两条都不是风格问题：
 *
 * 1. **node-pty 是在用到的时候才 require 的**（Codex 写的是
 *    `sTe = createRequire(__filename)` 然后 `sTe('node-pty')`）。它是原生模块，
 *    `.node` 的 ABI 必须匹配当前 Electron；一旦不匹配，`require` 会抛。
 *    放在模块顶层 import 的话，这个异常发生在主进程启动路径上 —— 整个应用
 *    白屏，而真正坏掉的只是终端。延迟到 create 才加载，坏的就只有终端。
 * 2. **Windows 要传 `getConsoleProcessList`**：ConPTY 下 node-pty 靠它判断
 *    子进程还在不在，不传的话关闭终端会留下孤儿进程。本项目没有 Codex 那段
 *    PowerShell 探测脚本，这里留空 —— 见下面的注释。
 */

interface PtyProcess {
  onData(listener: (data: string) => void): void
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
  readonly pid: number
}

interface NodePtyModule {
  spawn(
    file: string,
    args: string[],
    options: {
      cols: number
      rows: number
      cwd: string
      env: Record<string, string>
      name?: string
    }
  ): PtyProcess
}

export interface PtyBackendCallbacks {
  onData(data: string): void
  onExit(event: { code: number | null; signal: string | null }): void
}

export interface PtyBackendOptions {
  command: readonly string[]
  cwd: string
  env: Record<string, string>
  cols: number
  rows: number
  callbacks: PtyBackendCallbacks
}

const requireFromHere = createRequire(__filename)

/** node-pty 不可用时的原因，用来给渲染层一条能看懂的 init-log */
export class PtyUnavailableError extends Error {
  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    super(`node-pty is unavailable: ${detail}`)
    this.name = 'PtyUnavailableError'
  }
}

function loadNodePty(): NodePtyModule {
  try {
    return requireFromHere('node-pty') as NodePtyModule
  } catch (error) {
    throw new PtyUnavailableError(error)
  }
}

/**
 * `signal` 在 node-pty 里是数字，Codex 用 `lTe` 转成名字。
 * 转换而不是直接透传：渲染层要显示的是 "SIGKILL" 而不是 "9"。
 */
const SIGNAL_NAMES: Record<number, string> = {
  1: 'SIGHUP',
  2: 'SIGINT',
  3: 'SIGQUIT',
  6: 'SIGABRT',
  9: 'SIGKILL',
  13: 'SIGPIPE',
  15: 'SIGTERM'
}

function signalName(signal: number | undefined): string | null {
  if (signal == null || signal === 0) return null
  return SIGNAL_NAMES[signal] ?? `SIG${signal}`
}

export class PtyBackend {
  static create(options: PtyBackendOptions): PtyBackend {
    const pty = loadNodePty()
    const [file, ...args] = options.command
    if (file == null) throw new Error('Terminal command is empty')
    const process_ = pty.spawn(file, args, {
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: options.env
      /*
       * Codex 在 win32 上额外传 `getConsoleProcessList`（一段 PowerShell，
       * `AttachConsole` 到 pty 的 pid 再列子进程）。本项目没有实现那段脚本：
       * 缺它的后果是 Windows 上 ConPTY 判断不了"还有子进程活着"，关闭终端时
       * 可能留下孤儿。macOS/Linux 不走这条路，不受影响。
       */
    })
    process_.onData((data) => options.callbacks.onData(data))
    process_.onExit(({ exitCode, signal }) => {
      options.callbacks.onExit({ code: exitCode, signal: signalName(signal) })
    })
    return new PtyBackend(process_)
  }

  private constructor(private readonly pty: PtyProcess) {}

  get pid(): number {
    return this.pty.pid
  }

  write(data: string): void {
    this.pty.write(data)
  }

  resize(cols: number, rows: number): void {
    this.pty.resize(cols, rows)
  }

  dispose(): void {
    try {
      this.pty.kill()
    } catch {
      // 已经退出了
    }
  }
}
