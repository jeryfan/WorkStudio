/**
 * browser_use native pipe 的线协议自检。
 *
 * 这个脚本模拟 **bundled browser plugin 客户端**的行为（枚举目录 → 连接 →
 * 按本机字节序解帧 → 调 getInfo），用来验证我们的服务端与 Codex 客户端
 * 逐字节兼容：
 *   - 4 字节长度前缀 + UTF-8 JSON，前缀字节序 = os.endianness()
 *   - socket 落在 /tmp/codex-browser-use/<uuid>.sock
 *   - getInfo 必须回 { type:'iab', metadata:{ codexSessionId, codexAppBuildFlavor } }
 *   - 无 id 的帧是通知（CDP 事件走这条）
 */
import { createConnection } from 'node:net'
import { readdir } from 'node:fs/promises'
import { endianness } from 'node:os'
import { join } from 'node:path'
import {
  decodeFrames,
  encodeFrame,
  nativePipeDirectory,
  startNativePipeServer
} from '../src/main/browser/nativePipeServer'

const SESSION_ID = `verify-${Date.now().toString(36)}`
const BUILD_FLAVOR = 'dev'

function fail(message: string): never {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

const notifications: unknown[] = []

const server = await startNativePipeServer({
  onRequest: async (method, params) => {
    switch (method) {
      case 'ping':
        return { ok: true }
      case 'getInfo':
        return {
          type: 'iab',
          metadata: { codexSessionId: SESSION_ID, codexAppBuildFlavor: BUILD_FLAVOR },
          tabCount: 0
        }
      case 'echo':
        return params
      default:
        throw new Error(`browser_use method not implemented: ${method}`)
    }
  },
  onDiagnostic: (message, detail) => console.error('[server]', message, detail ?? '')
})

// 1) 客户端的发现方式：枚举固定目录，socket 必须在里面
const directory = nativePipeDirectory()
const entries = await readdir(directory)
const discovered = entries.map((entry) => join(directory, entry))
if (!discovered.includes(server.pipePath)) {
  fail(`pipe ${server.pipePath} not discoverable in ${directory}`)
}

// 2) 用客户端的编解帧规则通信
const socket = createConnection(server.pipePath)
await new Promise<void>((resolve, reject) => {
  socket.once('connect', resolve)
  socket.once('error', reject)
})

let pending = Buffer.alloc(0)
const replies = new Map<number, { resolve(value: unknown): void }>()
socket.on('data', (chunk) => {
  pending = Buffer.concat([pending, chunk])
  const decoded = decodeFrames(pending)
  pending = decoded.rest
  for (const text of decoded.messages) {
    const message = JSON.parse(text) as { id?: number; result?: unknown; error?: unknown }
    if (message.id == null) {
      notifications.push(message)
      continue
    }
    if (message.error != null) fail(`unexpected error reply: ${JSON.stringify(message.error)}`)
    replies.get(message.id)?.resolve(message.result)
    replies.delete(message.id)
  }
})

let nextId = 1
function request(method: string, params?: unknown): Promise<unknown> {
  const id = nextId++
  socket.write(encodeFrame(JSON.stringify({ id, method, params })))
  return new Promise((resolve) => replies.set(id, { resolve }))
}

const ping = (await request('ping')) as { ok?: boolean }
if (ping?.ok !== true) fail(`ping returned ${JSON.stringify(ping)}`)

const info = (await request('getInfo')) as {
  type?: string
  metadata?: { codexSessionId?: string; codexAppBuildFlavor?: string }
}
if (info?.type !== 'iab') fail(`getInfo.type is ${String(info?.type)}, expected 'iab'`)
if (info.metadata?.codexSessionId !== SESSION_ID) fail('getInfo.metadata.codexSessionId mismatch')
if (info.metadata?.codexAppBuildFlavor !== BUILD_FLAVOR) {
  fail('getInfo.metadata.codexAppBuildFlavor mismatch')
}

// 3) 大 payload 必须能跨多个 TCP 段重组
const big = 'x'.repeat(3 * 1024 * 1024)
const echoed = (await request('echo', { big })) as { big?: string }
if (echoed?.big?.length !== big.length) fail(`echo lost data (${echoed?.big?.length})`)

// 4) 通知（CDP 事件）方向
server.broadcast({ method: 'cdpEvent', params: { tabId: 't1', method: 'Page.loadEventFired' } })
await new Promise((resolve) => setTimeout(resolve, 100))
if (notifications.length !== 1) fail(`expected 1 notification, got ${notifications.length}`)

socket.destroy()
await server.close()

console.log(
  `browser_use native pipe OK — endianness=${endianness()}, dir=${directory}, ` +
    `frames verified up to ${big.length} bytes`
)
