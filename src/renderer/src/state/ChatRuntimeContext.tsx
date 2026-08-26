/* eslint-disable react-refresh/only-export-components -- Context 文件：Provider 与 hook 同文件是标准模式 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { rpc } from '../rpc/client'
import { useWorkspace } from './WorkspaceContext'
import {
  adoptPendingTurn,
  clearReconnecting,
  completeTurn,
  createPendingTurn,
  entryId,
  markReconnecting,
  PENDING_TURN,
  setTurnPlan,
  toRuntimeTurn,
  upsertItem,
  type RuntimeTurn
} from './turnStore'
import { M } from '@shared/protocol/methods'
import { registerApprovalOwner } from './approvalBus'
import { dispatchHostMessage } from '../host/hostMessages'
import { commitTurnSelection, resolveSelection } from './modelSelection'
import {
  commitTurnPermissions,
  resolvePermissions,
  resolvePolicy,
  seedThreadPermissions,
  threadPermissionFields,
  turnPermissionFields
} from './permissionSelection'
import { toApprovalResponse, toPendingApproval } from '../chat/adapter/approval'
import type { ApprovalDecision, PendingApproval } from '../chat/model/approval'
import type { Todo, TodoStatus } from '../chat/model/plan'
import type { Chat, Entry, Turn, UserInput } from '@shared/protocol/entities'

/** 一次轮次的运行状态，驱动发送按钮在"发送/停止"之间切换 */
export type TurnPhase = 'idle' | 'running'

/**
 * 排队中的 follow-up(Codex queued-message-list 的消息形状裁剪版:
 * 附件/批注上下文随 M4 接入,当前只有文本)。
 *
 * Codex 的队列本体在桌面宿主层维护(不经 app-server),提交时才走协议:
 * 出队 = `turn/start`,Send now = `turn/steer`。这里同样把队列放在
 * 渲染层运行时里,协议零改动。
 */
export interface QueuedFollowUp {
  id: string
  text: string
  /** 发送失败后被暂停(Codex `pausedReason` → 行内 Retry);正常排队为 null */
  pausedReason: 'failed' | null
}

interface ChatRuntimeValue {
  /** 当前打开的会话 id；null = 首页 */
  activeChatId: string | null
  turns: RuntimeTurn[]
  /** 等用户决策的审批，按条目 id 索引 */
  approvals: ReadonlyMap<string, PendingApproval>
  phase: TurnPhase
  loading: boolean
  /** 只读：会话可以看但不能发（被其他客户端占用，或供应商未配置） */
  readOnly: boolean
  readOnlyReason: string | null
  error: string | null
  openChat(chatId: string): void
  closeChat(): void
  /**
   * 发送一轮。接受协议的 UserInput 序列(文本段 + skill/mention 变体,
   * 由 Composer 的 ProseMirror 文档序列化而来);纯字符串自动包成单文本段。
   */
  sendMessage(input: UserInput[] | string): Promise<void>
  startChat(params: StartChatParams): Promise<string>
  interrupt(): Promise<void>
  /**
   * 运行中提交 follow-up(Codex 的 Steer):不打断当前轮次,把输入注入活动轮。
   * 对应协议的 `turn/steer`,需要当前活动轮次的真实 id 作前置条件。
   */
  steer(input: UserInput[] | string): Promise<void>
  /** 排队中的 follow-up(Codex `queued-follow-ups`);按提交顺序排列 */
  queuedFollowUps: QueuedFollowUp[]
  /** 队列被 interrupt 暂停(Codex `isInterrupted`,面板显示 banner + Resume) */
  queueInterrupted: boolean
  /** followUpQueueMode='queue' 时的运行中提交入口 */
  enqueueFollowUp(text: string): void
  deleteQueuedMessage(id: string): void
  /** dnd 重排(Codex `onReorderMessages`,arrayMove 语义) */
  reorderQueuedMessages(activeId: string, overId: string): void
  /** Codex "Send now":出队并立即 steer(运行中)或 turn/start */
  sendQueuedMessageNow(id: string): Promise<void>
  /** Codex "Edit message":出队并返回文本,由 Composer 回填输入框 */
  editQueuedMessage(id: string): string | null
  /** Codex "Resume"(Queue paused because you interrupted) */
  resumeInterruptedQueue(): void
  /**
   * 编辑一条已发送的用户消息:回滚到该轮(含)并拿编辑后的文本重新发起。
   * 对应 Codex 的 `onEditUserMessage`(仅最新一轮、且不在运行中才可编辑)。
   */
  editUserMessage(turnId: string, text: string): Promise<void>
  /** 回答一条审批。key 取自 `PendingApproval.requestKey` */
  respondToApproval(requestKey: string, decision: ApprovalDecision): void
}

export interface StartChatParams {
  /** 首条消息的协议输入(文本段 + skill/mention 变体) */
  input: UserInput[]
  cwd: string
  /**
   * 运行时工作区根(Codex `workspaceRoots`):有项目就是项目根,无项目为空。
   * 随权限档一起展开进 thread/start 与之后每一轮的 turn/start。
   */
  roots: string[]
}

/** 纯字符串 → 单文本段输入(队列等纯文本路径用) */
function toUserInputs(input: UserInput[] | string): UserInput[] {
  return typeof input === 'string' ? [{ type: 'text', text: input, text_elements: [] }] : input
}

export type { RuntimeTurn } from './turnStore'

/** 429 / 服务端过载：文案要说"服务器忙"，而不是泛泛的"重连中" */
function isOverloaded(info: unknown): boolean {
  if (info === 'serverOverloaded') return true
  if (typeof info !== 'object' || info == null) return false
  const disconnected = (info as Record<string, { httpStatusCode?: number | null }>)
    .responseStreamDisconnected
  return disconnected?.httpStatusCode === 429
}

/*
 * fork 回来的会话(side chat):ephemeral 会话不落盘,resume 会报 "no rollout found"。
 * 调用方在 fork 成功后先登记到这里,运行时绑定时直接 seed,不走 resume。
 * 注意 side chat 的 fork 带 `excludeTurns: true`(Codex 同),响应里 turns 恒为空 ——
 * 继承的父线程历史只在模型侧可见,UI 从空白开始。
 * (模块级:登记发生在 fork 完成的事件里,不在渲染期 —— lint 友好。)
 */
const pendingThreadSeeds = new Map<string, Chat>()

/** fork 成功后的登记入口(sideChat 打开流程调用) */
export function seedForkedThread(thread: Chat): void {
  pendingThreadSeeds.set(thread.id, thread)
}

/** 协议的步骤状态 → 上游 todo 的三态。名字不同，语义一一对应 */
const PLAN_STATUS: Record<string, TodoStatus> = {
  pending: 'not-started',
  inProgress: 'in-progress',
  completed: 'completed'
}

/** 一个条目在本帧内累积的增量。推理的 summary/content 分段带下标，不能只存字符串 */
interface PendingDelta {
  text: string
  summary: Map<number, string>
  content: Map<number, string>
}

function bufferFor(map: Map<string, PendingDelta>, itemId: string): PendingDelta {
  let buf = map.get(itemId)
  if (!buf) {
    buf = { text: '', summary: new Map(), content: new Map() }
    map.set(itemId, buf)
  }
  return buf
}

/** 把按下标累积的分段增量并入原数组，缺位补空串 */
function mergeIndexed(base: string[], deltas: Map<number, string>): string[] {
  if (deltas.size === 0) return base
  const max = Math.max(base.length - 1, ...deltas.keys())
  const out: string[] = []
  for (let i = 0; i <= max; i++) out.push((base[i] ?? '') + (deltas.get(i) ?? ''))
  return out
}

function applyDelta(entry: Entry, buf: PendingDelta): Entry {
  if (entry.type === 'agentMessage') return { ...entry, text: entry.text + buf.text }
  if (entry.type === 'commandExecution') {
    return { ...entry, aggregatedOutput: (entry.aggregatedOutput ?? '') + buf.text }
  }
  if (entry.type === 'reasoning') {
    return {
      ...entry,
      summary: mergeIndexed(entry.summary, buf.summary),
      content: mergeIndexed(entry.content, buf.content)
    }
  }
  return entry
}

/**
 * 会话运行时核心 —— 主会话(ChatRuntimeProvider)与 side chat
 * (SideChatRuntimeProvider)共用。只关心"绑定某个会话 id"的全部运行时:
 * 事件订阅(按 threadId 过滤)、delta 缓冲、审批、resume/退订、发消息。
 *
 * 多实例并存的关键约束:
 * - 审批经 approvalBus 按 threadId 路由(rpc.onServerRequest 单方法单处理器,
 *   各自注册会互相覆盖)。
 * - 通知类(rpc.on)天然多播,两个实例各取自己的 threadId,互不干扰。
 */
function useChatRuntimeCore(chatId: string | null): {
  turns: RuntimeTurn[]
  approvals: ReadonlyMap<string, PendingApproval>
  phase: TurnPhase
  loading: boolean
  readOnly: boolean
  readOnlyReason: string | null
  error: string | null
  sendMessage(input: UserInput[] | string): Promise<void>
  interrupt(): Promise<void>
  steer(input: UserInput[] | string): Promise<void>
  queuedFollowUps: QueuedFollowUp[]
  queueInterrupted: boolean
  enqueueFollowUp(text: string): void
  deleteQueuedMessage(id: string): void
  reorderQueuedMessages(activeId: string, overId: string): void
  sendQueuedMessageNow(id: string): Promise<void>
  editQueuedMessage(id: string): string | null
  resumeInterruptedQueue(): void
  /** 编辑一条已发送的用户消息(回滚该轮起 + 重发) */
  editUserMessage(turnId: string, text: string): Promise<void>
  respondToApproval(requestKey: string, decision: ApprovalDecision): void
  /**
   * 指定线程发起一轮(不依赖已绑定的 activeChatId)。
   * 新建会话的第一轮必须走这条:此刻 chatId state 还没刷新。
   */
  startTurn(threadId: string, input: UserInput[] | string): Promise<void>
  /**
   * 认领一个刚新建的会话:**同步**绑定事件归属(activeRef)并标记为无历史。
   *
   * 两件事都是必需的:
   * - 同步绑定:turn/start 之后的 item/* 通知按 `threadId === activeRef.current`
   *   过滤,等 chatId effect 跑完再绑就会丢掉开头的事件。
   * - 标记无历史:resume 会清掉乐观追加的 pending turn,新会话也没有历史可读。
   */
  adoptNewChat(threadId: string): void
} {
  const [turns, setTurns] = useState<RuntimeTurn[]>([])
  const [approvals, setApprovals] = useState<ReadonlyMap<string, PendingApproval>>(new Map())
  const [phase, setPhase] = useState<TurnPhase>('idle')
  const [loading, setLoading] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [readOnlyReason, setReadOnlyReason] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /*
   * follow-up 队列(Codex 宿主层队列的 WS 等价物)。
   * state 供渲染,ref 供事件回调(turn/completed 的消费循环注册一次,
   * 闭包里读 state 会拿到旧快照 —— 与 approvals 的双副本同理)。
   */
  const [queuedFollowUps, setQueuedFollowUps] = useState<QueuedFollowUp[]>([])
  const [queueInterrupted, setQueueInterrupted] = useState(false)
  const queueRef = useRef<QueuedFollowUp[]>([])
  const interruptedRef = useRef(false)
  /* 消费循环定义在订阅 effect 之后(它依赖 startTurn),回调经 ref 调用,
   * 避免在 deps 里引用未初始化的 const(TDZ)。 */
  const consumeQueueRef = useRef<() => void>(() => {})
  useEffect(() => {
    queueRef.current = queuedFollowUps
  }, [queuedFollowUps])
  useEffect(() => {
    interruptedRef.current = queueInterrupted
  }, [queueInterrupted])

  // 绑定会话 id 的即时副本:通知回调在闭包里读它,避免因 state 未刷新而误判
  // 事件归属。切换会话的入口都会同步写这个 ref,不在 render 期间赋值。
  const activeRef = useRef<string | null>(chatId)
  // 上一次绑定的会话(卸载/切换时退订)
  const previousRef = useRef<string | null>(null)
  // 新建会话(adoptNewChat):跳过 resume
  const freshRef = useRef<Set<string>>(new Set())
  /*
   * fork seed 的 StrictMode 安全容器:首次 effect 从模块表取出后存 ref
   * (重放的第二次 setup 还能拿到),不随 replay 丢失。
   */
  const seededChatRef = useRef<Chat | null>(null)

  /*
   * 未应答的反向请求。
   *
   * 与上面那份 state 是同一批审批的两个副本,各有各的用处:state 供渲染,
   * 这个 ref 存 resolve 回调。回调不能进 state——它不是数据,放进去会让每次
   * setState 都产生新引用而白白重渲染整棵树。
   *
   * 用 ref 还有第二个理由:撤销审批的几个入口(切换会话、轮次收尾、卸载)
   * 都在闭包里被调用,读 state 会拿到注册时的旧快照。
   */
  const approvalReplies = useRef(
    new Map<string, { pending: PendingApproval; reply: (d: ApprovalDecision) => void }>()
  )

  const pendingDeltas = useRef(new Map<string, PendingDelta>())
  const flushHandle = useRef<number | null>(null)

  const flushDeltas = useCallback(() => {
    flushHandle.current = null
    const batch = pendingDeltas.current
    if (batch.size === 0) return
    pendingDeltas.current = new Map()
    setTurns((prev) =>
      prev.map((turn) => {
        let touched = false
        const items = turn.items.map((e) => {
          const buf = batch.get(entryId(e))
          if (!buf) return e
          touched = true
          return applyDelta(e, buf)
        })
        return touched ? { ...turn, items } : turn
      })
    )
  }, [])

  const schedule = useCallback(() => {
    if (flushHandle.current === null) {
      flushHandle.current = requestAnimationFrame(flushDeltas)
    }
  }, [flushDeltas])

  const queueDelta = useCallback(
    (itemId: string, delta: string) => {
      bufferFor(pendingDeltas.current, itemId).text += delta
      schedule()
    },
    [schedule]
  )

  const queueIndexedDelta = useCallback(
    (itemId: string, field: 'summary' | 'content', index: number, delta: string) => {
      const map = bufferFor(pendingDeltas.current, itemId)[field]
      map.set(index, (map.get(index) ?? '') + delta)
      schedule()
    },
    [schedule]
  )

  /**
   * 回答一条审批。
   *
   * 先撤 UI 再应答:按钮点下去到 agent 真正动起来之间有一段网络往返,这期间
   * 按钮还在那里会让人以为没点上,连点两下就成了两次应答。
   *
   * 幂等:requestKey 已经不在表里就什么都不做,所以重复调用(连点、以及轮次
   * 收尾时的批量 cancel)是安全的。
   */
  const respondToApproval = useCallback((requestKey: string, decision: ApprovalDecision): void => {
    const entry = approvalReplies.current.get(requestKey)
    if (!entry) return
    approvalReplies.current.delete(requestKey)
    setApprovals((prev) => {
      const next = new Map(prev)
      next.delete(entry.pending.itemId)
      return next
    })
    entry.reply(decision)
  }, [])

  /** 批量放弃:切换会话、轮次收尾时用。`turnId` 为 null 表示全部 */
  const cancelApprovals = useCallback(
    (turnId: string | null): void => {
      for (const { pending } of [...approvalReplies.current.values()]) {
        if (turnId === null || pending.turnId === turnId) {
          respondToApproval(pending.requestKey, 'cancel')
        }
      }
    },
    [respondToApproval]
  )

  /*
   * 服务端反向请求:审批。经 approvalBus 注册 owner(总线按 threadId 路由到本运行时);
   * 无人认领的由总线 cancel(维持"后台会话审批立刻回掉"的原行为)。
   *
   * 与通知不同,这里**必须应答**——不答 agent 就停在那一步,既不报错也不推进,
   * 对用户表现为"卡住了"。组件卸载时把还挂着的全部 cancel 掉。
   */
  useEffect(() => {
    const replies = approvalReplies.current
    const offBus = registerApprovalOwner({
      getThreadId: () => activeRef.current,
      handle: (method, params) => {
        const pending = toPendingApproval(method, params)
        if (!pending) return Promise.resolve(toApprovalResponse('cancel'))
        return new Promise((resolve) => {
          replies.set(pending.requestKey, {
            pending,
            reply: (decision) => resolve(toApprovalResponse(decision))
          })
          setApprovals((prev) => new Map(prev).set(pending.itemId, pending))
        })
      }
    })
    return () => {
      offBus()
      for (const { reply } of replies.values()) {
        reply('cancel')
      }
      replies.clear()
    }
  }, [])

  // 订阅会话事件流。只处理绑定会话的通知——其他会话可能在后台跑,
  // 它们的事件与本视图无关。
  useEffect(() => {
    const mine = (p: unknown): boolean =>
      (p as { threadId?: string }).threadId === activeRef.current

    const onItem = (p: unknown, final: boolean): void => {
      const { item, turnId } = p as { item: Entry; turnId: string }
      if (final) pendingDeltas.current.delete(entryId(item))
      // 又收到条目 = 流恢复了
      setTurns((prev) => upsertItem(clearReconnecting(prev, turnId), turnId, item))
    }

    const offs = [
      rpc.on('item/started', (p) => {
        if (mine(p)) onItem(p, false)
      }),
      rpc.on('item/completed', (p) => {
        if (mine(p)) onItem(p, true)
      }),
      rpc.on('item/agentMessage/delta', (p) => {
        if (!mine(p)) return
        const { itemId, delta } = p as { itemId: string; delta: string }
        queueDelta(itemId, delta)
      }),
      rpc.on('item/commandExecution/outputDelta', (p) => {
        if (!mine(p)) return
        const { itemId, delta } = p as { itemId: string; delta: string }
        queueDelta(itemId, delta)
      }),
      rpc.on('item/reasoning/summaryTextDelta', (p) => {
        if (!mine(p)) return
        const { itemId, delta, summaryIndex } = p as {
          itemId: string
          delta: string
          summaryIndex: number
        }
        queueIndexedDelta(itemId, 'summary', summaryIndex ?? 0, delta)
      }),
      rpc.on('item/reasoning/textDelta', (p) => {
        if (!mine(p)) return
        const { itemId, delta, contentIndex } = p as {
          itemId: string
          delta: string
          contentIndex: number
        }
        queueIndexedDelta(itemId, 'content', contentIndex ?? 0, delta)
      }),
      rpc.on('turn/started', (p) => {
        if (!mine(p)) return
        const { turn } = p as { turn: Turn }
        setTurns((prev) => adoptPendingTurn(prev, toRuntimeTurn(turn)))
        setPhase('running')
        setError(null)
      }),
      rpc.on('turn/completed', (p) => {
        if (!mine(p)) return
        const { turn } = p as { turn: Turn }
        setTurns((prev) => completeTurn(prev, toRuntimeTurn(turn)))
        /*
         * 轮次结束了还挂着的审批一律撤掉。
         *
         * 正常流程里 agent 会在轮次收尾前自己解掉这些请求,但轮次被中断或失败
         * 时不一定。协议有 `serverRequest/resolved` 通知专治这个,可惜它按
         * agent 的 requestId 索引,而主进程的 RpcRouter 转发时用的是自己生成的
         * id——渲染层拿不到那个 requestId,对不上。按轮次清是能对得上的那个粒度。
         */
        cancelApprovals(turn.id)
        // 轮次自己带上了失败原因就撤掉全局横幅,否则同一条错误会显示两遍
        if (turn.error?.message) setError(null)
        setPhase('idle')
        // Codex 队列消费:当前轮结束,自动发下一条排队的 follow-up
        consumeQueueRef.current()
      }),
      rpc.on('turn/plan/updated', (p) => {
        if (!mine(p)) return
        const { turnId, plan } = p as {
          turnId: string
          plan: { step: string; status: 'pending' | 'inProgress' | 'completed' }[]
        }
        const todos: Todo[] = plan.map((s) => ({
          title: s.step,
          status: PLAN_STATUS[s.status] ?? 'not-started'
        }))
        setTurns((prev) => setTurnPlan(prev, turnId, todos))
      }),
      rpc.on('error', (p) => {
        const {
          error: err,
          willRetry,
          turnId
        } = p as {
          error?: { message?: string; codexErrorInfo?: unknown; additionalDetails?: string | null }
          willRetry?: boolean
          turnId?: string
        }
        if (!mine(p)) return

        // 还会重试就不是终态:把它渲染成轮次内的重连进度,而不是一条报错。
        // 断流大多能自己恢复,先弹红字会让用户以为白跑了一轮。
        if (willRetry && turnId) {
          setTurns((prev) =>
            markReconnecting(
              prev,
              turnId,
              isOverloaded(err?.codexErrorInfo),
              err?.additionalDetails?.trim() || err?.message?.trim() || null
            )
          )
          return
        }
        if (err?.message) setError(err.message)
      })
    ]
    return () => offs.forEach((off) => off())
  }, [cancelApprovals, queueDelta, queueIndexedDelta])

  // 切换会话前把上一个会话未答的审批全部撤掉:那些工具调用马上就要从界面上
  // 消失,留着未应答的请求等于让 agent 无限期停在那里
  const resetView = useCallback((): void => {
    cancelApprovals(null)
    setApprovals(new Map())
    setTurns([])
    setError(null)
    setReadOnly(false)
    setReadOnlyReason(null)
  }, [cancelApprovals])

  const adoptNewChat = useCallback((threadId: string): void => {
    freshRef.current.add(threadId)
    // 同步绑定:第一轮的通知在 chatId effect 之前就可能到
    activeRef.current = threadId
  }, [])

  /*
   * chatId 变化 = 绑定切换:重置视图 → 退订上一个 → resume 新的
   * (加载历史 + 订阅事件 + 若正在跑则重新加入;拆 read + resume 会丢
   * 两次调用之间的事件)。
   */
  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = chatId
    if (previous && previous !== chatId) {
      rpc.request(M.chatUnsubscribe, { threadId: previous }).catch(() => {})
    }
    activeRef.current = chatId
    /*
     * 新建会话(adoptNewChat)已经同步绑定并乐观追加了第一轮 ——
     * 这里既不能 resetView(会把那一轮清掉,表现为"发出去的消息消失了"),
     * 也没有历史可 resume。
     */
    if (chatId != null && freshRef.current.has(chatId)) {
      freshRef.current.delete(chatId)
      return
    }
    resetView()
    if (chatId == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 同上：解绑时同步复位
      setPhase('idle')
      return
    }
    // fork 回来的会话(side chat):seed 历史,不 resume(ephemeral 不落盘,resume 会报
    // "no rollout found")。seed 从模块表取一次进 ref,StrictMode 重放不丢。
    if (seededChatRef.current == null) {
      const seed = pendingThreadSeeds.get(chatId)
      if (seed != null) {
        pendingThreadSeeds.delete(chatId)
        seededChatRef.current = seed
      }
    }
    const seed = seededChatRef.current
    if (seed != null && seed.id === chatId) {
      pendingThreadSeeds.delete(chatId)

      setTurns(seed.turns.map(toRuntimeTurn))

      setPhase(seed.status.type === 'active' ? 'running' : 'idle')
      return
    }
    setLoading(true)
    const apply = (thread: Chat): void => {
      setTurns(thread.turns.map(toRuntimeTurn))
      setPhase(thread.status.type === 'active' ? 'running' : 'idle')
    }
    rpc
      .request<{ thread: Chat }>(M.chatResume, { threadId: chatId })
      .then((res) => {
        if (activeRef.current !== chatId) return
        apply(res.thread)
      })
      .catch(async (err: unknown) => {
        if (activeRef.current !== chatId) return
        const message = err instanceof Error ? err.message : String(err)

        // resume 会加载会话的完整运行配置,有两类常见失败与"会话本身"无关:
        //   1. 被其他客户端(命令行、另一个窗口)持有写锁
        //   2. 会话记录的模型供应商在当前配置里不存在(由别的客户端创建)
        // 这两种都能用 thread/read 只读取回历史——它不加载运行配置也不抢锁。
        // 直接抛错会让这些会话彻底打不开,看起来像数据损坏。
        const recoverable = /active writer|model provider .* not found/i.test(message)
        if (!recoverable) {
          setError(message)
          return
        }
        try {
          const res = await rpc.request<{ thread: Chat }>(M.chatRead, {
            threadId: chatId,
            includeTurns: true
          })
          if (activeRef.current !== chatId) return
          apply(res.thread)
          setReadOnly(true)
          setReadOnlyReason(
            /active writer/i.test(message)
              ? 'This chat is open in another client — showing history in read-only mode.'
              : 'This chat was created with a model provider that is not configured — showing history in read-only mode.'
          )
        } catch (readErr: unknown) {
          if (activeRef.current !== chatId) return
          setError(readErr instanceof Error ? readErr.message : String(readErr))
        }
      })
      .finally(() => {
        if (activeRef.current === chatId) setLoading(false)
      })
  }, [chatId, resetView])

  // 卸载时退订当前会话(side chat 关 tab 的场景)
  useEffect(() => {
    return () => {
      const current = previousRef.current
      if (current) rpc.request(M.chatUnsubscribe, { threadId: current }).catch(() => {})
    }
  }, [])

  const startTurn = useCallback(
    async (threadId: string, input: UserInput[] | string): Promise<void> => {
      const inputs = toUserInputs(input)
      const clientId = crypto.randomUUID()
      const pending = createPendingTurn(clientId, {
        type: 'userMessage',
        id: `${PENDING_TURN}${clientId}`,
        clientId,
        content: inputs
      })
      setTurns((prev) => [...prev, pending])
      setPhase('running')
      /*
       * model / effort 必须随每一轮下发 —— Codex 的 turn/start 载荷里
       * `model: F, effort: I` 是常驻字段，解析链是
       *   本次覆盖 ?? 线程 pending ?? 线程 latest（新线程为 null，服务端落回 config）
       * 漏掉它们的后果不是"用默认模型"这么轻：picker 变成纯装饰，用户选了别的
       * 模型也照旧用 config 里那个，而界面显示的是他选的那个。
       */
      const selection = resolveSelection(threadId)
      /*
       * 权限档同理，而且比 model 更要紧：选了 "Ask for approval" 却不下发
       * approvalPolicy，agent 根本不会来问 —— 菜单就是个装饰。
       *
       * 展开顺序逐字对齐 Codex 的 composer 首轮路径（产物 `JWs`，
       * shouldSendPermissionOverrides 为真时）：
       *   O = tu(agentMode, roots, config)
       *   { approvalPolicy: O.approvalPolicy, approvalsReviewer: O.approvalsReviewer,
       *     ...Fme(O),                                   // 有档案 → permissions: <id>
       *     ...(O.activePermissionProfile == null ? {} : { runtimeWorkspaceRoots: Ime(O) }) }
       * 注意**有权限档案时不发 sandboxPolicy**（`Fme` 是二选一，大载荷构造器里
       * 也是 `sandboxPolicy: me == null && he ? le : null`）。两个都发会互相打架。
       */
      const permissions = resolvePermissions(threadId)
      try {
        await rpc.request(M.turnStart, {
          threadId,
          input: inputs,
          clientUserMessageId: clientId,
          model: selection.model,
          effort: selection.effort,
          ...turnPermissionFields(resolvePolicy(permissions.mode, permissions.roots)),
          /*
           * Codex 里这两个是常驻字段：`multiAgentMode: SRt` 是常量
           * `explicitRequestOnly`（产物 108542），`outputSchema` 无结构化输出时为 null。
           */
          multiAgentMode: 'explicitRequestOnly',
          outputSchema: null
        })
        // Codex `e.latestModel = F ?? e.latestModel`：发出去之后这一轮的值成为线程的 latest
        commitTurnSelection(threadId, selection)
        commitTurnPermissions(threadId, permissions)
      } catch (err) {
        setTurns((prev) => prev.filter((t) => t.id !== pending.id))
        setPhase('idle')
        throw err
      }
    },
    []
  )

  const sendMessage = useCallback(
    async (input: UserInput[] | string): Promise<void> => {
      const id = activeRef.current
      if (!id) throw new Error('No active chat')
      await startTurn(id, input)
    },
    [startTurn]
  )

  const interrupt = useCallback(async (): Promise<void> => {
    const id = activeRef.current
    if (!id) return
    /*
     * Codex:interrupt 暂停队列(“Queue paused because you interrupted”)。
     * 必须在 rpc 之前置标志 —— 服务端一收到 interrupt 就推 turn/completed,
     * 等 rpc 返回再置,消费循环会在标志生效前把队列排空。
     * interruptedRef 同步改,不经 effect。
     */
    if (queueRef.current.length > 0) {
      setQueueInterrupted(true)
      interruptedRef.current = true
    }
    await rpc.request(M.turnInterrupt, { threadId: id })
    setPhase('idle')
  }, [])

  /**
   * Codex `turn/steer`:运行中带着文字提交 = 把 follow-up 转向进活动轮。
   * 前置条件是活动轮次的真实 id(`expectedTurnId`)——turn/started 还没到
   * (本地 pending 轮)时没有可 steer 的目标,直接抛错,调用方负责把文本
   * 还给输入框。
   */
  const steer = useCallback(
    async (input: UserInput[] | string): Promise<void> => {
      const id = activeRef.current
      if (!id) throw new Error('No active chat')
      const activeTurn = [...turns]
        .reverse()
        .find((t) => !t.id.startsWith(PENDING_TURN) && t.status === 'inProgress')
      if (!activeTurn) throw new Error('No active turn to steer')
      await rpc.request(M.turnSteer, {
        threadId: id,
        input: toUserInputs(input),
        clientUserMessageId: crypto.randomUUID(),
        expectedTurnId: activeTurn.id
      })
    },
    [turns]
  )

  /* ==================== follow-up 队列(Codex queued-follow-ups) ==================== */

  // 事件回调在 mount 时注册一次,经 ref 拿最新动作/状态,避免闭包快照
  const startTurnRef = useRef(startTurn)
  const steerRef = useRef(steer)
  const phaseRef = useRef(phase)
  const turnsRef = useRef(turns)
  useEffect(() => {
    startTurnRef.current = startTurn
  }, [startTurn])
  useEffect(() => {
    steerRef.current = steer
  }, [steer])
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  useEffect(() => {
    turnsRef.current = turns
  }, [turns])

  /**
   * 出队消费 —— Codex 的队列消费循环:轮次结束且队列未暂停时自动发下一条。
   * 发送失败的消息回队首并标 pausedReason(面板行内 Retry)。
   */
  const consumeQueue = useCallback((): void => {
    if (interruptedRef.current) return
    const [next, ...rest] = queueRef.current
    if (!next) return
    const threadId = activeRef.current
    if (!threadId) return
    setQueuedFollowUps(rest)
    startTurnRef.current(threadId, next.text).catch(() => {
      setQueuedFollowUps((prev) => [{ ...next, pausedReason: 'failed' }, ...prev])
    })
  }, [])
  useEffect(() => {
    consumeQueueRef.current = consumeQueue
  }, [consumeQueue])

  const enqueueFollowUp = useCallback((text: string): void => {
    setQueuedFollowUps((prev) => [...prev, { id: crypto.randomUUID(), text, pausedReason: null }])
  }, [])

  const deleteQueuedMessage = useCallback((id: string): void => {
    setQueuedFollowUps((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const reorderQueuedMessages = useCallback((activeId: string, overId: string): void => {
    setQueuedFollowUps((prev) => {
      const from = prev.findIndex((m) => m.id === activeId)
      const to = prev.findIndex((m) => m.id === overId)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  /**
   * Codex "Send now"(tooltip 原文 "Submit without interrupting the model"):
   * 出队,运行中走 steer,空闲走 turn/start;失败回队首 + pausedReason。
   */
  const sendQueuedMessageNow = useCallback(async (id: string): Promise<void> => {
    const msg = queueRef.current.find((m) => m.id === id)
    const threadId = activeRef.current
    if (!msg || !threadId) return
    setQueuedFollowUps((prev) => prev.filter((m) => m.id !== id))
    try {
      if (phaseRef.current === 'running') await steerRef.current(msg.text)
      else await startTurnRef.current(threadId, msg.text)
    } catch {
      setQueuedFollowUps((prev) => [{ ...msg, pausedReason: 'failed' }, ...prev])
    }
  }, [])

  /** Codex "Edit message":出队并返回文本,由 Composer 回填输入框 */
  const editQueuedMessage = useCallback((id: string): string | null => {
    const msg = queueRef.current.find((m) => m.id === id)
    if (!msg) return null
    setQueuedFollowUps((prev) => prev.filter((m) => m.id !== id))
    return msg.text
  }, [])

  /** Codex "Resume"(“Queue paused because you interrupted” 的恢复键) */
  const resumeInterruptedQueue = useCallback((): void => {
    setQueueInterrupted(false)
    // interruptedRef 正常由 effect 同步,这里先改再消费,不等下一帧
    interruptedRef.current = false
    consumeQueue()
  }, [consumeQueue])

  /*
   * Codex `onEditUserMessage`:编辑一条已发送的用户消息。
   * 语义 = 从该轮(含)开始回滚 + 拿新文本重新发起一轮。
   * 入口侧已保证只有最新一轮、且不在运行中可编辑(见 ThreadUserMessage 的 gating)。
   */
  const editUserMessage = useCallback(async (turnId: string, text: string): Promise<void> => {
    const threadId = activeRef.current
    if (!threadId) throw new Error('No active chat')
    const idx = turnsRef.current.findIndex((t) => t.id === turnId)
    if (idx === -1) throw new Error(`No such turn: ${turnId}`)
    await rpc.request(M.chatRollback, {
      threadId,
      numTurns: turnsRef.current.length - idx
    })
    setTurns((prev) => prev.slice(0, idx))
    await startTurnRef.current(threadId, text)
  }, [])

  return {
    turns,
    approvals,
    phase,
    loading,
    readOnly,
    readOnlyReason,
    error,
    sendMessage,
    interrupt,
    steer,
    queuedFollowUps,
    queueInterrupted,
    enqueueFollowUp,
    deleteQueuedMessage,
    reorderQueuedMessages,
    sendQueuedMessageNow,
    editQueuedMessage,
    resumeInterruptedQueue,
    editUserMessage,
    respondToApproval,
    startTurn,
    adoptNewChat
  }
}

/* ==================== 主会话(全局唯一,activeChatId 驱动) ==================== */

const ChatRuntimeContext = createContext<ChatRuntimeValue | null>(null)

export function ChatRuntimeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const core = useChatRuntimeCore(activeChatId)

  /*
   * 未读清除 —— Codex 的 hasUnreadTurn 在查看后清除。
   * WorkspaceProvider 在 ChatRuntimeProvider **外面**,拿不到 activeChatId,
   * 所以反过来由这里同步:打开(或关闭)会话时回写未读判定源。
   */
  const { noteActiveChat } = useWorkspace()
  useEffect(() => {
    noteActiveChat(activeChatId)
  }, [activeChatId, noteActiveChat])

  /*
   * 打开/关闭会话都是一次**导航**，所以要顺手离开设置路由 —— 否则进了
   * /settings 之后点侧栏任何一条会话，路由还停在设置页，界面看起来卡住了。
   *
   * Codex 里这件事是路由自带的：点会话是 `navigate('/c/<id>')`，离开 /settings
   * 是导航的副产品。本项目还没有会话路由（主区靠 activeChatId 切视图），
   * 所以这里显式把路由退回非设置路径，用的还是 `navigate-to-route` 这条消息
   *（本地自投递，与 tray / hotkey 窗口发起的导航同一个处理器）。
   */
  const leaveSettingsRoute = useCallback((): void => {
    dispatchHostMessage({ type: 'navigate-to-route', path: '/' })
  }, [])

  const openChat = useCallback(
    (chatId: string): void => {
      leaveSettingsRoute()
      setActiveChatId(chatId)
    },
    [leaveSettingsRoute]
  )

  const closeChat = useCallback((): void => {
    leaveSettingsRoute()
    setActiveChatId(null)
  }, [leaveSettingsRoute])

  const startChat = useCallback(
    async ({ input, cwd, roots }: StartChatParams): Promise<string> => {
      /*
       * thread/start 的权限字段与 turn/start **不同形状**（Codex `owe()` 用 `Pme`，
       * turn/start 用 `Fme`）：没有权限档案时 thread 发 `sandbox: <SandboxMode 串>`，
       * turn 发 `sandboxPolicy: <对象>`。混用会被服务端拒。
       */
      /*
       * 解析要带上"有没有项目" —— 无项目会话的默认档是 granular 而不是 auto
       *（Codex `Oti`）。之后每一轮从线程状态读，就不必再传这个标志。
       */
      const selection = resolvePermissions(null, roots.length === 0)
      const policy = resolvePolicy(selection.mode, roots)
      const { thread } = await rpc.request<{ thread: Chat }>(M.chatStart, {
        cwd,
        ...threadPermissionFields(policy)
      })
      // 这一档已经应用到线程上了：记进线程状态，之后每一轮从这里解析
      seedThreadPermissions(thread.id, { mode: selection.mode, roots })
      /*
       * 顺序是有讲究的:先认领(同步绑定事件归属 + 标记无历史),再切 state,
       * 最后**带着显式 threadId**发第一轮 —— setActiveChatId 是异步的,
       * 这一刻 sendMessage 读到的绑定还是空的(会抛 "No active chat")。
       * Codex 的 turn/start 载荷里 threadId 也一直是显式的(`threadId: t`)。
       */
      core.adoptNewChat(thread.id)
      leaveSettingsRoute()
      setActiveChatId(thread.id)
      await core.startTurn(thread.id, input)
      return thread.id
    },
    [core, leaveSettingsRoute]
  )

  const value = useMemo<ChatRuntimeValue>(
    () => ({
      activeChatId,
      turns: core.turns,
      approvals: core.approvals,
      phase: core.phase,
      loading: core.loading,
      readOnly: core.readOnly,
      readOnlyReason: core.readOnlyReason,
      error: core.error,
      openChat,
      closeChat,
      sendMessage: core.sendMessage,
      startChat,
      interrupt: core.interrupt,
      steer: core.steer,
      queuedFollowUps: core.queuedFollowUps,
      queueInterrupted: core.queueInterrupted,
      enqueueFollowUp: core.enqueueFollowUp,
      deleteQueuedMessage: core.deleteQueuedMessage,
      reorderQueuedMessages: core.reorderQueuedMessages,
      sendQueuedMessageNow: core.sendQueuedMessageNow,
      editQueuedMessage: core.editQueuedMessage,
      resumeInterruptedQueue: core.resumeInterruptedQueue,
      editUserMessage: core.editUserMessage,
      respondToApproval: core.respondToApproval
    }),
    [
      activeChatId,
      core.turns,
      core.approvals,
      core.phase,
      core.loading,
      core.readOnly,
      core.readOnlyReason,
      core.error,
      openChat,
      closeChat,
      core.sendMessage,
      startChat,
      core.interrupt,
      core.steer,
      core.queuedFollowUps,
      core.queueInterrupted,
      core.enqueueFollowUp,
      core.deleteQueuedMessage,
      core.reorderQueuedMessages,
      core.sendQueuedMessageNow,
      core.editQueuedMessage,
      core.resumeInterruptedQueue,
      core.editUserMessage,
      core.respondToApproval
    ]
  )

  return <ChatRuntimeContext.Provider value={value}>{children}</ChatRuntimeContext.Provider>
}

/* ==================== Side chat(固定会话,面板 tab 内嵌) ==================== */

/**
 * Codex 的 local-conversation-thread:side chat tab 里是一个完整的
 * 本地会话线程(自己的 composer + 消息流),与主会话并存。
 * WS 用同一个 ChatRuntimeContext 承载:Provider 钉住 fork 出来的会话 id,
 * 内部 Composer/ThreadTurn 等组件不需要任何改动。
 *
 * openChat/closeChat/startChat 在这个上下文里没有意义(会话由 tab 生命周期
 * 管理),留空调实现,调用即报错属于用法错误。
 */
export function SideChatRuntimeProvider({
  conversationId,
  children
}: {
  conversationId: string
  children: ReactNode
}): React.JSX.Element {
  const core = useChatRuntimeCore(conversationId)

  const value = useMemo<ChatRuntimeValue>(
    () => ({
      activeChatId: conversationId,
      turns: core.turns,
      approvals: core.approvals,
      phase: core.phase,
      loading: core.loading,
      readOnly: core.readOnly,
      readOnlyReason: core.readOnlyReason,
      error: core.error,
      openChat: () => {},
      closeChat: () => {},
      sendMessage: core.sendMessage,
      startChat: () => Promise.reject(new Error('side chat 不支持 startChat')),
      interrupt: core.interrupt,
      steer: core.steer,
      queuedFollowUps: core.queuedFollowUps,
      queueInterrupted: core.queueInterrupted,
      enqueueFollowUp: core.enqueueFollowUp,
      deleteQueuedMessage: core.deleteQueuedMessage,
      reorderQueuedMessages: core.reorderQueuedMessages,
      sendQueuedMessageNow: core.sendQueuedMessageNow,
      editQueuedMessage: core.editQueuedMessage,
      resumeInterruptedQueue: core.resumeInterruptedQueue,
      editUserMessage: core.editUserMessage,
      respondToApproval: core.respondToApproval
    }),
    [
      conversationId,
      core.turns,
      core.approvals,
      core.phase,
      core.loading,
      core.readOnly,
      core.readOnlyReason,
      core.error,
      core.sendMessage,
      core.interrupt,
      core.steer,
      core.queuedFollowUps,
      core.queueInterrupted,
      core.enqueueFollowUp,
      core.deleteQueuedMessage,
      core.reorderQueuedMessages,
      core.sendQueuedMessageNow,
      core.editQueuedMessage,
      core.resumeInterruptedQueue,
      core.editUserMessage,
      core.respondToApproval
    ]
  )

  return <ChatRuntimeContext.Provider value={value}>{children}</ChatRuntimeContext.Provider>
}

export function useChatRuntime(): ChatRuntimeValue {
  const ctx = useContext(ChatRuntimeContext)
  if (!ctx) throw new Error('useChatRuntime must be used within ChatRuntimeProvider')
  return ctx
}
