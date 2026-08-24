/**
 * 渲染单元 —— 把一轮的过程条目分成「独立条目」与「成组条目」。
 *
 * 逐字移植 Codex 的三层管线(全部位于 `content-reference-markers-DoRiAXes.js`,
 * 经 `local-conversation-turn` 调用):
 *
 * 1. **分类**(`Tr`):每个条目 → `groupable` / `standalone` / `null`(不渲染)。
 *    - groupable:exec / patch / web-search / mcp-tool-call / dynamic-tool-call
 *    - standalone:assistant-message / context-compaction / *-error / user-message …
 *    - null:reasoning / todo-list / plan-implementation …(**推理不进渲染单元**)
 * 2. **分组**(`Jr`):连续的 groupable 合成一个 `{kind:'group'}` 单元;
 *    组与组之间以 standalone 为界。
 * 3. **降级**(`qr`):只有一条目的组、且组表头处于 summary 态时,
 *    退回 standalone —— 单个 MCP 调用在已完成会话里显示为普通的一行,
 *    而不是只有一个成员的"组"。
 *
 * 组表头的状态机(`Yr`)与聚合摘要(`Ur`/`dr`/`fr` + `zg` 文案表)也在这里,
 * 它们都是纯函数,渲染层(`ActivityGroup`)只负责摆 DOM。
 */
import type { ChatContent, ChatToolInvocationContent } from './content'
import type { ToolInvocation } from './toolInvocation'
import { humanizeToolName } from './toolName.ts'

// ── 单元类型 ─────────────────────────────────────────────────

export type RenderUnit =
  | { kind: 'standalone'; key: string; item: ChatContent }
  | { kind: 'group'; key: string; items: ChatToolInvocationContent[] }

/** 组表头三态 —— Codex `Yr` 的返回 */
export type GroupHeaderState =
  { kind: 'summary' } | { kind: 'active'; item: ChatToolInvocationContent } | { kind: 'thinking' }

// ── 分类(Codex `Tr`)─────────────────────────────────────────

/**
 * 条目归哪一档。
 *
 * 与 Codex 的出入只在数据缺失处:
 * - Codex 的 mcp-tool-call 在「带 MCP app widget」时升 standalone(`Ut`),
 *   WS 没有 MCP app 通道,恒 groupable。
 * - Codex 的 dynamic-tool-call 看工具注册的 `standaloneInConversation`,
 *   WS 没有注册表,恒 groupable。
 * - **等待审批的调用恒 standalone** —— 对应 Codex 的 permission-request
 *   (审批在 Codex 里是独立条目,WS 叠在调用上;归 standalone 才能保证
 *   审批控件不进组的滚动窗)。
 */
function classify(item: ChatContent): 'groupable' | 'standalone' | null {
  if (item.kind !== 'toolInvocation') {
    // assistant-message / contextCompaction / errorDetails / reconnect / hook /
    // reviewMode 全部 standalone —— 与 Codex 对 user-message/system-error/
    // context-compaction 的处理一致
    return 'standalone'
  }
  if (item.invocation.state.type === 'waitingForConfirmation') return 'standalone'
  if (item.invocation.data.kind === 'search' && item.invocation.data.query.trim().length === 0) {
    // Codex:web-search 查询词为空 → null(整行不渲染)
    return null
  }
  return 'groupable'
}

// ── 分组(Codex `Jr`)─────────────────────────────────────────

/**
 * 单元 key —— Codex 的 `Qr`:优先条目自带 id,兜底 `type:源下标`。
 * 组的 key 用**第一条**成员 + 它在源列表里的下标(`agent-activity-group:…`)。
 */
function itemKey(item: ChatContent, sourceIndex: number): string {
  if (item.kind === 'toolInvocation') return item.invocation.id
  if ('id' in item && typeof item.id === 'string') return item.id
  return `${item.kind}:${sourceIndex}`
}

/** Codex `Jr` —— 连续 groupable 收成组;standalone 冲刷当前组 */
export function groupIntoRenderUnits(items: ChatContent[]): RenderUnit[] {
  const units: RenderUnit[] = []
  let pending: { item: ChatToolInvocationContent; sourceIndex: number }[] = []
  let groupStart = 0

  const flush = (): void => {
    const first = pending[0]
    if (first == null) return
    units.push({
      kind: 'group',
      key: `agent-activity-group:${itemKey(first.item, groupStart)}`,
      items: pending.map((p) => p.item)
    })
    pending = []
  }

  items.forEach((item, sourceIndex) => {
    const grouping = classify(item)
    if (grouping === 'groupable') {
      if (pending.length === 0) groupStart = sourceIndex
      // classify 已保证 groupable 的都是 toolInvocation
      pending.push({ item: item as ChatToolInvocationContent, sourceIndex })
      return
    }
    if (grouping === null) return
    flush()
    units.push({
      kind: 'standalone',
      key: `agent-activity-standalone:${itemKey(item, sourceIndex)}`,
      item
    })
  })
  flush()
  return units
}

// ── 单条目组降级(Codex `qr`)─────────────────────────────────

/**
 * 组员过滤(Codex `ek`):
 * - 空补丁(0 个改动)不进组(Codex 那边还有 visualization 豁免,WS 没有)
 * - 未完成的 search/list 命令不进组;未完成的 read 要有展示目标才进
 */
function isVisibleGroupChild(item: ChatToolInvocationContent): boolean {
  const { invocation } = item
  const { data } = invocation
  if (data.kind === 'fileEdit') return data.changes.length > 0
  if (data.kind === 'terminal') {
    if (!isItemInProgress(item)) return true
    if (data.commandKind === 'read') return data.commandForDisplay.trim().length > 0
    return data.commandKind !== 'search' && data.commandKind !== 'listFiles'
  }
  return true
}

/** Codex `Zr`/`kr` —— 条目是否还在进行 */
export function isItemInProgress(item: ChatToolInvocationContent): boolean {
  const { state } = item.invocation
  return (
    state.type === 'executing' ||
    state.type === 'streaming' ||
    state.type === 'waitingForConfirmation'
  )
}

/** Codex `qr` —— summary 态的单条目组降级为 standalone 渲染 */
export function demoteSingleItemGroup(unit: RenderUnit, state: GroupHeaderState): RenderUnit {
  if (unit.kind !== 'group') return unit
  const first = unit.items[0]
  if (state.kind !== 'summary' || unit.items.length !== 1 || first == null) return unit
  if (isItemInProgress(first)) return unit
  // Codex 这一支还多一条:多文件 patch 不降级(一组改动保持成组)
  if (first.invocation.data.kind === 'fileEdit' && first.invocation.data.changes.length !== 1) {
    return unit
  }
  return { kind: 'standalone', key: unit.key, item: first }
}

// ── 组表头状态(Codex `Yr`)───────────────────────────────────

/** 探索类命令(read/search/list)—— Codex 的 `lr` */
function isExplorationItem(item: ChatToolInvocationContent): boolean {
  const { data } = item.invocation
  return (
    data.kind === 'terminal' &&
    (data.commandKind === 'read' ||
      data.commandKind === 'search' ||
      data.commandKind === 'listFiles')
  )
}

/**
 * Codex `Xr` —— 组里"正在探索"的那一条:从尾部扫,优先还在跑的探索项,
 * 都没有时退回最后一条探索项。
 */
function activeExplorationItem(unit: RenderUnit): ChatToolInvocationContent | null {
  if (unit.kind !== 'group') return null
  let last: ChatToolInvocationContent | null = null
  for (let i = unit.items.length - 1; i >= 0; i--) {
    const item = unit.items[i]
    if (!isExplorationItem(item)) {
      if (last != null) break
      continue
    }
    last ??= item
    if (isItemInProgress(item)) return item
  }
  return last
}

/**
 * Codex `Yr` —— 组表头三态:
 *
 * - 不是最新单元 / 轮次没在跑 / 活动切片已关闭 → `summary`(聚合摘要)
 * - 正在探索 → `active` + 那条探索项
 * - 组里有在跑的条目 → `active` + 最末一条在跑的
 * - 都没有 → `thinking`(表头显示 "Thinking" 或推理标题)
 */
export function groupHeaderState(
  unit: RenderUnit,
  {
    isLatestVisibleUnit,
    isTurnInProgress,
    isActivitySliceClosed,
    isExploring
  }: {
    isLatestVisibleUnit: boolean
    isTurnInProgress: boolean
    isActivitySliceClosed: boolean
    isExploring: boolean
  }
): GroupHeaderState {
  if (!(isLatestVisibleUnit && isTurnInProgress && !isActivitySliceClosed)) {
    return { kind: 'summary' }
  }
  if (isExploring) {
    const item = activeExplorationItem(unit)
    if (item != null) return { kind: 'active', item }
  }
  if (unit.kind === 'group') {
    for (let i = unit.items.length - 1; i >= 0; i--) {
      const item = unit.items[i]
      if (isItemInProgress(item)) return { kind: 'active', item }
    }
  }
  return { kind: 'thinking' }
}

// ── 聚合摘要(Codex `Ur` → `dr` → `fr`,文案段 `zg`)──────────

/**
 * 摘要段。Codex 的完整集合还含 loaded-tools / visualization /
 * stopped-file-creation / automatic-approval-review 失败计数,
 * WS 没有对应数据,只保留能落地的六种。
 */
export type GroupSummaryPart =
  | { kind: 'mcp-sources'; sources: { key: string; name: string }[] }
  | { kind: 'unnamed-mcp-calls'; count: number }
  | { kind: 'file-changes'; count: number }
  | { kind: 'exploration' }
  | { kind: 'commands'; count: number }
  | { kind: 'web-search' }
  | { kind: 'dynamic-tool-call'; key: string; name: string }

export interface GroupSummary {
  parts: GroupSummaryPart[]
  /** 表头图标对应的那一条(Codex `vr` 的 iconItem) */
  iconItem: ChatToolInvocationContent | null
}

/** MCP 条目的服务器名 → 来源描述(Codex `mr` 的 source 解析,WS 数据子集) */
function mcpSourceOf(invocation: ToolInvocation): { key: string; name: string } | null {
  const { data } = invocation
  if (data.kind !== 'inputOutput' || data.source.kind !== 'mcp') return null
  const { server, appName } = data.source
  if (server.trim().length === 0) return null
  // Codex 的 source.name 来自 app/连接器目录;WS 用 appName,退化到服务器名(title 档)
  return { key: server, name: appName ?? humanizeToolName(server) }
}

/**
 * Codex `dr`/`fr` —— 组的聚合摘要。
 *
 * 段序与 `fr` 逐项一致:mcp-sources → unnamed-mcp-calls → file-changes →
 * exploration → commands → web-search → dynamic-tool-call(追加在尾)。
 */
export function summarizeGroup(items: ChatToolInvocationContent[]): GroupSummary {
  const parts: GroupSummaryPart[] = []

  // mcp-sources:按服务器聚合(命名来源在前,与 `mr` 一致)
  const sourcesByKey = new Map<string, { key: string; name: string }>()
  let unnamedCount = 0
  for (const content of items) {
    const { invocation } = content
    if (invocation.data.kind !== 'inputOutput') continue
    const source = mcpSourceOf(invocation)
    if (source == null) {
      if (invocation.data.source.kind === 'mcp') unnamedCount++
      continue
    }
    sourcesByKey.set(source.key, source)
  }
  const sources = [...sourcesByKey.values()]
  if (sources.length > 0) parts.push({ kind: 'mcp-sources', sources })
  if (unnamedCount > 0) parts.push({ kind: 'unnamed-mcp-calls', count: unnamedCount })

  // file-changes:改动路径去重(Codex 按 created/edited/deleted 三个集合的并)
  const changedPaths = new Set<string>()
  for (const content of items) {
    const { data } = content.invocation
    if (data.kind === 'fileEdit')
      for (const c of data.changes) changedPaths.add(c.movedTo ?? c.path)
  }
  if (changedPaths.size > 0) parts.push({ kind: 'file-changes', count: changedPaths.size })

  // exploration:有探索类命令就给一段(Codex 的门槛是 exploredPaths/search/list 任一 > 0)
  const explorations = items.filter(isExplorationItem)
  if (explorations.length > 0) parts.push({ kind: 'exploration' })

  // commands:非探索类的终端命令数(Codex 还要剔 visualization/web-search 命令,WS 无)
  const commandCount = items.filter(
    (c) => c.invocation.data.kind === 'terminal' && !isExplorationItem(c)
  ).length
  if (commandCount > 0) parts.push({ kind: 'commands', count: commandCount })

  // web-search
  if (items.some((c) => c.invocation.data.kind === 'search')) {
    parts.push({ kind: 'web-search' })
  }

  // dynamic-tool-call:按去重后的工具各一段(Codex `_r` 按 completedSummaryPartKey 去重,
  // WS 没有那套注册表,按工具名去重)
  const dynamicSeen = new Set<string>()
  for (const content of items) {
    const { invocation } = content
    const { data } = invocation
    if (data.kind !== 'inputOutput' || data.source.kind !== 'dynamic') continue
    const key = invocation.toolId
    if (dynamicSeen.has(key)) continue
    dynamicSeen.add(key)
    parts.push({ kind: 'dynamic-tool-call', key, name: invocation.invocationMessage })
  }

  return { parts, iconItem: pickIconItem(items, parts) }
}

/** Codex `vr` —— 表头图标取自第一个摘要段对应的条目 */
function pickIconItem(
  items: ChatToolInvocationContent[],
  parts: GroupSummaryPart[]
): ChatToolInvocationContent | null {
  const first = parts[0]
  if (first == null) return null
  switch (first.kind) {
    case 'mcp-sources':
      return (
        items.find((c) => {
          const source = mcpSourceOf(c.invocation)
          return source != null && source.key === first.sources[0]?.key
        }) ?? null
      )
    case 'unnamed-mcp-calls':
      return (
        items.find(
          (c) => c.invocation.data.kind === 'inputOutput' && mcpSourceOf(c.invocation) == null
        ) ?? null
      )
    case 'file-changes':
      return items.find((c) => c.invocation.data.kind === 'fileEdit') ?? null
    case 'exploration':
      return items.find(isExplorationItem) ?? null
    case 'commands':
      return (
        items.find((c) => c.invocation.data.kind === 'terminal' && !isExplorationItem(c)) ?? null
      )
    case 'web-search':
      return items.find((c) => c.invocation.data.kind === 'search') ?? null
    case 'dynamic-tool-call':
      return items.find((c) => c.invocation.toolId === first.key) ?? null
  }
}

/**
 * 摘要段 → 文案(Codex `zg` + `Ug` 文案表)。
 *
 * 每段分 leading(句首)/ following(句中)两档措辞,首段大写。
 * Codex 的文案是 ICU MessageFormat;WS 没有 i18n 层,直接给英文串
 * (与 en 的 defaultMessage 逐字一致)。
 */
export function summaryPartText(part: GroupSummaryPart, isLeading: boolean): string {
  switch (part.kind) {
    case 'mcp-sources': {
      const names = formatConjunction(
        // Codex `Vg`:browser-use 来源显示成 "the browser";WS 无此来源,保留分支以对齐
        part.sources.map((s) => (s.key === 'browser-use' ? 'the browser' : s.name))
      )
      const isIntegration = part.sources.every((s) => s.key !== 'browser-use')
      const noun = part.sources.length === 1 ? 'integration' : 'integrations'
      if (isIntegration) {
        return isLeading ? `Used ${names} ${noun}` : `used ${names} ${noun}`
      }
      return isLeading ? `Used ${names}` : `used ${names}`
    }
    case 'unnamed-mcp-calls':
      return isLeading
        ? part.count === 1
          ? 'Called a tool'
          : 'Called tools'
        : part.count === 1
          ? 'called a tool'
          : 'called tools'
    case 'file-changes':
      return isLeading
        ? part.count === 1
          ? 'Edited a file'
          : 'Edited files'
        : part.count === 1
          ? 'edited a file'
          : 'edited files'
    case 'exploration':
      return isLeading ? 'Read files' : 'read files'
    case 'commands':
      return isLeading
        ? part.count === 1
          ? 'Ran a command'
          : 'Ran commands'
        : part.count === 1
          ? 'ran a command'
          : 'ran commands'
    case 'web-search':
      return isLeading ? 'Searched the web' : 'searched the web'
    case 'dynamic-tool-call':
      // 动态工具的段文案就是它的句首大写名;句中把首字母放回小写
      return isLeading ? part.name : lowerFirst(part.name)
  }
}

/** Codex 的 `intl.formatList(…, {type:'conjunction'})` */
function formatConjunction(names: string[]): string {
  return new Intl.ListFormat('en', { type: 'conjunction' }).format(names)
}

/** Codex 的 `intl.formatList(…, {type:'unit'})` —— 段与段之间的连接(", ") */
export function formatUnit(parts: string[]): string {
  return new Intl.ListFormat('en', { type: 'unit' }).format(parts)
}

function lowerFirst(text: string): string {
  return text.length === 0 ? text : `${text.slice(0, 1).toLowerCase()}${text.slice(1)}`
}

// ── 组表头用的零碎 ───────────────────────────────────────────

/** 组的可见子项(经 `ek` 过滤) */
export function visibleGroupChildren(unit: RenderUnit): ChatToolInvocationContent[] {
  if (unit.kind !== 'group') return []
  return unit.items.filter(isVisibleGroupChild)
}

/** Codex `orc` —— 组的定位锚 id 列表(空格连接)。web-search 条目在 Codex 里没有
 *  id/callId(`frc` 取不到),不产生定位锚 */
export function unitTargetIds(unit: RenderUnit): string | null {
  const toolIds = (c: ChatContent): string[] =>
    c.kind === 'toolInvocation' && c.invocation.data.kind !== 'search' ? [c.invocation.id] : []
  const ids = unit.kind === 'group' ? unit.items.flatMap(toolIds) : toolIds(unit.item)
  return ids.length === 0 ? null : ids.map(encodeURIComponent).join(' ')
}

/** 组的总条目数(折叠计数用,与 Codex `Ao` 一致:组按成员数计) */
export function countUnitItems(units: RenderUnit[]): number {
  return units.reduce((n, u) => n + (u.kind === 'group' ? u.items.length : 1), 0)
}
