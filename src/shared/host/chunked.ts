/**
 * 分块流式消息协议 `codex-host-chunked-message-v1`。
 *
 * 取证：Codex `preload.js` 里带着完整校验器（marker/transferId/sequence/kind/tokens），
 * 主进程侧由 ChunkedMessageSender 产生，渲染层增量重建对象。
 *
 * 为什么不直接 send 一个大对象：Electron 的 IPC 走 structured clone，一条
 * `thread/read` 结果（几万行历史 + 大段命令输出）会造成一次性反序列化卡顿，
 * 主/渲染进程同时掉帧。Codex 的做法是把 JSON 在发送侧**词法化成 token 流**，
 * 分块推送，接收侧增量重建；配一条 ACK 通道让发送侧知道消费到哪了，
 * 避免渲染进程还没消费完就被灌爆。
 *
 * 注意 token 不是"JSON 片段字符串"——切在字符串中间也不会产生非法 JSON，
 * 这是它比"按字节切 JSON 文本"更强的地方。
 */
export const CHUNKED_MARKER = 'codex-host-chunked-message-v1'

export type JsonToken =
  | { type: 'array-start' }
  | { type: 'object-start' }
  | { type: 'container-end' }
  | { type: 'string-start'; target: 'key' | 'value' }
  | { type: 'string-chunk'; value: string }
  | { type: 'string-end' }
  | { type: 'key'; value: string }
  | { type: 'value'; value: string | number | boolean | null }

export interface ChunkedMessage {
  marker: typeof CHUNKED_MARKER
  transferId: string
  sequence: number
  kind: 'start' | 'chunk' | 'end'
  tokens?: JsonToken[]
}

/** 单条 chunk 里最多带多少 token（Codex 未暴露该常量，取一个不引起明显停顿的值） */
export const DEFAULT_TOKENS_PER_CHUNK = 512
/** 超过该长度的字符串拆成多个 string-chunk */
export const DEFAULT_STRING_CHUNK_SIZE = 16 * 1024

export function isJsonToken(value: unknown): value is JsonToken {
  if (typeof value !== 'object' || !value || !('type' in value)) return false
  const token = value as { type: string; target?: unknown; value?: unknown }
  switch (token.type) {
    case 'array-start':
    case 'object-start':
    case 'container-end':
    case 'string-end':
      return true
    case 'string-start':
      return token.target === 'key' || token.target === 'value'
    case 'key':
    case 'string-chunk':
      return typeof token.value === 'string'
    case 'value':
      return (
        token.value == null ||
        typeof token.value === 'boolean' ||
        typeof token.value === 'number' ||
        typeof token.value === 'string'
      )
    default:
      return false
  }
}

/** 与 Codex preload.js 的校验器同构（顺序、字段、safe integer 判定都一致） */
export function isChunkedMessage(value: unknown): value is ChunkedMessage {
  if (typeof value !== 'object' || !value) return false
  const msg = value as Partial<ChunkedMessage>
  if (msg.marker !== CHUNKED_MARKER) return false
  if (typeof msg.transferId !== 'string') return false
  if (typeof msg.sequence !== 'number' || !Number.isSafeInteger(msg.sequence)) return false
  if (msg.kind === 'chunk') return Array.isArray(msg.tokens) && msg.tokens.every(isJsonToken)
  return msg.kind === 'start' || msg.kind === 'end'
}

/**
 * 值 → token 流。
 *
 * 用显式任务栈而不是 `yield*` 递归：`yield*` 委托会为每一层结构留一个生成器
 * 帧，几千层嵌套就爆栈——而"深层嵌套"恰恰是这个协议要解决的大 payload 场景
 * 里最常见的形状（嵌套的 diff / item 树）。
 *
 * undefined 的对象属性直接跳过、数组里的 undefined 变成 null、NaN/Infinity
 * 变成 null：全部与 `JSON.stringify` 一致，否则重建出来的结构会和"直接 send
 * 这个对象"不同，两条路径就不再等价了。
 */
export function* tokenizeValue(
  value: unknown,
  options: { stringChunkSize?: number } = {}
): Generator<JsonToken> {
  const stringChunkSize = options.stringChunkSize ?? DEFAULT_STRING_CHUNK_SIZE

  /** 字符串是叶子，这里的委托深度恒为 1，不参与栈深度 */
  function* emitString(text: string, target: 'key' | 'value'): Generator<JsonToken> {
    if (text.length <= stringChunkSize) {
      yield target === 'key' ? { type: 'key', value: text } : { type: 'value', value: text }
      return
    }
    yield { type: 'string-start', target }
    for (let i = 0; i < text.length; i += stringChunkSize) {
      yield { type: 'string-chunk', value: text.slice(i, i + stringChunkSize) }
    }
    yield { type: 'string-end' }
  }

  type Task =
    { kind: 'value'; node: unknown } | { kind: 'key'; key: string } | { kind: 'container-end' }

  const stack: Task[] = [{ kind: 'value', node: value }]

  while (stack.length > 0) {
    const task = stack.pop() as Task
    if (task.kind === 'container-end') {
      yield { type: 'container-end' }
      continue
    }
    if (task.kind === 'key') {
      yield* emitString(task.key, 'key')
      continue
    }

    let node = task.node
    // Date 之类有 toJSON 的先归一化（对齐 JSON.stringify）
    if (node != null && typeof node === 'object') {
      const maybe = node as { toJSON?: () => unknown }
      if (typeof maybe.toJSON === 'function') node = maybe.toJSON()
    }

    if (node === undefined || node === null) {
      yield { type: 'value', value: null }
      continue
    }
    switch (typeof node) {
      case 'string':
        yield* emitString(node, 'value')
        continue
      case 'number':
        yield { type: 'value', value: Number.isFinite(node) ? node : null }
        continue
      case 'boolean':
        yield { type: 'value', value: node }
        continue
      case 'bigint':
        yield { type: 'value', value: node.toString() }
        continue
      case 'function':
      case 'symbol':
        yield { type: 'value', value: null }
        continue
      default:
        break
    }

    if (Array.isArray(node)) {
      yield { type: 'array-start' }
      stack.push({ kind: 'container-end' })
      for (let i = node.length - 1; i >= 0; i--) stack.push({ kind: 'value', node: node[i] })
      continue
    }

    yield { type: 'object-start' }
    stack.push({ kind: 'container-end' })
    const entries = Object.entries(node as Record<string, unknown>)
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]
      if (entry == null || entry[1] === undefined) continue
      // 先压 value 后压 key —— 出栈顺序才是 key → value
      stack.push({ kind: 'value', node: entry[1] })
      stack.push({ kind: 'key', key: entry[0] })
    }
  }
}

/**
 * token 流 → 值。每收到一批 token 就增量构建，不需要等全部到齐。
 *
 * `complete` 为 true 后再 push 会抛错：那说明发送侧的 sequence 乱了，
 * 静默吞掉只会得到一个半截对象，排查起来毫无线索。
 */
export class JsonTokenAssembler {
  private root: { value: unknown } | null = null
  private readonly stack: Array<{ container: unknown[] | Record<string, unknown>; key?: string }> =
    []
  private pendingKey: string | null = null
  private stringParts: string[] | null = null
  private stringTarget: 'key' | 'value' = 'value'
  private done = false

  get complete(): boolean {
    return this.done
  }

  push(tokens: readonly JsonToken[]): void {
    for (const token of tokens) this.pushToken(token)
  }

  result(): unknown {
    if (!this.done) throw new Error('Chunked transfer is incomplete')
    return this.root?.value
  }

  private pushToken(token: JsonToken): void {
    if (this.done) throw new Error('Chunked transfer already completed')
    switch (token.type) {
      case 'string-start':
        this.stringParts = []
        this.stringTarget = token.target
        return
      case 'string-chunk':
        if (this.stringParts == null) throw new Error('string-chunk outside of a string')
        this.stringParts.push(token.value)
        return
      case 'string-end': {
        if (this.stringParts == null) throw new Error('string-end outside of a string')
        const text = this.stringParts.join('')
        this.stringParts = null
        if (this.stringTarget === 'key') this.pendingKey = text
        else this.addValue(text)
        return
      }
      case 'key':
        this.pendingKey = token.value
        return
      case 'value':
        this.addValue(token.value)
        return
      case 'array-start':
        this.openContainer([])
        return
      case 'object-start':
        this.openContainer({})
        return
      case 'container-end': {
        const frame = this.stack.pop()
        if (!frame) throw new Error('container-end without an open container')
        if (this.stack.length === 0 && this.root == null) {
          this.root = { value: frame.container }
          this.done = true
        }
        return
      }
    }
  }

  private openContainer(container: unknown[] | Record<string, unknown>): void {
    // 根容器要先挂上才能在 container-end 时找回来
    if (this.stack.length === 0 && this.root == null) {
      this.stack.push({ container })
      return
    }
    this.attach(container)
    this.stack.push({ container })
  }

  private addValue(value: unknown): void {
    if (this.stack.length === 0) {
      this.root = { value }
      this.done = true
      return
    }
    this.attach(value)
  }

  private attach(value: unknown): void {
    const frame = this.stack[this.stack.length - 1]
    if (!frame) throw new Error('No open container to attach value to')
    if (Array.isArray(frame.container)) {
      frame.container.push(value)
      return
    }
    if (this.pendingKey == null) throw new Error('Object value without a preceding key')
    ;(frame.container as Record<string, unknown>)[this.pendingKey] = value
    this.pendingKey = null
  }
}

/** 把 token 流切成 chunk 报文序列（start → chunk* → end） */
export function* chunkMessages(
  transferId: string,
  value: unknown,
  options: { tokensPerChunk?: number; stringChunkSize?: number } = {}
): Generator<ChunkedMessage> {
  const tokensPerChunk = options.tokensPerChunk ?? DEFAULT_TOKENS_PER_CHUNK
  let sequence = 0
  yield { marker: CHUNKED_MARKER, transferId, sequence: sequence++, kind: 'start' }
  let batch: JsonToken[] = []
  for (const token of tokenizeValue(value, options)) {
    batch.push(token)
    if (batch.length >= tokensPerChunk) {
      yield {
        marker: CHUNKED_MARKER,
        transferId,
        sequence: sequence++,
        kind: 'chunk',
        tokens: batch
      }
      batch = []
    }
  }
  if (batch.length > 0) {
    yield { marker: CHUNKED_MARKER, transferId, sequence: sequence++, kind: 'chunk', tokens: batch }
  }
  yield { marker: CHUNKED_MARKER, transferId, sequence, kind: 'end' }
}
