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
import { APPROVAL_METHODS, toApprovalResponse, toPendingApproval } from '../chat/adapter/approval'
import type { ApprovalDecision, PendingApproval } from '../chat/model/approval'
import type { Todo, TodoStatus } from '../chat/model/plan'
import type {
  AskForApproval,
  Chat,
  Entry,
  SandboxMode,
  Turn,
  UserInput
} from '@shared/protocol/entities'

/** 一次轮次的运行状态，驱动发送按钮在"发送/停止"之间切换 */
export type TurnPhase = 'idle' | 'running'

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
  sendMessage(text: string): Promise<void>
  startChat(params: StartChatParams): Promise<string>
  interrupt(): Promise<void>
  /** 回答一条审批。key 取自 `PendingApproval.requestKey` */
  respondToApproval(requestKey: string, decision: ApprovalDecision): void
}

export interface StartChatParams {
  text: string
  cwd: string
  approvalPolicy: AskForApproval
  sandbox: SandboxMode
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

const ChatRuntimeContext = createContext<ChatRuntimeValue | null>(null)

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

export function ChatRuntimeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [turns, setTurns] = useState<RuntimeTurn[]>([])
  const [approvals, setApprovals] = useState<ReadonlyMap<string, PendingApproval>>(new Map())
  const [phase, setPhase] = useState<TurnPhase>('idle')
  const [loading, setLoading] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [readOnlyReason, setReadOnlyReason] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 当前会话 id 的即时副本：通知回调在闭包里读它，避免因 state 未刷新而误判
  // 事件归属。切换会话的入口都会同步写这个 ref，不在 render 期间赋值。
  const activeRef = useRef<string | null>(null)

  /*
   * 未应答的反向请求。
   *
   * 与上面那份 state 是同一批审批的两个副本，各有各的用处：state 供渲染，
   * 这个 ref 存 resolve 回调。回调不能进 state——它不是数据，放进去会让每次
   * setState 都产生新引用而白白重渲染整棵树。
   *
   * 用 ref 还有第二个理由：撤销审批的几个入口（切换会话、轮次收尾、卸载）
   * 都在闭包里被调用，读 state 会拿到注册时的旧快照。
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
   * 先撤 UI 再应答：按钮点下去到 agent 真正动起来之间有一段网络往返，这期间
   * 按钮还在那里会让人以为没点上，连点两下就成了两次应答。
   *
   * 幂等：requestKey 已经不在表里就什么都不做，所以重复调用（连点、以及轮次
   * 收尾时的批量 cancel）是安全的。
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

  /** 批量放弃：切换会话、轮次收尾时用。`turnId` 为 null 表示全部 */
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
   * 服务端反向请求：审批。
   *
   * 与通知不同，这里**必须应答**——不答 agent 就停在那一步，既不报错也不推进，
   * 对用户表现为"卡住了"。所以：
   *   - 不属于当前会话的，立刻按 cancel 回掉，而不是压着不管
   *   - 组件卸载时把还挂着的全部 cancel 掉
   */
  useEffect(() => {
    // 取到本地变量再用：这个 Map 从建好起就不会被换掉，但 lint 无从判断，
    // 而它的规则本身是对的——ref.current 在 cleanup 跑到时未必还是当初那个
    const replies = approvalReplies.current
    const offs = APPROVAL_METHODS.map((method) =>
      rpc.onServerRequest(method, (params) => {
        const pending = toPendingApproval(method, params)
        if (!pending) return toApprovalResponse('cancel')
        if ((params as { threadId?: string }).threadId !== activeRef.current) {
          // 后台会话的审批：本视图没有它的上下文，无法让用户做判断
          return toApprovalResponse('cancel')
        }
        return new Promise((resolve) => {
          replies.set(pending.requestKey, {
            pending,
            reply: (decision) => resolve(toApprovalResponse(decision))
          })
          setApprovals((prev) => new Map(prev).set(pending.itemId, pending))
        })
      })
    )
    return () => {
      offs.forEach((off) => off())
      for (const { reply } of replies.values()) {
        reply('cancel')
      }
      replies.clear()
    }
  }, [])

  // 订阅会话事件流。只处理当前打开会话的通知——其他会话可能在后台跑，
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
         * 正常流程里 agent 会在轮次收尾前自己解掉这些请求，但轮次被中断或失败
         * 时不一定。协议有 `serverRequest/resolved` 通知专治这个，可惜它按
         * agent 的 requestId 索引，而主进程的 RpcRouter 转发时用的是自己生成的
         * id——渲染层拿不到那个 requestId，对不上。按轮次清是能对得上的那个粒度。
         */
        cancelApprovals(turn.id)
        // 轮次自己带上了失败原因就撤掉全局横幅，否则同一条错误会显示两遍
        if (turn.error?.message) setError(null)
        setPhase('idle')
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

        // 还会重试就不是终态：把它渲染成轮次内的重连进度，而不是一条报错。
        // 断流大多能自己恢复，先弹红字会让用户以为白跑了一轮。
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

  // 切换会话前把上一个会话未答的审批全部撤掉：那些工具调用马上就要从界面上
  // 消失，留着未应答的请求等于让 agent 无限期停在那里
  const resetView = useCallback((): void => {
    cancelApprovals(null)
    setApprovals(new Map())
    setTurns([])
    setError(null)
    setReadOnly(false)
    setReadOnlyReason(null)
  }, [cancelApprovals])

  const openChat = useCallback(
    (chatId: string): void => {
      setActiveChatId(chatId)
      activeRef.current = chatId
      resetView()
      setLoading(true)

      const apply = (thread: Chat): void => {
        setTurns(thread.turns.map(toRuntimeTurn))
        setPhase(thread.status.type === 'active' ? 'running' : 'idle')
      }

      // resume 一次完成三件事：加载历史、订阅事件、若会话正在跑则重新加入。
      // 拆成 read + resume 会丢掉两次调用之间的事件。
      rpc
        .request<{ thread: Chat }>(M.chatResume, { threadId: chatId })
        .then((res) => {
          if (activeRef.current !== chatId) return
          apply(res.thread)
        })
        .catch(async (err: unknown) => {
          if (activeRef.current !== chatId) return
          const message = err instanceof Error ? err.message : String(err)

          // resume 会加载会话的完整运行配置，有两类常见失败与"会话本身"无关：
          //   1. 被其他客户端（命令行、另一个窗口）持有写锁
          //   2. 会话记录的模型供应商在当前配置里不存在（由别的客户端创建）
          // 这两种都能用 thread/read 只读取回历史——它不加载运行配置也不抢锁。
          // 直接抛错会让这些会话彻底打不开，看起来像数据损坏。
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
    },
    [resetView]
  )

  const closeChat = useCallback((): void => {
    const previous = activeRef.current
    setActiveChatId(null)
    activeRef.current = null
    resetView()
    setPhase('idle')
    if (previous) {
      // 取消订阅，避免后台会话继续往这条连接推事件
      rpc.request(M.chatUnsubscribe, { threadId: previous }).catch(() => {})
    }
  }, [resetView])

  const startTurn = useCallback(async (chatId: string, text: string): Promise<void> => {
    const input: UserInput[] = [{ type: 'text', text, text_elements: [] }]
    const clientId = crypto.randomUUID()
    const pending = createPendingTurn(clientId, {
      type: 'userMessage',
      id: `${PENDING_TURN}${clientId}`,
      clientId,
      content: input
    })
    setTurns((prev) => [...prev, pending])
    setPhase('running')
    try {
      await rpc.request(M.turnStart, {
        threadId: chatId,
        input,
        clientUserMessageId: clientId
      })
    } catch (err) {
      setTurns((prev) => prev.filter((t) => t.id !== pending.id))
      setPhase('idle')
      throw err
    }
  }, [])

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      const chatId = activeRef.current
      if (!chatId) throw new Error('No active chat')
      await startTurn(chatId, text)
    },
    [startTurn]
  )

  const startChat = useCallback(
    async ({ text, cwd, approvalPolicy, sandbox }: StartChatParams): Promise<string> => {
      const { thread } = await rpc.request<{ thread: Chat }>(M.chatStart, {
        cwd,
        approvalPolicy,
        sandbox
      })
      setActiveChatId(thread.id)
      activeRef.current = thread.id
      resetView()
      await startTurn(thread.id, text)
      return thread.id
    },
    [resetView, startTurn]
  )

  const interrupt = useCallback(async (): Promise<void> => {
    const chatId = activeRef.current
    if (!chatId) return
    await rpc.request(M.turnInterrupt, { threadId: chatId })
    setPhase('idle')
  }, [])

  const value = useMemo<ChatRuntimeValue>(
    () => ({
      activeChatId,
      turns,
      approvals,
      phase,
      loading,
      readOnly,
      readOnlyReason,
      error,
      openChat,
      closeChat,
      sendMessage,
      startChat,
      interrupt,
      respondToApproval
    }),
    [
      activeChatId,
      turns,
      approvals,
      phase,
      loading,
      readOnly,
      readOnlyReason,
      error,
      openChat,
      closeChat,
      sendMessage,
      startChat,
      interrupt,
      respondToApproval
    ]
  )

  return <ChatRuntimeContext.Provider value={value}>{children}</ChatRuntimeContext.Provider>
}

export function useChatRuntime(): ChatRuntimeValue {
  const ctx = useContext(ChatRuntimeContext)
  if (!ctx) throw new Error('useChatRuntime must be used within ChatRuntimeProvider')
  return ctx
}
