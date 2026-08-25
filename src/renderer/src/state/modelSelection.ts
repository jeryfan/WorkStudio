import { rpc } from '../rpc/client'
import { M } from '@shared/protocol/methods'

/**
 * "下一轮用哪个模型" 的真值 —— 对齐 Codex 的两套来源。
 *
 * Codex 的模型选择**不是一份全局状态**，而是按有没有活动线程分成两个 regime
 *（`l0r` + `turn/start` 载荷的解析链，均逐字取自产物）：
 *
 * 1. **没有线程（首页 composer）**：picker 显示的是 config 的默认值
 *    （`config/read` 的顶层 `model` / `model_reasoning_effort`），改动直接写回 config：
 *        set-default-model-config-for-host → setDefaultModelConfig(model, effort, profile)
 *        → config/batchWrite {edits:[{keyPath:'model'},{keyPath:'model_reasoning_effort'}],
 *                             mergeStrategy:'upsert', reloadUserConfig:true}
 *      有 profile 时键路径前缀是 `profiles.<name>.`。
 *
 * 2. **有活动线程**：改动写入该线程的 "下一轮生效" 设置
 *        update-thread-settings-for-next-turn { conversationId, threadSettings:{model, effort} }
 *      turn/start 再按这条链解析：
 *        model  = 本次调用覆盖 ?? 线程 pending ?? 线程 latestModel
 *        effort = 本次调用覆盖 ?? 线程 pending ?? 线程 latestReasoningEffort
 *      发出去之后线程的 latest* 用本轮实际值刷新（`e.latestModel = F ?? e.latestModel`）。
 *
 * **为什么必须按线程而不是全局**：turn/start 的 model 是 "override the model for
 * this turn and subsequent turns"，服务端会把它记在线程上。一份全局选择意味着
 * 切到另一个会话再发一轮，会把上一个会话的模型悄悄按到这个会话头上。
 *
 * 三处状态都在这里，订阅者用 subscribeModelSelection。
 */

export interface ModelSelection {
  /** 协议值（`deepseek-v4-flash`），不是展示名 */
  model: string | null
  /** 协议值（`xhigh`），不是展示串（`Extra High`） */
  effort: string | null
}

/** config 顶层的默认值（regime 1 的真值镜像） */
let configDefault: ModelSelection = { model: null, effort: null }
/** 线程 → 下一轮生效的设置（Codex 的 pending thread settings） */
const pendingByThread = new Map<string, ModelSelection>()
/** 线程 → 最近一轮实际用的值（Codex 的 latestModel / latestReasoningEffort） */
const latestByThread = new Map<string, ModelSelection>()

const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of Array.from(listeners)) listener()
}

export function subscribeModelSelection(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 读 config 的默认模型与 effort（Codex 的 config 查询，取顶层两个键） */
export async function loadConfigDefault(): Promise<void> {
  try {
    const res = await rpc.request<{ config: Record<string, unknown> }>(M.configRead, {
      includeLayers: false,
      cwd: null
    })
    const model = typeof res.config.model === 'string' ? res.config.model : null
    const effort =
      typeof res.config.model_reasoning_effort === 'string'
        ? res.config.model_reasoning_effort
        : null
    configDefault = { model, effort }
    emit()
  } catch (error) {
    console.warn('[model] config/read failed', error)
  }
}

/**
 * 当前该显示 / 该发出去的选择。
 * 线程 pending → 线程 latest → config 默认，与 Codex 的解析链同序。
 *
 * **返回值必须是稳定引用。** 这个函数是 useSyncExternalStore 的 getSnapshot：
 * 每次都新建对象会让 React 判定"快照变了"，于是重渲染 → 再取快照 → 又是新对象，
 * 直接把自己转成死循环（实测报 "The result of getSnapshot should be cached"，
 * 紧接着 Maximum update depth exceeded，整个渲染层白屏）。所以这里按
 * (threadId, model, effort) 三元组缓存，值没变就返回同一个对象。
 */
const snapshotCache = new Map<string, ModelSelection>()

export function resolveSelection(threadId: string | null): ModelSelection {
  const pending = threadId != null ? pendingByThread.get(threadId) : undefined
  const latest = threadId != null ? latestByThread.get(threadId) : undefined
  const model = pending?.model ?? latest?.model ?? configDefault.model
  const effort = pending?.effort ?? latest?.effort ?? configDefault.effort
  const key = threadId ?? ''
  const cached = snapshotCache.get(key)
  if (cached != null && cached.model === model && cached.effort === effort) return cached
  const next: ModelSelection = { model, effort }
  snapshotCache.set(key, next)
  return next
}

/** Codex `set-default-model-config-for-host` → `setDefaultModelConfig` */
async function writeConfigDefault(next: ModelSelection): Promise<void> {
  configDefault = next
  emit()
  await rpc.request(M.configBatchWrite, {
    edits: [
      { keyPath: 'model', value: next.model, mergeStrategy: 'upsert' },
      { keyPath: 'model_reasoning_effort', value: next.effort, mergeStrategy: 'upsert' }
    ],
    filePath: null,
    expectedVersion: null,
    // Codex 传 true：写完让已加载的线程热更新到新默认值
    reloadUserConfig: true
  })
}

/** Codex `update-thread-settings-for-next-turn` 的本地等价物 */
function writePendingThreadSettings(threadId: string, next: ModelSelection): void {
  pendingByThread.set(threadId, next)
  emit()
}

/**
 * 选模型 / 选 effort 的统一入口 —— 按 regime 分流。
 * 没有活动线程就落到 config（首页 composer），有线程就落到该线程的下一轮设置。
 */
export function applySelection(
  threadId: string | null,
  patch: Partial<ModelSelection>
): Promise<void> | void {
  const current = resolveSelection(threadId)
  const next: ModelSelection = {
    model: patch.model !== undefined ? patch.model : current.model,
    effort: patch.effort !== undefined ? patch.effort : current.effort
  }
  if (threadId == null) {
    return writeConfigDefault(next).catch((error: unknown) => {
      console.warn('[model] failed to write default model config', error)
    })
  }
  writePendingThreadSettings(threadId, next)
}

/**
 * turn/start 发出之后记账（Codex `e.latestModel = F ?? e.latestModel`）。
 * pending 已经生效，清掉它，之后这个线程读的就是 latest。
 */
export function commitTurnSelection(threadId: string, used: ModelSelection): void {
  latestByThread.set(threadId, used)
  pendingByThread.delete(threadId)
  emit()
}

/** 线程从服务端读回来时把它已有的模型灌进 latest（避免首帧回落到 config 默认） */
export function seedThreadLatest(threadId: string, used: ModelSelection): void {
  if (used.model == null && used.effort == null) return
  latestByThread.set(threadId, used)
  emit()
}
