/**
 * 协议 → 渲染模型。
 *
 * 这是**唯一**认识 `@shared/protocol` 的地方（由 eslint 的 no-restricted-imports
 * 强制）。分层的全部价值在于此：协议重新生成后，编译错误集中在这一个文件里，
 * 而不是散落在十几个组件中。
 *
 * 上游对应的是 chatModel 里"把 IChatProgress 累积进 IResponse.value"那一段。
 * 两边的形状是同构的——都是"一轮内按序累积、块可原地更新的内容数组"——所以这里
 * 是逐条目投影，不需要重建状态。
 */
import type { Entry } from '@shared/protocol/entities'
import type { RuntimeTurn } from '../../state/turnStore'
import type { PendingApproval } from '../model/approval'
import type { ChatContent } from '../model/content'
import { parsePlanText, type Todo } from '../model/plan.ts'
import { extractLastHeading } from '../model/reasoningHeading.ts'
import type { ThreadRow } from '../model/rows'
// 带扩展名：verify-chat-adapter.mjs 用 Node 的类型剥离直接跑这个文件，
// 而 Node 的 ESM 解析不会替我们补 `.ts`。Vite 两种写法都认。
import { approvalToInvocation, toToolInvocation, withApproval } from './toolInvocation.ts'

/** 用户消息的可见文本（图片、音频等非文本输入在附件区呈现，不进正文） */
function userText(entry: Extract<Entry, { type: 'userMessage' }>): string {
  return entry.content
    .map((input) => {
      switch (input.type) {
        case 'text':
          return input.text
        case 'skill':
        case 'mention':
          return `@${input.name}`
        default:
          return ''
      }
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * 轮次状态行的文案来源 —— Codex `local-conversation-turn` 里的 `tn`:
 * 从**最新一条**推理往前提,取第一条能提出标题的,
 * 标题 = 推理正文最后一行(`extractLastHeading`)。
 *
 * 两处与 Codex 的数据差异(都已核对,不影响方向):
 * 1. Codex 读 `content`(完整推理);本机 agent 只发 `summary`,content 恒空。
 *    这里把「正文」归一成 content 优先、summary 充底 —— Codex 若收到只有
 *    summary 的推理一样提不出标题,状态行退回 "Thinking"。
 * 2. Codex 的 reasoning.content 是整段字符串;协议这边是数组,拼起来再提。
 */
function reasoningHeading(turn: RuntimeTurn): string | null {
  for (let i = turn.items.length - 1; i >= 0; i--) {
    const entry = turn.items[i]
    if (entry.type !== 'reasoning') continue
    const body = entry.content.length > 0 ? entry.content : entry.summary
    const heading = extractLastHeading(body.join('\n\n'))
    if (heading != null) return heading
  }
  return null
}

/**
 * 一个条目 → 一个内容块。
 *
 * 返回 null 表示"不渲染"。
 */
function entryToContent(entry: Entry, ctx: EntryContext): ChatContent | null {
  switch (entry.type) {
    case 'agentMessage':
      return { kind: 'markdownContent', content: entry.text, phase: entry.phase }

    case 'reasoning':
      /*
       * 推理不进渲染流 —— 这是 Codex 的真实行为,不是取舍:
       * 渲染单元的分类函数(`Tr`)对 reasoning 直接返回 null。
       * 它唯一的可见去处是轮次状态行的标题(reasoningHeading)。
       */
      return null

    case 'contextCompaction':
      return { kind: 'contextCompaction', id: entry.id }

    // 排队消息：轮次开头之后又出现的用户消息，作为正文的一部分显示
    case 'userMessage':
      // 排队消息不是助手文本,谈不上 commentary / final_answer
      return { kind: 'markdownContent', content: userText(entry), phase: null }

    /*
     * 计划**不在流里渲染**。
     *
     * 上游同样如此：`chatToolInvocationPart.ts` 收到 todoList 数据时只调用
     * `chatTodoListService.setTodos()`，一个字都不往回复里放；清单由输入框
     * 上方那个常驻部件显示（`chat.todo.showWidget` 默认 true）。
     *
     * 道理是它表达的是"当前状态"而不是"发生过的事"：模型每改一次计划就推一条
     * 新条目，放进流里会得到同一份清单的三四个版本依次排开，而只有最后一份是
     * 真的。取最新一份的逻辑在 `latestTodos()`。
     */
    case 'plan':
      return null

    case 'hookPrompt': {
      const body = entry.fragments
        .map((f) => f.text)
        .filter((t) => t.trim())
        .join('\n\n')
      if (!body) return null
      const n = entry.fragments.length
      return {
        kind: 'hook',
        id: entry.id,
        title: n === 1 ? 'Hook added context' : `${n} hooks added context`,
        body
      }
    }

    case 'enteredReviewMode':
    case 'exitedReviewMode':
      return {
        kind: 'reviewMode',
        id: entry.id,
        entered: entry.type === 'enteredReviewMode',
        review: entry.review
      }

    default: {
      // 五种工具条目归一成一个 toolInvocation（adapter/toolInvocation.ts）
      const invocation = toToolInvocation(entry)
      if (!invocation) return null
      const approval = ctx.approvals.get(invocation.id)
      return {
        kind: 'toolInvocation',
        invocation: approval ? withApproval(invocation, approval) : invocation
      }
    }
  }
}

/** 投影单个条目时需要、但单看条目本身得不到的上下文 */
interface EntryContext {
  /** 待决审批，按条目 id 索引 */
  approvals: ReadonlyMap<string, PendingApproval>
}

/**
 * 当前的待办清单 —— 供输入框上方的常驻部件使用。
 *
 * 从后往前找第一份拿得到的计划：结构化的（`turn/plan/updated`）优先，它带每一步
 * 的状态；只剩条目文本时解析文本。两者都没有就返回空。
 *
 * 跨轮次回溯而不是只看最后一轮：计划往往在前一轮定下、后续几轮里执行，只看当前
 * 轮会让清单在每轮开头凭空消失。上游的清单存在会话级的 service 里，效果一样。
 */
export function latestTodos(turns: readonly RuntimeTurn[]): Todo[] {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]
    if (turn.plan && turn.plan.length > 0) return turn.plan
    for (let j = turn.items.length - 1; j >= 0; j--) {
      const entry = turn.items[j]
      if (entry.type !== 'plan') continue
      const parsed = parsePlanText(entry.text)
      if (parsed.length > 0) return parsed
    }
  }
  return []
}

/**
 * 轮次 → 列表行。
 *
 * 一个轮次拆成 request + response 两行，而不是一个复合行。理由在
 * `model/rows.ts` 里写了：虚拟滚动按行测高度，一轮当成一行会高到没法虚拟化。
 *
 * 轮次开头连续的用户消息归 request 行，之后的一律进 response 行——服务端可以
 * 在回显用户消息之前就推来活动条目，按"位置"而不是"时序"分组才不会让用户看见
 * 自己刚发的话排在 agent 的活动下面。
 *
 * `approvals` 是当前待用户决策的审批，按条目 id 索引。放在参数里而不是让 parts
 * 自己去 context 里取：这样"某条工具调用处于等待确认态"是一个可以脱离 React
 * 断言的纯函数结果（见 verify-chat-adapter.mjs）。
 */
export function turnsToRows(
  turns: readonly RuntimeTurn[],
  approvals: ReadonlyMap<string, PendingApproval> = new Map()
): ThreadRow[] {
  const rows: ThreadRow[] = []

  for (const turn of turns) {
    const items = turn.items
    let cursor = 0
    const leading: string[] = []
    while (cursor < items.length && items[cursor].type === 'userMessage') {
      leading.push(userText(items[cursor] as Extract<Entry, { type: 'userMessage' }>))
      cursor++
    }

    if (leading.length > 0) {
      rows.push({
        kind: 'request',
        id: turn.id,
        text: leading.join('\n\n'),
        attachments: [],
        timestamp: turn.startedAtMs
      })
    }

    const content: ChatContent[] = []
    const seen = new Set<string>()
    for (let i = cursor; i < items.length; i++) {
      const part = entryToContent(items[i], { approvals })
      if (part) content.push(part)
      if (part?.kind === 'toolInvocation') seen.add(part.invocation.id)
    }

    /*
     * 审批到得比条目早时的兜底。
     *
     * 上面按条目投影，所以一个还没有对应条目的审批不会出现在任何地方——而它
     * 恰恰是 agent 正在等的那个。这里把这类审批补成一条自建的工具调用，
     * 用同一个 itemId，真条目一到就自然顶替。
     */
    for (const approval of approvals.values()) {
      if (approval.turnId !== turn.id || seen.has(approval.itemId)) continue
      content.push({ kind: 'toolInvocation', invocation: approvalToInvocation(approval) })
    }

    if (turn.reconnect) {
      content.push({
        kind: 'reconnect',
        attempt: turn.reconnect.attempt,
        maxAttempts: turn.reconnect.maxAttempts,
        serverOverloaded: turn.reconnect.serverOverloaded,
        detail: turn.reconnect.detail
      })
    }

    if (turn.status === 'failed') {
      content.push({
        kind: 'errorDetails',
        level: 'error',
        message: turn.error ?? 'This turn failed.',
        isLast: true
      })
    }

    // 已经有回答就不必再说"被停了"——用户看得到自己按的停止，也看得到已产出的内容
    const hasAnswer = content.some((c) => c.kind === 'markdownContent')
    if (turn.status === 'interrupted' && !hasAnswer) {
      content.push({ kind: 'errorDetails', level: 'info', message: 'Stopped', isLast: true })
    }
    rows.push({
      kind: 'response',
      id: turn.id,
      content,
      thinkingFallback: reasoningHeading(turn),
      isComplete: turn.status !== 'inProgress',
      isCanceled: turn.status === 'interrupted',
      startedAtMs: turn.startedAtMs,
      completedAtMs: turn.completedAtMs
    })
  }

  return rows
}
