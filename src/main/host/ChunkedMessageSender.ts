import type { WebContents } from 'electron'
import { chunkMessages, type ChunkedMessage } from '@shared/host/chunked'

/**
 * 分块消息发送器。
 *
 * 取证：Codex 的 `chunkedMessageSender`（`send` / `sendCritical`），配
 * `codex_desktop:chunked-message-ack` 背压通道，以及 webContents 的
 * loading/loaded 钩子（页面重载后要把在途 transfer 重排队 —— 渲染层的
 * 重组器随页面一起没了）。
 *
 * 关键决策：**一次只有一个 part 在途**，收到 ACK 才发下一个。
 * 为什么不开滑动窗口：ACK 的意义是"渲染进程已经把这一片喂给重组器了"，
 * 一次只放一片才能真的把重建成本摊到渲染进程的多个时间片上；
 * 放宽窗口就退化成"分了块但还是一次性灌进去"，白做。
 * 单片里的 token 数因此取得比较大（8192），一条 10MB 的 payload 约 50 个往返。
 */
const TOKENS_PER_CHUNK = 8192
/** 超过这个估算体积才分块；小消息直接 send，省掉两次遍历 */
const CHUNK_THRESHOLD_BYTES = 256 * 1024

interface QueuedMessage {
  channel: string
  message: unknown
  critical: boolean
}

interface ActiveTransfer {
  transferId: string
  channel: string
  critical: boolean
  iterator: Iterator<ChunkedMessage>
  /** 已发出但未被 ACK 的那一片 */
  inFlight: ChunkedMessage | null
  source: QueuedMessage
}

interface TargetState {
  webContents: WebContents
  queue: QueuedMessage[]
  criticalQueue: QueuedMessage[]
  transfer: ActiveTransfer | null
  loading: boolean
}

export class ChunkedMessageSender {
  private readonly targets = new Map<number, TargetState>()
  private transferSeq = 0

  constructor(
    private readonly options: {
      onDiagnostic?: (message: string, detail?: unknown) => void
    } = {}
  ) {}

  send(webContents: WebContents, channel: string, message: unknown): void {
    this.enqueue(webContents, { channel, message, critical: false })
  }

  /**
   * 关键消息：绕过普通队列。
   * Codex 用它发 `thread/start`、`turn/start` 这类响应 —— 这些等在用户操作的
   * 关键路径上，不能排在一条几 MB 的历史读取后面。
   */
  sendCritical(webContents: WebContents, channel: string, message: unknown): void {
    this.enqueue(webContents, { channel, message, critical: true })
  }

  /** 渲染层的 ACK：推进当前 transfer */
  acknowledge(webContents: WebContents, transferId: string, sequence: number): void {
    const state = this.targets.get(webContents.id)
    const transfer = state?.transfer
    if (!state || !transfer || transfer.transferId !== transferId) return
    if (transfer.inFlight != null && transfer.inFlight.sequence !== sequence) return
    transfer.inFlight = null
    this.pump(state)
  }

  dispose(webContents: WebContents): void {
    this.targets.delete(webContents.id)
  }

  private stateFor(webContents: WebContents): TargetState {
    const existing = this.targets.get(webContents.id)
    if (existing) return existing
    const state: TargetState = {
      webContents,
      queue: [],
      criticalQueue: [],
      transfer: null,
      loading: false
    }
    this.targets.set(webContents.id, state)

    // 页面重载：在途 transfer 的对端重组器已经不存在，整条重排队重发
    webContents.on('did-start-loading', () => {
      state.loading = true
      const transfer = state.transfer
      if (transfer != null) {
        state.transfer = null
        if (transfer.critical) state.criticalQueue.unshift(transfer.source)
        else state.queue.unshift(transfer.source)
      }
    })
    webContents.on('did-stop-loading', () => {
      state.loading = false
      this.pump(state)
    })
    webContents.once('destroyed', () => {
      this.targets.delete(webContents.id)
    })
    return state
  }

  private enqueue(webContents: WebContents, item: QueuedMessage): void {
    if (webContents.isDestroyed()) return
    const state = this.stateFor(webContents)
    if (item.critical) state.criticalQueue.push(item)
    else state.queue.push(item)
    this.pump(state)
  }

  private pump(state: TargetState): void {
    if (state.loading || state.webContents.isDestroyed()) return

    // critical 优先，且不必等普通 transfer 结束（它们是独立的小消息）
    while (state.criticalQueue.length > 0 && state.transfer?.critical !== true) {
      const item = state.criticalQueue.shift() as QueuedMessage
      if (!this.deliverOrStartTransfer(state, item)) return
    }

    if (state.transfer != null) {
      this.advanceTransfer(state)
      return
    }

    while (state.queue.length > 0) {
      const item = state.queue.shift() as QueuedMessage
      if (!this.deliverOrStartTransfer(state, item)) return
    }
  }

  /** 返回 false 表示开启了 transfer，调用方要让出（后续由 ACK 驱动） */
  private deliverOrStartTransfer(state: TargetState, item: QueuedMessage): boolean {
    if (!exceedsSizeThreshold(item.message, CHUNK_THRESHOLD_BYTES)) {
      this.rawSend(state, item.channel, item.message)
      return true
    }
    const transferId = `t${++this.transferSeq}`
    state.transfer = {
      transferId,
      channel: item.channel,
      critical: item.critical,
      iterator: chunkMessages(transferId, item.message, { tokensPerChunk: TOKENS_PER_CHUNK }),
      inFlight: null,
      source: item
    }
    this.advanceTransfer(state)
    return false
  }

  private advanceTransfer(state: TargetState): void {
    const transfer = state.transfer
    if (!transfer || transfer.inFlight != null) return
    const next = transfer.iterator.next()
    if (next.done === true) {
      state.transfer = null
      this.pump(state)
      return
    }
    const part = next.value
    // end 片不需要 ACK：它之后没有东西要等
    if (part.kind !== 'end') transfer.inFlight = part
    this.rawSend(state, transfer.channel, part)
    if (part.kind === 'end') {
      state.transfer = null
      this.pump(state)
    }
  }

  private rawSend(state: TargetState, channel: string, message: unknown): void {
    if (state.webContents.isDestroyed()) return
    try {
      state.webContents.send(channel, message)
    } catch (error) {
      this.options.onDiagnostic?.('Failed to send host message', error)
    }
  }
}

/**
 * 有界体积估算：走到超过 limit 就立刻返回，不为了得到精确值把整个对象逛完。
 *
 * 直接 `JSON.stringify(...).length` 也能得到答案，但那等于为每条小消息
 * 多做一次完整序列化 —— 而小消息是绝大多数。
 */
export function exceedsSizeThreshold(value: unknown, limit: number): boolean {
  let budget = limit
  const stack: unknown[] = [value]
  while (stack.length > 0) {
    const node = stack.pop()
    if (node == null) {
      budget -= 4
    } else if (typeof node === 'string') {
      budget -= node.length + 2
    } else if (typeof node === 'number' || typeof node === 'boolean') {
      budget -= 8
    } else if (Array.isArray(node)) {
      budget -= 2 + node.length
      for (const item of node) stack.push(item)
    } else if (typeof node === 'object') {
      const entries = Object.entries(node as Record<string, unknown>)
      budget -= 2 + entries.length
      for (const [key, item] of entries) {
        budget -= key.length + 3
        stack.push(item)
      }
    }
    if (budget < 0) return true
  }
  return false
}
