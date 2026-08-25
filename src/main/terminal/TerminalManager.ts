import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import type {
  TerminalCreateParams,
  TerminalEvent,
  TerminalSnapshot,
  TerminalShellPreference
} from '@shared/host/appHost'
import { PtyBackend, PtyUnavailableError } from './PtyBackend'
import {
  getAvailableShells,
  resolveTerminalCommand,
  shellDisplayName,
  shellKindOf,
  type ShellKind
} from './shells'

/**
 * 终端会话管理器 —— Codex `TerminalManager`。
 *
 * 三条结构性事实，都不是可选的：
 *
 * 1. **会话属于窗口（owner），不属于订阅者**。Codex 每个方法第一件事就是
 *    `session.ownerId !== origin.id → "Session owned by another window"`。
 *    少了这道检查，B 窗口能往 A 窗口的 shell 里写命令。
 * 2. **会话活得比 UI 长**。同一窗口同一会话（conversationId）复用同一个
 *    终端会话：切 tab、关面板都不该杀掉正在跑的进程。窗口销毁时按
 *    `preserveOnOwnerDestroy` 决定是留还是收。
 * 3. **输出有回放缓冲**（尾部 16000 字符，与 Codex `16e3` 同值）。渲染层重新
 *    挂载时靠 `getThreadSnapshot` 把已经滚过去的输出补回来 —— 没有它，
 *    切一次 tab 终端就变空白。
 */

/** Codex `16e3`：回放缓冲上限（字符） */
const BUFFER_LIMIT = 16_000
const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24
/** Codex `o8` */
const TERM = 'xterm-256color'

/** 事件订阅者的宿主标识：一个窗口的 webContents id */
export type TerminalOwnerId = number

export interface TerminalOwner {
  id: TerminalOwnerId
  isDestroyed(): boolean
}

interface TerminalSession {
  id: string
  backend: PtyBackend
  ownerId: TerminalOwnerId
  buffer: string
  cwd: string
  shell: string
  shellKind: ShellKind
  cols: number
  rows: number
  /** 已经把 `attached` 发出去了：之后的 data 才往订阅者推 */
  attached: boolean
  conversationId: string | null
  conversationTitle: string | null
  preserveOnOwnerDestroy: boolean
  /** 后端起不来时攒的诊断，attach 后一次性 flush 成 init-log */
  initLogs: string[]
}

type Listener = (event: TerminalEvent) => void

/** Codex `s8(ownerId, conversationId)`：窗口 × 会话的复用键 */
function reuseKey(ownerId: TerminalOwnerId, conversationId: string): string {
  return `${ownerId}::${conversationId}`
}

export class TerminalManager {
  private readonly sessions = new Map<string, TerminalSession>()
  private readonly sessionIdByReuseKey = new Map<string, string>()
  private readonly listenersByOwnerId = new Map<TerminalOwnerId, Set<Listener>>()
  private disposed = false

  /**
   * 集成终端的 shell 偏好（Codex 从 settings store 读
   * `getIntegratedTerminalShellPreference()`）。本项目还没有对应的设置项，
   * 先由调用方注入；为 null 时走 `resolveTerminalCommand` 的兜底顺序。
   */
  shellPreference: TerminalShellPreference | null = null

  subscribe(owner: TerminalOwner, listener: Listener): () => void {
    const listeners = this.listenersByOwnerId.get(owner.id) ?? new Set<Listener>()
    listeners.add(listener)
    this.listenersByOwnerId.set(owner.id, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.listenersByOwnerId.delete(owner.id)
    }
  }

  getAvailableShells(): TerminalShellPreference[] {
    return getAvailableShells()
  }

  /**
   * Codex `createOrAttach`。
   *
   * `type: 'attach'` 允许"按 conversationId 找回会话"，`type: 'create'` 不允许
   * —— 否则显式的"新建终端"会静默变成"attach 到已有的那个"。
   */
  async createOrAttach(
    owner: TerminalOwner,
    params: TerminalCreateParams & { type: 'create' | 'attach' }
  ): Promise<string | null> {
    const existing = this.findExistingSessionId({
      ownerId: owner.id,
      sessionId: params.sessionId,
      conversationId: params.conversationId,
      allowConversationFallback: params.type === 'attach'
    })
    if (existing != null) return this.attachExisting(owner, existing, params)
    return this.create(owner, params)
  }

  write(owner: TerminalOwner, sessionId: string, data: string): void {
    const session = this.requireOwnedSession(owner, sessionId)
    if (session == null) return
    session.backend.write(data)
  }

  resize(
    owner: TerminalOwner,
    sessionId: string,
    cols: number,
    rows: number,
    repaint = false
  ): void {
    const session = this.requireOwnedSession(owner, sessionId)
    if (session == null) return
    /*
     * repaint 时也要真的 resize 一次：Codex 传的是同一个尺寸，目的是让 shell
     * 收到 SIGWINCH 重画提示符。跳过它的话"重画"这个动作就没有效果了。
     */
    if (!repaint && session.cols === cols && session.rows === rows) return
    session.cols = cols
    session.rows = rows
    try {
      session.backend.resize(cols, rows)
    } catch (error) {
      this.emitError(owner.id, sessionId, describe(error))
    }
  }

  /**
   * Codex `runAction`：在会话里跑一条命令。
   *
   * Codex 的实现是**重启会话**（`restartSessionForAction`）而不是往当前 shell
   * 里写一行 —— 因为当前 shell 可能正卡在一个前台进程上，写进去只会变成那个
   * 进程的 stdin。本项目同构：销毁再按新 cwd 建一个，然后喂命令。
   */
  runAction(
    owner: TerminalOwner,
    sessionId: string,
    action: { cwd: string | null; command: string }
  ): void {
    const session = this.requireOwnedSession(owner, sessionId)
    if (session == null) return
    const conversationId = session.conversationId
    const conversationTitle = session.conversationTitle
    const cols = session.cols
    const rows = session.rows
    const preserveOnOwnerDestroy = session.preserveOnOwnerDestroy
    this.destroySession(session, { code: null, signal: null })
    void this.create(owner, {
      sessionId,
      conversationId: conversationId ?? undefined,
      conversationTitle: conversationTitle ?? undefined,
      cwd: action.cwd ?? undefined,
      cols,
      rows,
      preserveOnOwnerDestroy
    }).then((created) => {
      if (created == null) return
      const next = this.sessions.get(created)
      if (next == null) return
      next.backend.write(`${action.command}\n`)
    })
  }

  close(owner: TerminalOwner, sessionId: string): void {
    const session = this.requireOwnedSession(owner, sessionId)
    if (session == null) return
    this.destroySession(session, { code: null, signal: null })
  }

  /** Codex `getShellCwd`：把宿主的路径换算成这个 shell 能 `cd` 的写法 */
  getShellCwd(owner: TerminalOwner, sessionId: string, cwd: string): string | null {
    const session = this.sessions.get(sessionId)
    if (session == null || session.ownerId !== owner.id) return null
    return resolveShellCwd(session.shellKind, cwd)
  }

  getSnapshotForConversation(
    ownerId: TerminalOwnerId,
    conversationId: string
  ): TerminalSnapshot | null {
    const sessionId = this.sessionIdByReuseKey.get(reuseKey(ownerId, conversationId))
    if (sessionId == null) return null
    const session = this.sessions.get(sessionId)
    if (session == null) return null
    return {
      cwd: session.cwd,
      shell: session.shell,
      buffer: session.buffer,
      truncated: session.buffer.length >= BUFFER_LIMIT
    }
  }

  /** 窗口销毁：按 `preserveOnOwnerDestroy` 决定留还是收（Codex `cleanupForOrigin`） */
  cleanupForOwner(ownerId: TerminalOwnerId): void {
    this.listenersByOwnerId.delete(ownerId)
    for (const session of Array.from(this.sessions.values())) {
      if (session.ownerId !== ownerId) continue
      if (session.preserveOnOwnerDestroy) {
        session.attached = false
        continue
      }
      this.destroySession(session, { code: null, signal: null })
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    for (const session of Array.from(this.sessions.values())) {
      this.destroySession(session, { code: null, signal: null })
    }
  }

  // ── 内部 ──────────────────────────────────────────────────────────
  private findExistingSessionId(params: {
    ownerId: TerminalOwnerId
    sessionId: string | undefined
    conversationId: string | undefined
    allowConversationFallback: boolean
  }): string | null {
    if (params.sessionId != null && this.sessions.has(params.sessionId)) return params.sessionId
    if (params.allowConversationFallback && params.conversationId != null) {
      const found = this.sessionIdByReuseKey.get(reuseKey(params.ownerId, params.conversationId))
      if (found != null) return found
    }
    return null
  }

  private attachExisting(
    owner: TerminalOwner,
    sessionId: string,
    params: TerminalCreateParams
  ): string | null {
    const session = this.sessions.get(sessionId)
    if (session == null) {
      this.emitError(owner.id, sessionId, 'Session missing')
      return null
    }
    /*
     * 原 owner 已经销毁时可以过户（Codex 同一条判断）：窗口重开后要能接回
     * `preserveOnOwnerDestroy` 留下的会话。原 owner 还活着就不给 —— 那是抢。
     */
    const previousOwnerAlive = !this.isOwnerGone(session.ownerId)
    if (session.ownerId !== owner.id && previousOwnerAlive) {
      this.emitError(owner.id, sessionId, 'Session owned by another window')
      return null
    }
    session.ownerId = owner.id
    if (params.cols != null && params.rows != null) {
      this.resize(owner, sessionId, params.cols, params.rows)
    }
    this.sendAttached(session)
    return sessionId
  }

  private async create(owner: TerminalOwner, params: TerminalCreateParams): Promise<string | null> {
    if (this.disposed) return null
    const sessionId = params.sessionId ?? randomUUID()
    const requestedCwd = params.cwd ?? process.cwd()
    const cwd = resolveLocalCwd(requestedCwd)
    const command = resolveTerminalCommand(this.shellPreference)
    const cols = params.cols ?? DEFAULT_COLS
    const rows = params.rows ?? DEFAULT_ROWS

    const session: TerminalSession = {
      id: sessionId,
      // backend 在下面赋值；先建 session 是因为 onData 可能在 create 返回前就来
      backend: undefined as unknown as PtyBackend,
      ownerId: owner.id,
      buffer: '',
      cwd,
      shell: shellDisplayName(command),
      shellKind: shellKindOf(command),
      cols,
      rows,
      attached: false,
      conversationId: params.conversationId ?? null,
      conversationTitle: params.conversationTitle ?? null,
      preserveOnOwnerDestroy: params.preserveOnOwnerDestroy ?? false,
      initLogs: []
    }

    /*
     * 回调必须按 **backend 身份**找会话，不能按 sessionId 找（Codex
     * `getSessionForBackend`）。
     *
     * 理由是 `runAction`：它先销毁再用**同一个 sessionId** 重建。被杀掉的那个
     * pty 的 `onExit` 是异步到的 —— 那时新会话已经用同一个 id 注册好了，按 id
     * 查会查到新会话并把它当成"退出了"一起销毁。实测过：runAction 之后
     * `getThreadSnapshot` 返回 null、close 报 "Session missing"，就是这条。
     */
    let backendRef: PtyBackend | null = null
    const sessionForBackend = (): TerminalSession | null => {
      if (backendRef == null) return null
      for (const candidate of this.sessions.values()) {
        if (candidate.backend === backendRef) return candidate
      }
      return null
    }

    try {
      const created = PtyBackend.create({
        command,
        cwd,
        env: buildTerminalEnv(params.conversationTitle ?? null),
        cols,
        rows,
        callbacks: {
          onData: (data) => {
            const target = sessionForBackend()
            // 还没注册进表就先攒着（Codex 的 `pendingState.buffer`）
            if (target == null) {
              session.buffer = `${session.buffer}${data}`.slice(-BUFFER_LIMIT)
              return
            }
            this.appendOutput(target.id, data)
          },
          onExit: (exit) => {
            const target = sessionForBackend()
            if (target != null) this.destroySession(target, exit)
          }
        }
      })
      session.backend = created
      backendRef = created
    } catch (error) {
      /*
       * node-pty 加载失败（ABI 不匹配、没重编）走这里。发 error 事件而不是抛：
       * 抛出去只有主进程日志看得到，渲染层表现为"点了新建终端什么都没发生"。
       */
      const message =
        error instanceof PtyUnavailableError
          ? `${error.message}（需要 npm run postinstall 重编原生模块）`
          : describe(error)
      this.emitError(owner.id, sessionId, message)
      return null
    }

    this.sessions.set(sessionId, session)
    if (params.conversationId != null) {
      this.sessionIdByReuseKey.set(reuseKey(owner.id, params.conversationId), sessionId)
    }

    /*
     * 请求的 cwd 不存在时 pty 起在 `process.cwd()`。这不是静默降级 ——
     * 把它作为 init-log 报上去，否则用户看到的是一个莫名其妙的目录。
     */
    if (cwd !== requestedCwd) {
      session.initLogs.push(`Requested cwd ${requestedCwd} is not accessible; started in ${cwd}`)
    }
    this.flushInitLogs(session)
    this.sendAttached(session)
    return sessionId
  }

  private appendOutput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (session == null) return
    session.buffer = `${session.buffer}${data}`.slice(-BUFFER_LIMIT)
    if (session.attached) {
      this.emit(session.ownerId, { type: 'data', sessionId, data })
    }
  }

  private destroySession(
    session: TerminalSession,
    exit: { code: number | null; signal: string | null }
  ): void {
    if (!this.sessions.delete(session.id)) return
    for (const [key, id] of Array.from(this.sessionIdByReuseKey)) {
      if (id === session.id) this.sessionIdByReuseKey.delete(key)
    }
    session.backend?.dispose()
    this.emit(session.ownerId, {
      type: 'exit',
      sessionId: session.id,
      code: exit.code,
      signal: exit.signal
    })
  }

  private flushInitLogs(session: TerminalSession): void {
    for (const log of session.initLogs) {
      this.emit(session.ownerId, { type: 'init-log', sessionId: session.id, log })
    }
    session.initLogs = []
  }

  private sendAttached(session: TerminalSession): void {
    session.attached = true
    this.emit(session.ownerId, {
      type: 'attached',
      sessionId: session.id,
      cwd: session.cwd,
      shell: session.shell
    })
    // attach 之后立刻把回放缓冲交出去，渲染层不必再单独拉一次 snapshot
    if (session.buffer !== '') {
      this.emit(session.ownerId, { type: 'data', sessionId: session.id, data: session.buffer })
    }
  }

  private requireOwnedSession(owner: TerminalOwner, sessionId: string): TerminalSession | null {
    const session = this.sessions.get(sessionId)
    if (session == null) {
      this.emitError(owner.id, sessionId, 'Session missing')
      return null
    }
    if (session.ownerId !== owner.id) {
      this.emitError(owner.id, sessionId, 'Session owned by another window')
      return null
    }
    return session
  }

  private isOwnerGone(ownerId: TerminalOwnerId): boolean {
    return !this.listenersByOwnerId.has(ownerId)
  }

  private emitError(ownerId: TerminalOwnerId, sessionId: string, message: string): void {
    this.emit(ownerId, { type: 'error', sessionId, message })
  }

  private emit(ownerId: TerminalOwnerId, event: TerminalEvent): void {
    const listeners = this.listenersByOwnerId.get(ownerId)
    if (listeners == null) return
    for (const listener of Array.from(listeners)) {
      try {
        listener(event)
      } catch {
        // 订阅者（渲染层 stub）已经断了；unsubscribe 会在 onRpcBroken 时发生
      }
    }
  }
}

/** Codex `buildTerminalEnv` */
function buildTerminalEnv(conversationTitle: string | null): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value != null) env[key] = value
  }
  if (conversationTitle != null) env.CODEX_APP_TITLE = conversationTitle
  if (process.platform !== 'win32') {
    env.TERM = TERM
    /*
     * `TERMINFO`/`TERMINFO_DIRS` 必须删掉。Electron 打包后这两个变量可能指向
     * 应用自己带的 terminfo；shell 按它找不到 xterm-256color 的条目，
     * 表现为方向键/颜色全乱。删掉让 shell 用系统的那份。
     */
    delete env.TERMINFO
    delete env.TERMINFO_DIRS
  }
  return env
}

/** Codex `resolveLocalCwd`：目录不存在就退回 `process.cwd()` */
function resolveLocalCwd(cwd: string): string {
  return existsSync(cwd) ? cwd : process.cwd()
}

/** Codex `resolveShellCwd` */
function resolveShellCwd(shellKind: ShellKind, cwd: string): string {
  if (shellKind === 'wsl') {
    // /c/Users/... 这类 WSL 路径；Codex 用 `Sn(cwd, true)` 做完整换算
    const match = /^([A-Za-z]):[\\/](.*)$/.exec(cwd)
    if (match?.[1] != null)
      return `/mnt/${match[1].toLowerCase()}/${(match[2] ?? '').replace(/\\/g, '/')}`
    return cwd.replace(/\\/g, '/')
  }
  return cwd
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
