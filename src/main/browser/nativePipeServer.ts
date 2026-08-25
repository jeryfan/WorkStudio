import { createConnection, createServer, type Server, type Socket } from 'node:net'
import { chmod, lstat, mkdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { endianness, platform } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * browser_use 的 native pipe 服务端 —— 线协议已按 Codex 实现逐项取证对齐。
 *
 * 取证来源（两侧都拿到了）：
 *   服务端：`ChatGPT.app` 主进程 chunk 的 `hf/vf/yf/qf/Yf/Xf/Jf/_n`
 *   客户端：`ChatGPT.app/Contents/Resources/plugins/openai-bundled/plugins/browser/
 *          scripts/browser-service.mjs`（`vu` 编帧 / `ym` 解帧 / `_X` 枚举 / `Zs` 目录）
 *
 * 协议（不是猜的）：
 *   1. **帧** = 4 字节长度前缀 + UTF-8 JSON；前缀用**本机字节序**
 *      （`os.endianness()`，两侧都是这么写的），单帧上限 8MB。
 *   2. **发现方式不是环境变量**：客户端枚举一个固定目录里的 socket，
 *      逐个连上去调 `getInfo()`，按 `info.type === 'iab'` 且
 *      `info.metadata.codexSessionId` 匹配当前会话来挑。
 *        posix: /tmp/codex-browser-use/<uuid>.sock
 *        win32: \\.\pipe\codex-browser-use-<uuid>
 *   3. 客户端连接走的是 node_repl 注入的特权桥
 *      `globalThis.nodeRepl.nativePipe.createConnection(path)`，
 *      桥是否可用由 `NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S` 把关 ——
 *      也就是说**只有受信客户端能连**，这层不由我们实现。
 *   4. 请求/响应envelope是朴素 JSON-RPC 形状：`{id, method, params}` →
 *      `{id, result}` / `{id, error}`；无 id 的是通知（CDP 事件走这条）。
 *
 * 目录固定为 `/tmp/codex-browser-use` 是**刻意的**：客户端只在这个目录里找。
 * 换成自己的目录固然更"干净"，但那样 agent 永远发现不了我们的浏览器 ——
 * 而发现机制正是这条管线的关键。
 */
const MAX_FRAME_BYTES = 8 * 1024 * 1024
const LENGTH_PREFIX_BYTES = 4
const WINDOWS_PIPE_PREFIX = '\\\\.\\pipe\\'
/** 探测一个已存在的 socket 是否还活着（Codex `Zf`）的超时 */
const LIVENESS_PROBE_TIMEOUT_MS = 200

export interface NativePipeMessage {
  id?: string | number
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string }
}

export interface NativePipeServer {
  pipePath: string
  /** 广播（CDP 事件、页面事件、下载变化都走这条：无 id 的通知） */
  broadcast(message: NativePipeMessage): void
  close(): Promise<void>
}

export interface NativePipeOptions {
  /** 请求处理器：返回值作为 result，抛错转成 error */
  onRequest(method: string, params: unknown): Promise<unknown>
  /**
   * 连接准入（Codex `socketPeerAuthorizer`）。
   * Codex 在 macOS 打包版里会校验对端进程；本项目没有这层原生能力，
   * 真正的门是 socket 所在私有目录的权限位。
   */
  authorizeSocket?(socket: Socket): boolean
  onDiagnostic?(message: string, detail?: unknown): void
}

/** Codex `_n(platform)`：客户端枚举的固定目录 */
export function nativePipeDirectory(): string {
  return platform() === 'win32'
    ? `${WINDOWS_PIPE_PREFIX}codex-browser-use`
    : '/tmp/codex-browser-use'
}

/** Codex `qf`：目录里一个随机 socket 名 */
function generatePipePath(): string {
  const directory = nativePipeDirectory()
  return platform() === 'win32'
    ? `${directory}-${randomUUID()}`
    : join(directory, `${randomUUID()}.sock`)
}

/** 写 4 字节长度前缀，字节序跟本机（Codex `yf`） */
function writeFrameLength(buffer: Buffer, value: number): void {
  if (endianness() === 'LE') buffer.writeUInt32LE(value, 0)
  else buffer.writeUInt32BE(value, 0)
}

/** 读 4 字节长度前缀（Codex `vf`） */
function readFrameLength(buffer: Buffer, offset = 0): number {
  return endianness() === 'LE' ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset)
}

export function encodeFrame(text: string, maxFrameBytes = MAX_FRAME_BYTES): Buffer {
  const body = Buffer.from(text, 'utf8')
  if (body.length > maxFrameBytes) {
    throw new Error(`native pipe frame exceeds limit (${body.length} > ${maxFrameBytes})`)
  }
  const frame = Buffer.alloc(LENGTH_PREFIX_BYTES + body.length)
  writeFrameLength(frame, body.length)
  body.copy(frame, LENGTH_PREFIX_BYTES)
  return frame
}

/** 增量解帧（Codex `ym`）：返回完整帧的 JSON 文本与剩余字节 */
export function decodeFrames(
  buffer: Buffer,
  maxFrameBytes = MAX_FRAME_BYTES
): { messages: string[]; rest: Buffer } {
  const messages: string[] = []
  let cursor = 0
  while (buffer.length - cursor >= LENGTH_PREFIX_BYTES) {
    const length = readFrameLength(buffer, cursor)
    if (length > maxFrameBytes) throw new Error('native pipe frame exceeds limit')
    const end = cursor + LENGTH_PREFIX_BYTES + length
    if (buffer.length < end) break
    messages.push(buffer.subarray(cursor + LENGTH_PREFIX_BYTES, end).toString('utf8'))
    cursor = end
  }
  return { messages, rest: cursor === 0 ? buffer : buffer.subarray(cursor) }
}

/**
 * 探测一个已存在的 socket 路径是否还有人在听（Codex `Zf`）。
 *
 * 为什么必须探：上次进程崩了会把 socket 文件留在目录里。不探就 unlink 会踢掉
 * 一个**还活着**的实例（比如用户同时开着两个窗口/两个 app）；不 unlink 又会
 * 让 listen 直接 EADDRINUSE。
 */
async function isPipeInUse(path: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const socket = createConnection(path)
    let settled = false
    const timer = setTimeout(() => finish(true), LIVENESS_PROBE_TIMEOUT_MS)
    timer.unref()
    const finish = (result: boolean | Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      if (result instanceof Error) reject(result)
      else resolve(result)
    }
    socket.once('connect', () => finish(true))
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOENT') finish(false)
      else finish(error)
    })
  })
}

/** Codex `Jf`：确保目录存在，且不是被别的东西占着 */
async function ensureDirectory(directory: string): Promise<void> {
  if (platform() === 'win32') return
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 })
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
  }
  const stat = await lstat(directory)
  if (!stat.isDirectory()) {
    throw new Error('Browser-use native pipe directory path exists and is not a directory')
  }
}

/** Codex `Yf`：listen 前清掉死掉的 socket 文件 */
async function clearStalePipe(path: string): Promise<void> {
  if (platform() === 'win32' || !existsSync(path)) return
  if (await isPipeInUse(path)) throw new Error('Browser-use native pipe is already in use')
  await unlink(path)
}

export async function startNativePipeServer(options: NativePipeOptions): Promise<NativePipeServer> {
  const pipePath = generatePipePath()
  await ensureDirectory(nativePipeDirectory())
  await clearStalePipe(pipePath)

  const sockets = new Set<Socket>()
  const buffers = new Map<Socket, Buffer>()

  const server: Server = createServer((socket) => {
    if (options.authorizeSocket != null && !options.authorizeSocket(socket)) {
      options.onDiagnostic?.('browser-use pipe rejected socket peer')
      socket.destroy()
      return
    }
    sockets.add(socket)
    buffers.set(socket, Buffer.alloc(0))
    socket.on('data', (chunk) => {
      const pending = Buffer.concat([buffers.get(socket) ?? Buffer.alloc(0), chunk])
      let decoded: { messages: string[]; rest: Buffer }
      try {
        decoded = decodeFrames(pending)
      } catch (error) {
        options.onDiagnostic?.('browser-use pipe frame error', error)
        socket.destroy()
        return
      }
      buffers.set(socket, decoded.rest)
      for (const message of decoded.messages) void handleFrame(socket, message)
    })
    socket.on('error', (error) => options.onDiagnostic?.('browser-use pipe socket error', error))
    socket.on('close', () => {
      sockets.delete(socket)
      buffers.delete(socket)
    })
  })

  async function handleFrame(socket: Socket, payload: string): Promise<void> {
    let message: NativePipeMessage
    try {
      message = JSON.parse(payload) as NativePipeMessage
    } catch (error) {
      options.onDiagnostic?.('browser-use pipe received invalid JSON', error)
      return
    }
    if (message.method == null) return
    try {
      const result = await options.onRequest(message.method, message.params)
      if (message.id != null) writeFrame(socket, { id: message.id, result: result ?? null })
    } catch (error) {
      if (message.id != null) {
        writeFrame(socket, {
          id: message.id,
          error: { code: -32000, message: error instanceof Error ? error.message : String(error) }
        })
      }
    }
  }

  function writeFrame(socket: Socket, message: NativePipeMessage): void {
    if (socket.destroyed) return
    try {
      socket.write(encodeFrame(JSON.stringify(message)))
    } catch (error) {
      options.onDiagnostic?.('browser-use pipe skipped frame', error)
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(pipePath, () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  if (platform() !== 'win32') await chmod(pipePath, 0o600)

  return {
    pipePath,
    broadcast: (message) => {
      for (const socket of sockets) writeFrame(socket, message)
    },
    close: async () => {
      for (const socket of sockets) socket.destroy()
      sockets.clear()
      buffers.clear()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      // Codex `Xf`：自己建的 socket 文件自己收
      if (platform() !== 'win32' && existsSync(pipePath)) await unlink(pipePath)
    }
  }
}
