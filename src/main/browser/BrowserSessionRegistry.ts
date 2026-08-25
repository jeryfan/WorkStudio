import { app } from 'electron'
import type { BrowserSidebarManager } from './BrowserSidebarManager'
import { BrowserUseApi } from './BrowserUseApi'
import { startNativePipeServer, type NativePipeServer } from './nativePipeServer'

/**
 * browser_use 的会话级后端注册表。
 *
 * 取证：Codex 的 `BrowserSessionRegistry`：
 *   - `ensureBackendForSession(sessionId)` 惰性起后端，同一会话只起一次
 *     （用 `starting` promise 去重）；
 *   - 后端 = browser-api 实现 + native pipe server；
 *   - CDP 事件 / 页面事件 / 下载变化经 pipe 反向广播给客户端；
 *   - `dispatchTurnEnded({conversationId, turnId})` 每轮结束通知后端收回接管态；
 *   - 整条链路由 `browserUseNativePipeEnabled` 开关控制。
 *
 * 线程配置侧（Codex `BrowserUseThreadConfig`）注入的环境变量见
 * `browserUseThreadEnv()`。注意 **pipe 路径不在里面**：客户端靠枚举固定目录
 * 发现后端（见 nativePipeServer.ts 的说明），这也是为什么这里不需要把路径
 * 传给 agent。
 */

/** 与注入 agent 的 BROWSER_USE_CODEX_APP_BUILD_FLAVOR 同一个值 */
function buildFlavor(): string {
  return app.isPackaged ? 'prod' : 'dev'
}

interface BackendState {
  sessionId: string
  api: BrowserUseApi | null
  server: NativePipeServer | null
  starting: Promise<void> | null
  disposeCdpListener: (() => void) | null
}

export class BrowserSessionRegistry {
  private readonly backends = new Map<string, BackendState>()
  /**
   * Codex 的 `browserUseNativePipeEnabled`。
   *
   * 默认开：线协议与发现机制都已按两侧实现取证对齐，关着反而让"agent 用不了
   * 内置浏览器"变成默认行为。需要排除干扰时用 setNativePipeEnabled(false)。
   */
  private enabled = true

  constructor(private readonly manager: BrowserSidebarManager) {}

  setNativePipeEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return
    this.enabled = enabled
    if (!enabled) void this.disposeAll()
  }

  isNativePipeEnabled(): boolean {
    return this.enabled
  }

  /** 惰性起后端；返回 pipe 路径（未开启时为 null） */
  async ensureBackendForSession(conversationId: string): Promise<string | null> {
    if (!this.enabled) return null
    const existing = this.backends.get(conversationId)
    if (existing?.server != null) return existing.server.pipePath
    if (existing?.starting != null) {
      await existing.starting
      return this.backends.get(conversationId)?.server?.pipePath ?? null
    }

    const state: BackendState = {
      sessionId: conversationId,
      api: null,
      server: null,
      starting: null,
      disposeCdpListener: null
    }
    this.backends.set(conversationId, state)

    state.starting = (async () => {
      const api = new BrowserUseApi(this.manager, {
        sessionId: conversationId,
        conversationId,
        buildFlavor: buildFlavor()
      })
      const server = await startNativePipeServer({
        onRequest: (method, params) => api.invoke(method, params),
        onDiagnostic: (message, detail) => console.warn('[browser-use]', message, detail ?? '')
      })
      state.api = api
      state.server = server
      // CDP 事件反向广播：客户端靠它拿到 Page/Network/Target 的事件流
      state.disposeCdpListener = api.addCdpEventListener((event) => {
        server.broadcast({ method: 'cdpEvent', params: event })
      })
      console.log(`[browser-use] native pipe listening — ${server.pipePath}`)
    })()

    try {
      await state.starting
    } catch (error) {
      this.backends.delete(conversationId)
      console.warn('[browser-use] native pipe startup failed', error)
      return null
    } finally {
      state.starting = null
    }
    return state.server?.pipePath ?? null
  }

  /** 每轮结束：收回接管态并通知客户端（Codex `dispatchTurnEnded`） */
  async dispatchTurnEnded(conversationId: string, turnId: string): Promise<void> {
    const state = this.backends.get(conversationId)
    if (state?.starting != null) await state.starting.catch(() => undefined)
    const backend = this.backends.get(conversationId)
    if (backend?.api == null) return
    await backend.api.invoke('turnEnded', { session_id: conversationId, turn_id: turnId })
    backend.server?.broadcast({
      method: 'turnEnded',
      params: { session_id: conversationId, turn_id: turnId }
    })
  }

  async disposeSession(conversationId: string): Promise<void> {
    const state = this.backends.get(conversationId)
    if (state == null) return
    this.backends.delete(conversationId)
    if (state.starting != null) await state.starting.catch(() => undefined)
    state.disposeCdpListener?.()
    await state.server?.close()
  }

  async disposeAll(): Promise<void> {
    await Promise.all(Array.from(this.backends.keys(), (id) => this.disposeSession(id)))
  }

  /**
   * 线程配置里可以确认的那部分（作为环境变量注入 agent 的 code-mode 沙箱）。
   * 文案与 Codex 实测逐字一致。
   */
  browserUseThreadEnv(): Record<string, string> {
    return {
      BROWSER_USE_AVAILABLE_BACKENDS: 'iab',
      NODE_REPL_INSTRUCTIONS_USE_CASE_BROWSER:
        'Control the in-app browser in conjunction with the Browser Plugin.',
      BROWSER_USE_CODEX_APP_VERSION: app.getVersion(),
      BROWSER_USE_CODEX_APP_BUILD_FLAVOR: buildFlavor()
    }
  }
}
