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
import { workingLabel } from '../model/working.ts'
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
 * 从推理文本里取出折叠块的标题。
 *
 * 上游用的是模型生成的 `generatedTitle`，本项目协议不给，只能从正文里抽。
 *
 * 规则：取**最新一段**里的加粗小标题（Codex 的推理摘要形如
 * `**小标题**\n\n正文`），没有加粗就退回该段的第一行。
 *
 * 与旧实现（`turnModel.ts` 的 `reasoningHeading`）不同——那个取的是**最后一行**。
 * 两者服务的目的不一样：旧的是流光旁边的状态行，要表达"此刻在想什么"，
 * 所以越新越好；这里是折叠块的标题，取最后一行会得到半句正文，而且流式期间
 * 每来一个字就换一次，标题一直在跳。
 */
export function reasoningTitle(parts: readonly string[]): string | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    const text = parts[i] ?? ''
    const bold = /^\s*\*\*(.+?)\*\*:?\s*$/m.exec(text)
    if (bold) return bold[1].trim() || null
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('<!--')) continue
      return trimmed.replace(/^#{1,6}\s+/, '') || null
    }
  }
  return null
}

/**
 * 一个条目 → 一个内容块。
 *
 * `isActive` 由调用方传入：单看一个 reasoning 条目无法判断它还在不在产出，
 * 那取决于它后面有没有别的条目、以及轮次是否结束。
 *
 * 返回 null 表示"不渲染"。
 */
function entryToContent(entry: Entry, ctx: EntryContext): ChatContent | null {
  switch (entry.type) {
    case 'agentMessage':
      return { kind: 'markdownContent', content: entry.text }

    case 'reasoning': {
      // summary 是模型自己写的摘要，content 是完整推理。优先展示 summary——
      // 它本来就是给人看的，完整推理往往是几屏的自言自语。
      const items = (entry.summary.length > 0 ? entry.summary : entry.content).filter((s) =>
        s.trim()
      )
      return {
        kind: 'thinking',
        id: entry.id,
        title: reasoningTitle(items),
        items,
        isActive: ctx.isLastInRunningTurn
      }
    }

    case 'contextCompaction':
      return { kind: 'contextCompaction', id: entry.id }

    // 排队消息：轮次开头之后又出现的用户消息，作为正文的一部分显示
    case 'userMessage':
      return { kind: 'markdownContent', content: userText(entry) }

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
  /** 是这一轮的最后一条且轮次未结束 —— 决定推理块是否还在产出 */
  isLastInRunningTurn: boolean
  /** 待决审批，按条目 id 索引 */
  approvals: ReadonlyMap<string, PendingApproval>
}

/**
 * 要不要在回复末尾追加"工作中"。
 *
 * 移植自上游 `chatListRenderer.ts shouldShowWorkingProgress`，去掉了本项目没有
 * 数据源的分支（planReview、subagent、MCP 启动等）。留下的是它的核心判断：
 *
 * **只有在"确实没有别的东西在表达进度"时才显示。** 上游为此列了一长串否定条件，
 * 原因是同时出现两个转圈/流光会让人以为有两件事在跑。所以：
 *   - 推理块正在产出 → 它自己有流光
 *   - 工具正在执行或等审批 → 它自己有流光（等审批还有按钮）
 *   - 正文正在流式输出 → 字在一个一个冒，那就是进度
 *   - 正在重连 → 重连行自己有流光
 *
 * 反过来，`content` 为空正是最需要它的时刻：请求发出去了，第一个条目还没回来，
 * 界面上什么都没有。上游 `shouldShowWorkingProgress` 的 `!lastPart` 分支就是
 * 为这一刻准备的。
 */
function shouldShowWorking(turn: RuntimeTurn, content: readonly ChatContent[]): boolean {
  if (turn.status !== 'inProgress' || turn.reconnect) return false

  const last = content[content.length - 1]
  if (!last) return true

  switch (last.kind) {
    case 'thinking':
      return !last.isActive
    case 'toolInvocation': {
      const type = last.invocation.state.type
      return type !== 'executing' && type !== 'streaming' && type !== 'waitingForConfirmation'
    }
    /*
     * 正文流式输出期间不显示。
     *
     * 上游这里更细：它用 `hasBeenCaughtUpLongEnough` 区分"还在吐字"和"吐完了
     * 但轮次没结束"，后者会显示。那需要记录时间，而本层是纯函数。少显示一点
     * 比闪烁强——正文在动的时候，用户不需要另一个指示告诉他有事在发生。
     */
    case 'markdownContent':
      return false
    default:
      return true
  }
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
      const entry = items[i]
      const part = entryToContent(entry, {
        // 推理块是否还在产出：它是这一轮的最后一个条目，且轮次没结束。
        // 后面一旦来了别的条目（回答、工具调用），这一段推理就已经结束了。
        isLastInRunningTurn: i === items.length - 1 && turn.status === 'inProgress',
        approvals
      })
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

    // 放在最后：它表达的是"下面还会有东西"，位置必须是当前内容的末尾
    if (shouldShowWorking(turn, content)) {
      content.push({ kind: 'working', label: workingLabel(turn.id) })
    }

    rows.push({
      kind: 'response',
      id: turn.id,
      content,
      isComplete: turn.status !== 'inProgress',
      isCanceled: turn.status === 'interrupted',
      startedAtMs: turn.startedAtMs,
      completedAtMs: turn.completedAtMs
    })
  }

  return rows
}
