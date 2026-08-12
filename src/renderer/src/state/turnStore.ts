import type { Entry, Turn, TurnStatus } from '@shared/protocol/entities'
import type { Todo } from '../chat/model/plan'

/**
 * 轮次列表的纯归约逻辑。
 *
 * 从 Provider 里拆出来是因为这部分是整个会话页最容易出错的地方：事件到达顺序
 * 不受控（turn/started 可以早于用户消息回显），而顺序错了用户就会看见自己刚发
 * 的话出现在 agent 的活动下面。放在这里可以脱离 React 直接验证。
 */

/**
 * 渲染用的轮次。
 *
 * 会话页按轮次分组：一轮 = 一条用户消息 + agent 的全部活动 + 最终回答。
 * 轮次结束后要显示耗时、中间活动要能整体折叠，所以边界与时间必须留在数据里，
 * 扁平的条目数组表达不了。
 */
export interface RuntimeTurn {
  id: string
  items: Entry[]
  status: TurnStatus
  startedAtMs: number | null
  completedAtMs: number | null
  /** 轮次级失败原因；仅 status === 'failed' 时有值 */
  error: string | null
  /** 流断开后的重连进度；不在重连中为 null */
  reconnect: ReconnectState | null
  /**
   * 结构化的计划步骤（`turn/plan/updated`）。
   *
   * 与 `plan` 条目是同一份计划的两种投影：条目只有一段文本但能持久化，通知有
   * 每一步的状态但不重放。所以两个都留着，渲染时优先用这一份。
   * 会话重开后为 null，此时退回解析条目文本。
   */
  plan: Todo[] | null
}

export interface ReconnectState {
  attempt: number
  maxAttempts: number
  /** 服务端过载（429）时换一句更准确的话 */
  serverOverloaded: boolean
  /** 本次尝试的失败详情；展开重连行才显示 */
  detail: string | null
}

/**
 * 重连上限。
 *
 * 协议的 error 通知只给 willRetry 布尔值，不带总次数，所以这里跟 CLI 的
 * stream_max_retries 默认值对齐。写死一个数比不显示分母好：用户想知道的是
 * "还会不会自己好"，光看"重连中"答不了这个问题。
 */
export const RECONNECT_MAX_ATTEMPTS = 5

/** 已提交但服务端还没建轮次的本地轮次前缀 */
export const PENDING_TURN = 'pending:'

export function entryId(entry: Entry): string {
  return 'id' in entry && typeof entry.id === 'string' ? entry.id : ''
}

export function toRuntimeTurn(turn: Turn): RuntimeTurn {
  return {
    id: turn.id,
    items: turn.items,
    status: turn.status,
    // 协议给的是秒，UI 一律用毫秒
    startedAtMs: turn.startedAt != null ? turn.startedAt * 1000 : null,
    completedAtMs: turn.completedAt != null ? turn.completedAt * 1000 : null,
    error: turn.error?.message ?? null,
    reconnect: null,
    // 计划由 turn/plan/updated 单独推来，轮次载荷里没有
    plan: null
  }
}

/** 用户消息的去重键：服务端回显会换一个 id，只有 clientId 认得出是同一条 */
function userMessageKey(entry: Entry): string | null {
  return entry.type === 'userMessage' && entry.clientId ? entry.clientId : null
}

/** 同一条目的稳定标识：用户消息优先按 clientId，其余按 id */
function dedupeKey(entry: Entry): string {
  return userMessageKey(entry) ?? entryId(entry)
}

/**
 * 本地乐观轮次：点发送时立刻建出完整的一轮，用户消息就是它的第一条条目。
 *
 * 不这么做，从点发送到 turn/started 回来这段时间界面是没反应的；而如果只把
 * 消息浮在轮次外面，服务端一旦先推来 turn/started，新轮次就会插到它上面。
 */
export function createPendingTurn(
  clientId: string,
  content: Entry & { type: 'userMessage' }
): RuntimeTurn {
  return {
    id: `${PENDING_TURN}${clientId}`,
    items: [content],
    status: 'inProgress',
    startedAtMs: Date.now(),
    completedAtMs: null,
    error: null,
    reconnect: null,
    plan: null
  }
}

/**
 * 把条目并入指定轮次；条目已存在则整体替换。
 *
 * 用户消息额外按 clientId 比对：本地乐观插入的那条和服务端回显的那条 id 不同，
 * 只按 id 去重会留下两个一模一样的气泡。
 *
 * 轮次不存在时优先认领本地乐观轮次，而不是新建一个：条目事件可以早于
 * turn/started 到达，此时新建就会让用户消息和它引发的活动分裂成两块，而那个
 * 乐观轮次再也等不到 turn/started，会永远停在 "Working for…"。
 */
export function upsertItem(turns: RuntimeTurn[], turnId: string, item: Entry): RuntimeTurn[] {
  const key = dedupeKey(item)
  let idx = turns.findIndex((t) => t.id === turnId)
  if (idx === -1) {
    const pendingIdx = turns.findIndex((t) => t.id.startsWith(PENDING_TURN))
    if (pendingIdx === -1) {
      return [
        ...turns,
        {
          id: turnId,
          items: [item],
          status: 'inProgress',
          startedAtMs: Date.now(),
          completedAtMs: null,
          error: null,
          reconnect: null,
          plan: null
        }
      ]
    }
    turns = turns.map((t, i) => (i === pendingIdx ? { ...t, id: turnId } : t))
    idx = pendingIdx
  }
  const turn = turns[idx]
  const itemIdx = turn.items.findIndex((e) => dedupeKey(e) === key)
  const items =
    itemIdx === -1 ? [...turn.items, item] : turn.items.map((e, i) => (i === itemIdx ? item : e))
  const copy = turns.slice()
  copy[idx] = { ...turn, items }
  return copy
}

/**
 * 服务端建好轮次后，把本地乐观轮次并进去。
 *
 * 乐观轮次里已经有用户消息，服务端 turn.items 未必包含它（回显可能稍后单独
 * 推来），所以是"以服务端轮次为准、补回本地独有的条目"，而不是直接替换。
 */
export function adoptPendingTurn(turns: RuntimeTurn[], incoming: RuntimeTurn): RuntimeTurn[] {
  if (turns.some((t) => t.id === incoming.id)) {
    // 已经因为先到的 item 事件建过这一轮：保留已收到的条目，只更新轮次元信息
    return turns.map((t) =>
      t.id === incoming.id
        ? {
            ...incoming,
            items: t.items.length > 0 ? t.items : incoming.items,
            // 服务端的轮次载荷不含计划，直接覆盖会抹掉已收到的 turn/plan/updated
            plan: t.plan ?? incoming.plan
          }
        : t
    )
  }

  const pendingIdx = turns.findIndex((t) => t.id.startsWith(PENDING_TURN))
  if (pendingIdx === -1) return [...turns, incoming]

  const pending = turns[pendingIdx]
  const known = new Set(incoming.items.map(dedupeKey))
  const carried = pending.items.filter((e) => !known.has(dedupeKey(e)))
  const copy = turns.slice()
  copy[pendingIdx] = {
    ...incoming,
    // 本地条目在前：它们是这一轮的用户输入，服务端条目是之后发生的活动
    items: [...carried, ...incoming.items],
    startedAtMs: incoming.startedAtMs ?? pending.startedAtMs,
    plan: pending.plan ?? incoming.plan
  }
  return copy
}

/**
 * 轮次级计划（`turn/plan/updated`）。
 *
 * 整份替换而不是合并：通知每次都带完整的 plan 数组，它表达的是"计划现在长
 * 这样"，不是增量。轮次不存在就丢弃——计划总是在轮次里产生的，收到孤立的
 * 计划说明是别的会话的事件漏了过来。
 */
export function setTurnPlan(turns: RuntimeTurn[], turnId: string, plan: Todo[]): RuntimeTurn[] {
  if (!turns.some((t) => t.id === turnId)) return turns
  return turns.map((t) => (t.id === turnId ? { ...t, plan } : t))
}

/**
 * 轮次完成：耗时以服务端为准，缺失时退回客户端墙钟。
 *
 * 失败时保留重连进度。"Reconnecting 5/5" 加上错误说明的是"重试到上限才放弃"，
 * 只留错误会让人以为一次都没试过。成功收尾则撤掉——那时它已经没有信息量。
 */
export function completeTurn(turns: RuntimeTurn[], done: RuntimeTurn): RuntimeTurn[] {
  return turns.map((t) =>
    t.id === done.id
      ? {
          ...t,
          status: done.status,
          startedAtMs: t.startedAtMs ?? done.startedAtMs,
          completedAtMs: done.completedAtMs ?? Date.now(),
          error: done.error,
          reconnect: done.status === 'failed' ? t.reconnect : null
        }
      : t
  )
}

/**
 * 流断开重连。
 *
 * 重连中不改轮次状态：它还在跑，只是连接掉了。把进度挂在轮次上而不是全局，
 * 是因为后台还可能有别的会话在跑，全局横幅说不清是谁在重连。
 */
export function markReconnecting(
  turns: RuntimeTurn[],
  turnId: string,
  serverOverloaded: boolean,
  detail: string | null
): RuntimeTurn[] {
  return turns.map((t) =>
    t.id === turnId
      ? {
          ...t,
          reconnect: {
            attempt: Math.min((t.reconnect?.attempt ?? 0) + 1, RECONNECT_MAX_ATTEMPTS),
            maxAttempts: RECONNECT_MAX_ATTEMPTS,
            serverOverloaded,
            // 只留最后一次的详情：几次重试的报错通常一模一样，堆起来没有信息量
            detail: detail ?? t.reconnect?.detail ?? null
          }
        }
      : t
  )
}

/** 重连成功（又收到条目了）：撤掉进度指示 */
export function clearReconnecting(turns: RuntimeTurn[], turnId: string): RuntimeTurn[] {
  if (!turns.some((t) => t.id === turnId && t.reconnect != null)) return turns
  return turns.map((t) => (t.id === turnId ? { ...t, reconnect: null } : t))
}
