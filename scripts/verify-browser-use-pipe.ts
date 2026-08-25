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
 *   - capability 命令的**两层信封**：外层 method 恒为 `executeUnhandledCommand`，
 *     内层命令类型在 `params.type`（不是 `command`/`commandType`）
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
import { BrowserUseApi } from '../src/main/browser/BrowserUseApi'
import type { BrowserSidebarManager } from '../src/main/browser/BrowserSidebarManager'

const SESSION_ID = `verify-${Date.now().toString(36)}`
const BUILD_FLAVOR = 'dev'

function fail(message: string): never {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

const notifications: unknown[] = []

/**
 * capability 落点的替身。
 *
 * 只桩掉 `BrowserSidebarManager` 上 capability 真正会调的四个成员 —— 真的
 * manager 依赖 Electron 的 `WebContents`，脚本里起不来。`BrowserUseApi` 对
 * manager 是 `import type`，运行期没有这条依赖，所以这个替身够用。
 */
const calls: string[] = []
let stubVisible = false
let stubViewport: { width: number; height: number } | null = null
const stubManager = {
  cdp: { addEventListener: () => () => undefined },
  setBrowserVisibleForBrowserUse: (conversationId: string, visible: boolean) => {
    calls.push(`visibility.set(${conversationId},${String(visible)})`)
    stubVisible = visible
  },
  isBrowserVisibleForBrowserUse: () => stubVisible,
  setViewportForBrowserUse: async (
    _conversationId: string,
    viewportSize: { width: number; height: number } | null
  ) => {
    calls.push(`viewport.set(${viewportSize == null ? 'null' : `${viewportSize.width}x${viewportSize.height}`})`)
    stubViewport = viewportSize
  },
  findPagesForConversation: () => []
} as unknown as BrowserSidebarManager

const api = new BrowserUseApi(stubManager, {
  sessionId: SESSION_ID,
  conversationId: 'conv-1',
  buildFlavor: BUILD_FLAVOR
})

const server = await startNativePipeServer({
  onRequest: async (method, params) => {
    if (method === 'echo') return params
    return api.invoke(method, params)
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

interface Reply {
  result?: unknown
  error?: unknown
}

let pending = Buffer.alloc(0)
const replies = new Map<number, { resolve(value: Reply): void }>()
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
    replies.get(message.id)?.resolve({ result: message.result, error: message.error })
    replies.delete(message.id)
  }
})

let nextId = 1
function requestRaw(method: string, params?: unknown): Promise<Reply> {
  const id = nextId++
  // 客户端真的会带 jsonrpc 字段（`sendRequest` 里写死 '2.0'），一起发出去
  socket.write(encodeFrame(JSON.stringify({ jsonrpc: '2.0', id, method, params })))
  return new Promise((resolve) => replies.set(id, { resolve }))
}

async function request(method: string, params?: unknown): Promise<unknown> {
  const reply = await requestRaw(method, params)
  if (reply.error != null) fail(`unexpected error reply: ${JSON.stringify(reply.error)}`)
  return reply.result
}

/**
 * capability 调用：外层恒 `executeUnhandledCommand`，内层是 `{type, ...payload}`
 * 再无条件混入 `session_id`/`turn_id`/`session_context`（Codex
 * `sendSessionRequest` 对每个请求都这么做，不是 capability 专有的）。
 */
function capability(type: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  return request('executeUnhandledCommand', {
    type,
    browser_id: 'conv-1',
    ...payload,
    session_id: SESSION_ID,
    turn_id: 'turn-1',
    session_context: 'live'
  })
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

// 4) capability 的两层信封
const visibilityBefore = (await capability('browser_visibility_get')) as { visible?: boolean }
if (visibilityBefore?.visible !== false) fail(`visibility.get should start false`)
await capability('browser_visibility_set', { visible: true })
const visibilityAfter = (await capability('browser_visibility_get')) as { visible?: boolean }
if (visibilityAfter?.visible !== true) fail(`visibility.get should be true after set(true)`)

await capability('browser_viewport_set', { width: 390, height: 844 })
if (stubViewport?.width !== 390 || stubViewport?.height !== 844) {
  fail(`viewport.set did not reach the manager (${JSON.stringify(stubViewport)})`)
}
await capability('browser_viewport_reset')
if (stubViewport !== null) fail(`viewport.reset did not clear the override`)

// 内层类型不认识时必须报错，而不是静默返回空结果
const unknownCommand = await requestRaw('executeUnhandledCommand', { type: 'tab_screenshot' })
if (unknownCommand.error == null) fail('unknown capability command should reply with an error')

// `command` 这个键从来不出现在线上：用它发一定认不出来
const wrongEnvelope = await requestRaw('executeUnhandledCommand', {
  command: { commandType: 'browser_visibility_get', browser_id: 'conv-1' }
})
if (wrongEnvelope.error == null) fail('capability envelope must be flat `type`, not nested `command`')

// 5) 通知（CDP 事件）方向
server.broadcast({ method: 'cdpEvent', params: { tabId: 't1', method: 'Page.loadEventFired' } })
await new Promise((resolve) => setTimeout(resolve, 100))
if (notifications.length !== 1) fail(`expected 1 notification, got ${notifications.length}`)

socket.destroy()
await server.close()

if (calls.length === 0) fail('capability commands never reached the manager')

console.log(
  `browser_use native pipe OK — endianness=${endianness()}, dir=${directory}, ` +
    `frames verified up to ${big.length} bytes\n` +
    `capability envelope OK — executeUnhandledCommand → params.type; manager calls: ${calls.join(', ')}`
)
