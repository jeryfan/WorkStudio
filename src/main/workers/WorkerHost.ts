import { ipcMain, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { workerChannelForView, workerChannelFromView } from '@shared/host/channels'
import {
  isWorkerRequestCancelMessage,
  isWorkerRequestMessage,
  type WorkerId,
  type WorkerInboundMessage,
  type WorkerOutboundMessage
} from '@shared/host/worker'

/**
 * worker 总线的宿主侧 —— Codex `P9`。
 *
 * 为什么要有 worker 线程：git 这类操作是**阻塞且高频**的（分支列表、
 * `status --porcelain`、切分支）。放在主进程里做，每一次都会卡住窗口的
 * 输入与合成；放在渲染层做则拿不到执行权限。Codex 因此把它们放进
 * `worker_threads`，主进程只当总线。
 *
 * 三条设计要点：
 *
 * 1. **懒启动**（Codex `startWorker()` 是显式调用的）。没人用 git 的时候不该
 *    多一个线程。第一个请求到达时才 spawn。
 * 2. **按 webContents 记账**。窗口销毁时它还在排队的请求要取消 ——
 *    不取消的话 worker 干完活往一个已经没了的 webContents 上 send，
 *    Electron 会抛。
 * 3. **请求路由表按 id**：回复要回到发起的那个渲染进程，而不是广播。
 *    事件（无 id）才广播。
 */

export interface WorkerHostOptions {
  /** 打包后 worker 产物的文件名（与 electron.vite.config 的 input 名一致） */
  entryFileName: string
}

export class WorkerHost {
  private worker: Worker | null = null
  private disposed = false
  /** 请求 id → 发起的渲染目标 */
  private readonly pendingByRequestId = new Map<string, WebContents>()
  /** 主进程自己发起的请求 */
  private readonly pendingFromHost = new Map<
    string,
    { method: string; resolve(value: unknown): void; reject(error: Error): void }
  >()
  private readonly knownWebContents = new Set<WebContents>()

  constructor(
    readonly workerId: WorkerId,
    private readonly options: WorkerHostOptions
  ) {}

  /** 注册渲染层那条频道（Codex `C10`） */
  registerIpc(isTrusted: (sender: WebContents) => boolean): () => void {
    const channel = workerChannelFromView(this.workerId)
    ipcMain.handle(channel, async (event, message: unknown) => {
      if (!isTrusted(event.sender)) return
      this.handleMessageFromView(event.sender, message)
    })
    return () => ipcMain.removeHandler(channel)
  }

  /** 主进程侧调用（Codex `requestFromHost`） */
  requestFromHost(method: string, params?: unknown): Promise<unknown> {
    const id = `main-${randomUUID()}`
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pendingFromHost.set(id, { method, resolve, reject })
    })
    try {
      this.post({
        type: 'worker-request',
        workerId: this.workerId,
        request: { id, method, params, enqueuedAtMs: Date.now() }
      })
    } catch (error) {
      this.pendingFromHost.delete(id)
      return Promise.reject(error instanceof Error ? error : new Error(String(error)))
    }
    return promise
  }

  dispose(): void {
    this.disposed = true
    const error = new Error(`Worker bus disposed for '${this.workerId}'`)
    for (const pending of this.pendingFromHost.values()) pending.reject(error)
    this.pendingFromHost.clear()
    this.pendingByRequestId.clear()
    void this.worker?.terminate()
    this.worker = null
  }

  private handleMessageFromView(sender: WebContents, message: unknown): void {
    this.trackLifecycle(sender)
    if (isWorkerRequestMessage(message)) {
      if (message.workerId !== this.workerId) return
      this.pendingByRequestId.set(message.request.id, sender)
      this.post(message)
      return
    }
    if (isWorkerRequestCancelMessage(message)) {
      if (message.workerId !== this.workerId) return
      this.pendingByRequestId.delete(message.id)
      this.post(message)
    }
  }

  /** 窗口销毁：取消它还在排队的请求（Codex `cleanupOrigin`） */
  private trackLifecycle(sender: WebContents): void {
    if (this.knownWebContents.has(sender)) return
    this.knownWebContents.add(sender)
    sender.once('destroyed', () => {
      this.knownWebContents.delete(sender)
      for (const [id, target] of Array.from(this.pendingByRequestId)) {
        if (target !== sender) continue
        this.pendingByRequestId.delete(id)
        this.post({ type: 'worker-request-cancel', workerId: this.workerId, id })
      }
    })
  }

  private post(message: WorkerInboundMessage): void {
    if (this.disposed) throw new Error(`Worker '${this.workerId}' is disposed`)
    this.ensureWorker().postMessage(message)
  }

  private ensureWorker(): Worker {
    if (this.worker != null) return this.worker
    const entry = this.resolveEntry()
    const worker = new Worker(entry)
    worker.on('message', (message: WorkerOutboundMessage) => this.handleWorkerMessage(message))
    worker.on('error', (error) => {
      /*
       * worker 挂了：所有在飞的请求都要有个结果。留着不管的话调用方（分支下拉）
       * 永远转圈，而真正的原因只在主进程日志里。
       */
      console.error(`[worker:${this.workerId}] crashed`, error)
      this.failAllPending(error instanceof Error ? error : new Error(String(error)))
      this.worker = null
    })
    worker.on('exit', (code) => {
      if (code !== 0) this.failAllPending(new Error(`Worker exited with code ${code}`))
      this.worker = null
    })
    // 让 worker 不要阻止进程退出
    worker.unref()
    this.worker = worker
    return worker
  }

  private resolveEntry(): string {
    /*
     * worker 的入口是**同一次 electron-vite 构建**产出的另一个 chunk，
     * 与 `index.js` 同目录。不能用源码路径：打包后没有 ts。
     */
    const candidate = join(__dirname, this.options.entryFileName)
    if (!existsSync(candidate)) {
      throw new Error(`Worker entry not found: ${candidate}`)
    }
    return candidate
  }

  private handleWorkerMessage(message: WorkerOutboundMessage): void {
    if (message.workerId !== this.workerId) return
    if (message.type === 'worker-response') {
      const { response } = message
      const fromHost = this.pendingFromHost.get(response.id)
      if (fromHost != null) {
        this.pendingFromHost.delete(response.id)
        // Codex 的这道比对能挡住"回错了别的请求的结果"
        if (fromHost.method !== response.method) {
          fromHost.reject(new Error('Mismatched worker response method'))
          return
        }
        if (response.result.type === 'ok') fromHost.resolve(response.result.value)
        else fromHost.reject(new Error(response.result.error.message))
        return
      }
      const target = this.pendingByRequestId.get(response.id)
      if (target == null) return
      this.pendingByRequestId.delete(response.id)
      this.send(target, message)
      return
    }
    // 事件：广播给所有还活着的渲染目标
    for (const target of this.knownWebContents) this.send(target, message)
  }

  private send(target: WebContents, message: WorkerOutboundMessage): void {
    if (target.isDestroyed()) return
    target.send(workerChannelForView(this.workerId), message)
  }

  private failAllPending(error: Error): void {
    for (const pending of this.pendingFromHost.values()) pending.reject(error)
    this.pendingFromHost.clear()
    for (const [id, target] of Array.from(this.pendingByRequestId)) {
      this.pendingByRequestId.delete(id)
      this.send(target, {
        type: 'worker-response',
        workerId: this.workerId,
        response: { id, method: '', result: { type: 'error', error: { message: error.message } } }
      })
    }
  }
}
