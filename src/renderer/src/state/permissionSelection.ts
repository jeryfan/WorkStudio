import type {
  ApprovalsReviewer,
  AskForApproval,
  SandboxMode,
  SandboxPolicy
} from '@shared/protocol/entities'

/**
 * "下一轮用哪个权限档" 的真值 —— 与 modelSelection 同形状，逐字对齐 Codex 的
 * agent mode → 策略映射（产物里的 `tu` / `$l` / `eu` / `Wme` / `Fme` / `Pme` / `Ime`）。
 *
 * Codex 的权限档不是一份"approvalPolicy + sandbox"，而是一个**档位（agent mode）**，
 * 发请求前才展开成协议字段：
 *
 *   档位 → 策略（`tu(mode, runtimeWorkspaceRoots, config)`）
 *     read-only         → readOnly            + on-request + user             + `:read-only`
 *     auto              → workspaceWrite      + on-request + user             + `:workspace`
 *     granular          → workspaceWrite      + granular   + user             + `:workspace`
 *     guardian-approvals→ workspaceWrite      + on-request + guardian_subagent+ `:workspace`
 *     full-access       → dangerFullAccess    + never      + user             + `:danger-full-access`
 *
 *   策略 → 线上字段
 *     turn/start   `{approvalPolicy, approvalsReviewer, ...Fme(O), runtimeWorkspaceRoots}`
 *                  Fme：有权限档案就发 `permissions: <id>`，否则发 `sandboxPolicy: <对象>`
 *     thread/start `{approvalPolicy, approvalsReviewer, ...Pme(O), runtimeWorkspaceRoots}`
 *                  Pme：有权限档案就发 `permissions: <id>`，否则发 `sandbox: <SandboxMode 串>`
 *     （两处的沙箱字段名/形状不同 —— turn 是 `sandboxPolicy` 对象，thread 是 `sandbox` 枚举串，
 *       取自 `owe()` 那个 thread/start 载荷构造器。混用会被服务端拒。）
 *
 * **为什么按线程存**：Codex 里选档做两件事（产物 `oe` handler）——写 host 级的
 * `agent-mode-by-host-id`（picker 的默认值），以及在有会话时把展开后的策略写进该会话的
 * `update-thread-settings-for-next-turn`。真正决定下一轮的是**线程的 pending 设置**，
 * 所以解析链与 model/effort 同序：线程 pending ?? 线程 latest ?? host 档 ?? config 派生默认。
 *
 * **已知缺口**：host 级档位在 Codex 里持久化在 `.codex-global-state.json` 的
 * `agent-mode-by-host-id`（electron 全局 atom store）。本项目还没有这套客户端 atom 存储
 * （现有的 settings store 写的是 config.toml 的 `[desktop]` 表，不是 atom），
 * 所以 host 档只活在进程内存里，重启回落到 config 派生默认。
 */

/** Codex `ehe`：全部档位。WS 的 picker 只暴露前四档里的三个（见 AccessPicker） */
export type AgentMode =
  'read-only' | 'auto' | 'granular' | 'guardian-approvals' | 'full-access' | 'custom'

/** Codex `ihe`：granular 档的逐项授权配置（**默认只开后两项**，不是全开） */
const GRANULAR_APPROVAL: AskForApproval = {
  granular: {
    sandbox_approval: false,
    rules: false,
    skill_approval: false,
    request_permissions: true,
    mcp_elicitations: true
  }
}

/** Codex `rhe` */
const READ_ONLY_SANDBOX: SandboxPolicy = { type: 'readOnly', networkAccess: false }

/** Codex 的权限档案引用（`{id, extends}`，id 形如 `:workspace`） */
interface PermissionProfileRef {
  id: string
  extends: null
}

/** 一个档位展开后的完整策略（Codex 的 `tu` 返回值） */
export interface ResolvedPermissions {
  activePermissionProfile: PermissionProfileRef | null
  sandboxPolicy: SandboxPolicy
  approvalPolicy: AskForApproval
  approvalsReviewer: ApprovalsReviewer
  runtimeWorkspaceRoots?: string[]
}

/** Codex `$l`：workspace-write 族 */
function workspaceWrite(
  roots: string[],
  approvalPolicy?: AskForApproval,
  approvalsReviewer: ApprovalsReviewer = 'user'
): ResolvedPermissions {
  return {
    activePermissionProfile: { id: ':workspace', extends: null },
    sandboxPolicy: {
      type: 'workspaceWrite',
      writableRoots: [...roots],
      excludeSlashTmp: false,
      excludeTmpdirEnvVar: false,
      networkAccess: false
    },
    approvalPolicy: approvalPolicy ?? 'on-request',
    approvalsReviewer
  }
}

/** Codex `eu` */
function readOnly(): ResolvedPermissions {
  return {
    activePermissionProfile: { id: ':read-only', extends: null },
    sandboxPolicy: READ_ONLY_SANDBOX,
    approvalPolicy: 'on-request',
    approvalsReviewer: 'user'
  }
}

/** Codex `Wme` */
function fullAccess(): ResolvedPermissions {
  return {
    activePermissionProfile: { id: ':danger-full-access', extends: null },
    sandboxPolicy: { type: 'dangerFullAccess' },
    approvalPolicy: 'never',
    approvalsReviewer: 'user'
  }
}

/**
 * Codex `tu(e, t, n)`：档位 → 策略。
 *
 * `custom` 档没实现 —— 它是 `Gme(roots, config)`，把 config 的
 * `sandbox_mode` / `approval_policy` / `sandbox_workspace_write` 原样展开，
 * 且只在 requirements 允许时才出现在菜单里（实测 DOM 的三行里没有它）。
 * 落到这里时按 Codex 的兜底档（`auto`）处理，不猜。
 */
export function resolvePolicy(mode: AgentMode, roots: string[]): ResolvedPermissions {
  switch (mode) {
    case 'read-only':
      return { ...readOnly(), runtimeWorkspaceRoots: roots }
    case 'full-access':
      return { ...fullAccess(), runtimeWorkspaceRoots: roots }
    case 'granular':
      return workspaceWrite(roots, GRANULAR_APPROVAL)
    case 'guardian-approvals':
      return workspaceWrite(roots, undefined, 'guardian_subagent')
    case 'auto':
    case 'custom':
      return workspaceWrite(roots)
  }
}

/** Codex `Nme`：沙箱对象 → thread/start 的 `sandbox` 枚举串 */
function sandboxMode(policy: SandboxPolicy): SandboxMode | null {
  switch (policy.type) {
    case 'dangerFullAccess':
      return 'danger-full-access'
    case 'readOnly':
      return 'read-only'
    case 'workspaceWrite':
      return 'workspace-write'
    default:
      return null
  }
}

/** Codex `Ime`：档案在时随行的运行时工作区根 */
function runtimeRoots(policy: ResolvedPermissions): string[] {
  return (
    policy.runtimeWorkspaceRoots ??
    (policy.sandboxPolicy.type === 'workspaceWrite' ? policy.sandboxPolicy.writableRoots : [])
  )
}

/** turn/start 的权限相关字段（Codex `Fme` + runtimeWorkspaceRoots 那一段） */
export interface TurnPermissionFields {
  approvalPolicy: AskForApproval
  approvalsReviewer: ApprovalsReviewer
  permissions?: string
  sandboxPolicy?: SandboxPolicy
  runtimeWorkspaceRoots?: string[]
}

export function turnPermissionFields(policy: ResolvedPermissions): TurnPermissionFields {
  const profile = policy.activePermissionProfile
  return {
    approvalPolicy: policy.approvalPolicy,
    approvalsReviewer: policy.approvalsReviewer,
    ...(profile == null
      ? { sandboxPolicy: policy.sandboxPolicy }
      : { permissions: profile.id, runtimeWorkspaceRoots: runtimeRoots(policy) })
  }
}

/** thread/start 的权限相关字段（Codex `owe()` 里的 `approvalPolicy + Pme + Ime`） */
export interface ThreadPermissionFields {
  approvalPolicy: AskForApproval
  approvalsReviewer: ApprovalsReviewer
  permissions?: string
  sandbox?: SandboxMode | null
  runtimeWorkspaceRoots?: string[]
}

export function threadPermissionFields(policy: ResolvedPermissions): ThreadPermissionFields {
  const profile = policy.activePermissionProfile
  return {
    approvalPolicy: policy.approvalPolicy,
    approvalsReviewer: policy.approvalsReviewer,
    ...(profile == null
      ? { sandbox: sandboxMode(policy.sandboxPolicy) }
      : { permissions: profile.id, runtimeWorkspaceRoots: runtimeRoots(policy) })
  }
}

/* ==================== 按线程解析的档位状态（形状同 modelSelection） ==================== */

/** 一个线程的权限真值：档位 + 该线程的运行时工作区根 */
export interface PermissionSelection {
  mode: AgentMode
  /** Codex 的 `thread-writable-roots`（按线程记的工作区根，随档位一起展开进载荷） */
  roots: string[]
}

/**
 * config 派生的默认档（Codex `Jme(config, Oti(...))`）。
 * 两个键都没配时就是传进来的兜底档 —— 也就是 `Oti`：
 * 无项目会话（projectless）且 granular 可用 → `granular`，否则 `auto`。
 */
let configDerived: AgentMode | null = null
/** Codex `agent-mode-by-host-id`：用户显式选过的档（进程内，见文件头"已知缺口"） */
let hostMode: AgentMode | null = null
/** 线程 → 下一轮生效（Codex 的 pending thread settings） */
const pendingByThread = new Map<string, PermissionSelection>()
/** 线程 → 最近一轮实际用的（Codex 的 latest* 记账） */
const latestByThread = new Map<string, PermissionSelection>()
/** 线程 → 工作区根（Codex `thread-writable-roots`，thread/start 时落账） */
const rootsByThread = new Map<string, string[]>()

/** 首页 composer（还没有线程）当前的项目根，选档与 thread/start 都用它 */
let homeRoots: string[] = []

const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of Array.from(listeners)) listener()
}

export function subscribePermissionSelection(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Codex `qme`：sandbox_workspace_write 是否等于"什么都没改" */
function isPristineWorkspaceWrite(ws: Record<string, unknown> | undefined): boolean {
  if (ws == null) return true
  const roots = ws.writable_roots
  return (
    (Array.isArray(roots) ? roots.length : 0) === 0 &&
    ws.network_access !== true &&
    ws.exclude_slash_tmp !== true &&
    ws.exclude_tmpdir_env_var !== true
  )
}

/** Codex `Xme`：approval_policy 是不是 granular 档那个对象 */
function isGranularApproval(approval: unknown): boolean {
  return typeof approval === 'object' && approval != null && 'granular' in approval
}

/**
 * Codex `Jme(e, t)`：从 config 推出当前的档位。
 * 推不出来（组合不属于任何一档）时返回 null —— Codex 此时把菜单落到 `custom`，
 * 本项目没有 custom 档，交给调用方回落到兜底档。
 */
function deriveMode(config: Record<string, unknown>, fallback: AgentMode): AgentMode | null {
  const sandbox = typeof config.sandbox_mode === 'string' ? config.sandbox_mode : null
  const approval = config.approval_policy ?? null
  const ws = config.sandbox_workspace_write as Record<string, unknown> | undefined
  const askish = approval === 'on-request' || approval == null
  const neverish = approval === 'never' || approval == null
  if (sandbox == null && approval == null) return fallback
  if ((sandbox === 'read-only' || sandbox == null) && askish) return 'read-only'
  if (sandbox === 'workspace-write' && isPristineWorkspaceWrite(ws)) {
    if (isGranularApproval(approval)) return 'granular'
    if (askish) {
      return approval != null && fallback === 'guardian-approvals' ? 'guardian-approvals' : 'auto'
    }
  }
  return sandbox === 'danger-full-access' && neverish ? 'full-access' : null
}

/**
 * Codex `Oti({isProjectless, requirements})`：菜单第一行（"Ask for approval"）的档位。
 * 有项目 → `auto`；无项目 → `granular`（逐项授权）。
 */
export function defaultAgentMode(projectless: boolean): AgentMode {
  return projectless ? 'granular' : 'auto'
}

/** 读 config 里的权限档（与 loadConfigDefault 同一次 config/read 的产出喂进来） */
export function setConfigPermissions(config: Record<string, unknown>, projectless: boolean): void {
  configDerived = deriveMode(config, defaultAgentMode(projectless))
  emit()
}

/** 首页 composer 的项目根（选了项目/切项目时更新） */
export function setHomeRoots(roots: string[]): void {
  if (roots.length === homeRoots.length && roots.every((r, i) => r === homeRoots[i])) return
  homeRoots = roots
  emit()
}

/**
 * thread/start 之后把这个线程的档位与工作区根记下来。
 *
 * thread/start 的载荷已经把策略应用到线程上了，所以它就是这个线程的"当前设置"
 *（Codex 侧读回的是服务端的 thread settings；本项目按 Codex 的 latest* 记账等价存一份），
 * 工作区根对应 Codex 的 `thread-writable-roots`。
 */
export function seedThreadPermissions(threadId: string, used: PermissionSelection): void {
  latestByThread.set(threadId, used)
  rootsByThread.set(threadId, used.roots)
  emit()
}

/*
 * getSnapshot 必须返回稳定引用（同 modelSelection：每次新建对象会把
 * useSyncExternalStore 转成死循环）。按 (threadId, mode, roots) 缓存。
 */
const snapshotCache = new Map<string, PermissionSelection>()

/**
 * 当前该显示 / 该发出去的档位。
 * 线程 pending → 线程 latest → host 档 → config 派生默认，与 Codex 同序。
 */
export function resolvePermissions(
  threadId: string | null,
  projectless = false
): PermissionSelection {
  const pending = threadId != null ? pendingByThread.get(threadId) : undefined
  const latest = threadId != null ? latestByThread.get(threadId) : undefined
  const mode =
    pending?.mode ?? latest?.mode ?? hostMode ?? configDerived ?? defaultAgentMode(projectless)
  const roots =
    pending?.roots ??
    latest?.roots ??
    (threadId != null ? rootsByThread.get(threadId) : undefined) ??
    homeRoots
  const key = threadId ?? ''
  const cached = snapshotCache.get(key)
  if (
    cached != null &&
    cached.mode === mode &&
    cached.roots.length === roots.length &&
    cached.roots.every((r, i) => r === roots[i])
  ) {
    return cached
  }
  const next: PermissionSelection = { mode, roots }
  snapshotCache.set(key, next)
  return next
}

/**
 * 选档 —— Codex `oe(mode, source)` 的两件事：
 * 写 host 级档位（picker 的默认值），有线程时再写该线程的 pending 设置（下一轮生效）。
 */
export function applyAgentMode(threadId: string | null, mode: AgentMode): void {
  hostMode = mode
  if (threadId != null) {
    const roots = resolvePermissions(threadId).roots
    pendingByThread.set(threadId, { mode, roots })
  }
  emit()
}

/** turn/start 发出之后记账（与 commitTurnSelection 同构） */
export function commitTurnPermissions(threadId: string, used: PermissionSelection): void {
  latestByThread.set(threadId, used)
  pendingByThread.delete(threadId)
  emit()
}
