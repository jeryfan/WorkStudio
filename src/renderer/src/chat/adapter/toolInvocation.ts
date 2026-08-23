/**
 * 五种工具条目 → 一个 ToolInvocation。
 *
 * 上游 VSCode 把所有工具收敛成一个 `IChatToolInvocation` + 一台状态机；本项目的
 * 协议相反，是五种并列的条目类型，各带各的 status 枚举。这里做归一化。
 *
 * 方向是"多 → 一"，所以是安全的：新增一种工具条目只需要在这里加一个分支，
 * 渲染层完全不动。反过来（一个模型摊成多种渲染）才会到处漏。
 *
 * 状态映射的取舍：协议的状态枚举都很扁（inProgress / completed / failed /
 * declined），而上游的状态机带"等待确认"。`waitingForConfirmation` 不由条目产生
 * ——它来自服务端的审批反向请求，作为参数从外面叠上来（见 `withApproval`）。
 */
import type { Entry } from '@shared/protocol/entities'
import type { PendingApproval } from '../model/approval'
import {
  extractStructuredJson,
  parseMcpContentBlocks,
  stringifyJson,
  type McpContentBlock
} from '../model/mcpContent'
import type {
  TerminalToolData,
  ToolInvocation,
  ToolSpecificData,
  ToolState
} from '../model/toolInvocation'

type Narrow<K extends Entry['type']> = Extract<Entry, { type: K }>

/** 协议里带工具语义的条目类型 */
const TOOL_TYPES = new Set([
  'commandExecution',
  'mcpToolCall',
  'dynamicToolCall',
  'fileChange',
  'webSearch'
])

export function isToolEntry(entry: Entry): boolean {
  return TOOL_TYPES.has(entry.type)
}

/**
 * 扁平 status → 状态机。
 *
 * `declined` 归到 cancelled/denied 而不是 failed：被用户拒绝不是错误，
 * 用红色错误样式表达"你自己按了拒绝"会让人以为出了问题。
 */
function mapStatus(
  status: 'inProgress' | 'completed' | 'failed' | 'declined',
  durationMs: number | null
): ToolState {
  switch (status) {
    case 'inProgress':
      return { type: 'executing', progress: null }
    case 'completed':
      return { type: 'completed', success: true, durationMs }
    case 'failed':
      return { type: 'completed', success: false, durationMs }
    case 'declined':
      return { type: 'cancelled', reason: 'denied' }
  }
}

/**
 * 命令的展示文案。
 *
 * 协议已经把命令解析成 `commandActions`（read / listFiles / search / unknown），
 * 用它生成人话比展示整条命令行好读得多——`grep -rn "foo" --include=*.ts src`
 * 对用户的信息量还不如 "Searched for foo"。
 *
 * 但只在**只有一个动作**时这么做：管道串起来的复合命令用人话概括会失真，
 * 那种情况老老实实展示命令本身。
 */
function commandLabels(entry: Narrow<'commandExecution'>): {
  invocation: string
  pastTense: string
} {
  const actions = entry.commandActions
  if (actions.length === 1) {
    const action = actions[0]
    switch (action.type) {
      case 'read':
        return { invocation: `Reading ${action.name}`, pastTense: `Read ${action.name}` }
      case 'listFiles': {
        const where = action.path ? ` ${action.path}` : ''
        return { invocation: `Listing files${where}`, pastTense: `Listed files${where}` }
      }
      case 'search': {
        const what = action.query ? ` for ${action.query}` : ''
        return { invocation: `Searching${what}`, pastTense: `Searched${what}` }
      }
      case 'unknown':
        break
    }
  }
  return { invocation: `Running ${entry.command}`, pastTense: `Ran ${entry.command}` }
}

/**
 * 命令归到哪一类 —— 给活动行选图标用(Codex 的 `parsedCmd.type`)。
 *
 * 与 `commandLabels` 同一个判据(只有单一动作才敢分类;管道串起来的复合命令
 * 归 unknown),所以图标和文案永远一致 —— 不会出现"文案说 Searched、
 * 图标画的是终端"这种错位。
 */
function commandKind(entry: Narrow<'commandExecution'>): TerminalToolData['commandKind'] {
  const actions = entry.commandActions
  if (actions.length !== 1) return 'unknown'
  switch (actions[0].type) {
    case 'read':
      return 'read'
    case 'listFiles':
      return 'listFiles'
    case 'search':
      return 'search'
    case 'unknown':
      return 'unknown'
  }
}

/** JSON 入参格式化。过长的单行 JSON 没法读，缩进后至少能扫 */
function formatJson(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * MCP 结果 → 展开体的三条通道。
 *
 * 与 Codex 的 `ew` 里那段 `useMemo` 同构：先把内容块解析出来，再看它是不是
 * "整体一段 JSON"（`extractStructuredJson`）——是的话内容块清空、走代码块；
 * 不是的话内容块原样保留、走散文。
 *
 * `structuredContent` 是 MCP 规范里与 `content` 并列的另一个字段（服务器给的
 * 机器可读版本），它天然是 JSON，无条件走代码块。
 *
 * 之前这里是 `formatJson(content)` —— 把整个内容块数组序列化成一坨 JSON。
 * 那样一段普通的说明文字会被 `["{\"type\":\"text\",\"text\":\"…` 裹起来，
 * 转义字符比正文还多。
 */
function mcpResult(entry: Narrow<'mcpToolCall'>): {
  blocks: McpContentBlock[]
  structuredJson: string | null
} {
  if (!entry.result) return { blocks: [], structuredJson: null }
  const structured =
    entry.result.structuredContent != null ? stringifyJson(entry.result.structuredContent) : null
  const parsed = parseMcpContentBlocks(entry.result.content)
  const asJson = extractStructuredJson(parsed)
  if (asJson == null) return { blocks: parsed, structuredJson: structured }
  // 内容块与 structuredContent 是同一份数据时只留一份，不要并排显示两个一样的代码块
  if (structured == null || asJson === structured) {
    return { blocks: [], structuredJson: structured ?? asJson }
  }
  return { blocks: parsed, structuredJson: structured }
}

/**
 * 动态工具的 `contentItems` → 内容块。
 *
 * 协议这边只有 `inputText` 一种带正文的项，其余类型没有可展示的载荷，
 * 用 `[type]` 占位（丢掉它会让"工具明明返回了东西却什么都没有"）。
 * 拼成**一个** text 块而不是每项一块：它们本来就是一段被切碎的文本，
 * 分块会在中间插进边框和标题栏。
 */
function dynamicResultBlocks(entry: Narrow<'dynamicToolCall'>): McpContentBlock[] {
  const items = entry.contentItems
  if (!items || items.length === 0) return []
  const text = items
    .map((item) => (item.type === 'inputText' ? item.text : `[${item.type}]`))
    .join('\n')
  return text === '' ? [] : [{ type: 'text', text, annotations: null }]
}

/**
 * 检索结果 → 可显示的条目。
 *
 * 协议把 `results` 声明成 `Array<JsonValue>` 并注明是**不透明 JSON**，理由是
 * "新的结果字段和结果类型不必等 Codex 发版就能透传"。所以这里不能按固定 schema
 * 解析，只能尽力抽：认得出 title/url 就用，认不出就把整条 JSON 当标题。
 *
 * 宁可显示一行难看的 JSON，也不要把结果丢掉——上游对有结果的工具是渲染成结果
 * 列表的（ChatResultListSubPart），只显示一行标题会让人以为搜索什么都没搜到。
 */
function searchResults(raw: unknown): { title: string; url: string | null }[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    if (typeof item === 'string') return { title: item, url: null }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      const url = typeof o.url === 'string' ? o.url : null
      const title =
        (typeof o.title === 'string' && o.title) ||
        (typeof o.name === 'string' && o.name) ||
        (typeof o.snippet === 'string' && o.snippet) ||
        url
      if (title) return { title, url }
    }
    return { title: formatJson(item), url: null }
  })
}

/**
 * 条目 → 统一的工具调用；不是工具条目则返回 null。
 */
export function toToolInvocation(entry: Entry): ToolInvocation | null {
  switch (entry.type) {
    case 'commandExecution': {
      const labels = commandLabels(entry)
      const data: ToolSpecificData = {
        kind: 'terminal',
        commandKind: commandKind(entry),
        command: entry.command,
        commandForDisplay: entry.command,
        cwd: entry.cwd,
        output: entry.aggregatedOutput,
        exitCode: entry.exitCode
      }
      // 退出码非零即使 status 是 completed 也算失败：命令跑完了但没成功
      const state = mapStatus(entry.status, entry.durationMs)
      return {
        id: entry.id,
        toolId: 'shell',
        invocationMessage: labels.invocation,
        pastTenseMessage: labels.pastTense,
        state:
          state.type === 'completed' && entry.exitCode != null && entry.exitCode !== 0
            ? { ...state, success: false }
            : state,
        data
      }
    }

    case 'mcpToolCall':
      return {
        id: entry.id,
        toolId: `${entry.server}/${entry.tool}`,
        invocationMessage: `Running ${entry.tool}`,
        pastTenseMessage: `Ran ${entry.tool}`,
        state: mapStatus(entry.status, entry.durationMs),
        data: {
          kind: 'inputOutput',
          ...mcpResult(entry),
          error: entry.error ? entry.error.message : null,
          rawJson: stringifyJson({
            callId: entry.id,
            invocation: { server: entry.server, tool: entry.tool, arguments: entry.arguments },
            durationMs: entry.durationMs,
            result: entry.error ?? entry.result ?? null
          })
        }
      }

    case 'dynamicToolCall': {
      const name = entry.namespace ? `${entry.namespace}.${entry.tool}` : entry.tool
      const state = mapStatus(entry.status, entry.durationMs)
      return {
        id: entry.id,
        toolId: name,
        invocationMessage: `Running ${name}`,
        pastTenseMessage: `Ran ${name}`,
        state:
          state.type === 'completed' && entry.success === false
            ? { ...state, success: false }
            : state,
        data: {
          kind: 'inputOutput',
          blocks: dynamicResultBlocks(entry),
          structuredJson: null,
          error: null,
          rawJson: stringifyJson({
            callId: entry.id,
            invocation: { tool: name, arguments: entry.arguments },
            durationMs: entry.durationMs,
            result: entry.contentItems ?? null
          })
        }
      }
    }

    case 'fileChange': {
      const changes = entry.changes.map((change) => ({
        path: change.path,
        operation: change.kind.type,
        movedTo: change.kind.type === 'update' ? change.kind.move_path : null,
        diff: change.diff
      }))
      const label = changes.length === 1 ? changes[0].path : `${changes.length} files`
      return {
        id: entry.id,
        toolId: 'apply_patch',
        invocationMessage: `Editing ${label}`,
        pastTenseMessage: `Edited ${label}`,
        // fileChange 不带耗时
        state: mapStatus(entry.status, null),
        data: { kind: 'fileEdit', changes }
      }
    }

    case 'webSearch':
      return {
        id: entry.id,
        toolId: 'web_search',
        invocationMessage: `Searching the web for ${entry.query}`,
        pastTenseMessage: `Searched the web for ${entry.query}`,
        // webSearch 条目只在完成时推来，没有状态字段
        state: { type: 'completed', success: true, durationMs: null },
        data: {
          kind: 'search',
          query: entry.query,
          results: searchResults(entry.results)
        }
      }

    default:
      return null
  }
}

/**
 * 把待决审批叠到工具调用上。
 *
 * 覆盖而不是合并状态：条目此刻多半是 `inProgress`（服务端已经建了条目、正等
 * 用户点头），但显示成"正在执行"是错的——它一个字节都还没跑。
 *
 * 反过来，条目已经结束（completed / declined）就**不覆盖**：审批还挂在 map 里
 * 多半是清理慢了半拍，让一条已经跑完的命令倒退回"等你批准"会更糟。
 */
export function withApproval(
  invocation: ToolInvocation,
  approval: PendingApproval
): ToolInvocation {
  const { state } = invocation
  if (state.type === 'completed' || state.type === 'cancelled') return invocation
  return {
    ...invocation,
    state: {
      type: 'waitingForConfirmation',
      requestKey: approval.requestKey,
      reason: approval.reason
    }
  }
}

/**
 * 审批先于条目到达时，用审批参数自建一条工具调用。
 *
 * 到达顺序不受控。审批先到而界面什么都不显示的话，agent 会一直等一个用户根本
 * 看不见的确认——这是最坏的失败形态：既没有报错，也没有进度。
 *
 * id 用 itemId，与随后真正到达的条目一致，所以两者会占同一个 React key、
 * 同一个位置，真条目一到就自然替换掉这条占位。
 */
export function approvalToInvocation(approval: PendingApproval): ToolInvocation {
  const state: ToolState = {
    type: 'waitingForConfirmation',
    requestKey: approval.requestKey,
    reason: approval.reason
  }
  if (approval.fallback.kind === 'command') {
    const command = approval.fallback.command ?? ''
    return {
      id: approval.itemId,
      toolId: 'shell',
      invocationMessage: command ? `Running ${command}` : 'Running a command',
      pastTenseMessage: null,
      state,
      data: {
        kind: 'terminal',
        // 审批阶段拿不到 commandActions(那在条目里),所以只能归 unknown
        commandKind: 'unknown',
        command,
        commandForDisplay: command,
        cwd: approval.fallback.cwd,
        output: null,
        exitCode: null
      }
    }
  }
  // 文件改动的审批参数不带补丁（补丁在条目里），所以这条占位只有标题和按钮
  return {
    id: approval.itemId,
    toolId: 'apply_patch',
    invocationMessage: 'Editing files',
    pastTenseMessage: null,
    state,
    data: { kind: 'fileEdit', changes: [] }
  }
}
