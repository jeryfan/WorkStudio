import type { MessagePortMain } from 'electron'
import { RpcSession, type RpcTransport } from 'capnweb'

/**
 * capnweb over Electron MessagePortMain。
 *
 * 取证：Codex 主进程用 `new RpcSession(new <自定义 transport>(port), localMain).getRemoteMain()`
 *（压缩后是 `T5(port, target)`）。为什么要自定义 transport 而不是用 capnweb 自带的
 * `newMessagePortRpcSession`：那个函数按 DOM `MessagePort` 写的（addEventListener /
 * onmessage），而主进程这一侧拿到的是 `MessagePortMain`（EventEmitter 风格 +
 * 必须显式 `start()`）。
 *
 * 协议约定（与 Codex 一致）：
 *   - 载荷是**字符串**；收到非字符串一律视为协议破坏并中断会话；
 *   - 收到 `null` 表示对端主动关闭；
 *   - abort 时先尽力 postMessage(null) 再 close，让对端知道是有序关闭而不是崩了。
 */
class MessagePortTransport implements RpcTransport {
  private resolveNext: ((message: string) => void) | null = null
  private rejectNext: ((error: Error) => void) | null = null
  private readonly backlog: string[] = []
  private failure: Error | null = null

  constructor(private readonly port: MessagePortMain) {
    port.start()
    port.on('message', (event) => {
      if (this.failure != null) return
      const data = event.data as unknown
      if (data == null) {
        this.fail(new Error('Peer closed MessagePort connection.'))
        return
      }
      if (typeof data !== 'string') {
        this.fail(new TypeError('Received non-string message from MessagePort.'))
        return
      }
      if (this.resolveNext) {
        const resolve = this.resolveNext
        this.resolveNext = null
        this.rejectNext = null
        resolve(data)
        return
      }
      this.backlog.push(data)
    })
    port.on('close', () => {
      this.fail(new Error('MessagePort closed.'))
    })
  }

  async send(message: string): Promise<void> {
    if (this.failure != null) throw this.failure
    this.port.postMessage(message)
  }

  async receive(): Promise<string> {
    const queued = this.backlog.shift()
    if (queued != null) return queued
    if (this.failure != null) throw this.failure
    return new Promise<string>((resolve, reject) => {
      this.resolveNext = resolve
      this.rejectNext = reject
    })
  }

  abort(reason: unknown): void {
    try {
      this.port.postMessage(null)
    } catch {
      /* 对端已经走了 */
    }
    try {
      this.port.close()
    } catch {
      /* 已关闭 */
    }
    this.failure ??= reason instanceof Error ? reason : new Error(String(reason))
  }

  private fail(error: Error): void {
    if (this.failure != null) return
    this.failure = error
    const reject = this.rejectNext
    this.resolveNext = null
    this.rejectNext = null
    reject?.(error)
  }
}

/**
 * 建立一个双向会话：把 `localMain` 暴露给对端，同时返回对端主对象的 stub。
 * Codex 的 `T5(port, target)` 就是这一行。
 */
export function newMessagePortMainRpcSession<T>(port: MessagePortMain, localMain: unknown): T {
  const session = new RpcSession(new MessagePortTransport(port), localMain)
  return session.getRemoteMain() as unknown as T
}
