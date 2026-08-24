import type { SearchToolData, ToolInvocation } from '../../model/toolInvocation'
import { toolStatus } from '../../model/toolDisplay'
import { ActivityHeaderRow } from '../activity'
import { CadencedShimmer } from '../CadencedShimmer'
import { ToolActivityIcon } from './ToolActivityIcon'

/**
 * 网页检索的活动行 —— Codex `subagent-activity-chip-group` 的 `nO`。
 *
 * 与上一版的两处实质差异:
 *
 * 1. **摘要是双段的**:`<label>Searched the web</label> <detailText>for {query}</detailText>`,
 *    两段各自带 `text-token-conversation-summary-leading` / `-trailing` 类
 *    (色调当前被表头的 `[&_*]:!text-token-conversation-body` 规则统一,
 *    但结构与 hover 行为以类名为准)。
 * 2. **没有展开体**:Codex 这一行不渲染检索结果(`nO` 只产出表头),
 *    上一版自创的结果列表删掉。表头因此是不可点的 `div`(没有 disclosure)。
 *
 * 查询词先过 Codex 的 `JD`/`ZD` 清理:`site:xxx` 操作符剥掉、域名收拢到
 * 尾部(`foo | a.com · b.com`),`OR` 换成空格。
 */

/** Codex `ZD` —— 查询词清理:site: 操作符 → 域名列表,OR → 空格 */
function cleanQuery(query: string): string {
  const domains: string[] = []
  const rest = query.replace(/\bsite:([^\s]+)/giu, (raw, host: string) => {
    try {
      const domain = new URL(`https://${host}`).hostname.replace(/^www\./u, '')
      if (!domains.includes(domain)) domains.push(domain)
      return ''
    } catch {
      return raw
    }
  })
  if (domains.length === 0) return query
  const cleaned = rest
    .replace(/\bOR\b/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  return cleaned.length === 0 ? query : `${cleaned} | ${domains.join(' · ')}`
}

/** Codex `XD` —— search 动作的查询词归一 */
function searchQueryText(query: string | null, queries: string[] | null): string {
  const q = query?.trim() ?? ''
  if (q) return cleanQuery(q)
  const first = queries?.map((x) => x.trim()).find((x) => x.length > 0) ?? ''
  return queries != null && queries.length > 1 && first
    ? `${cleanQuery(first)} ...`
    : cleanQuery(first)
}

/** Codex `YD` —— 检索条目的展示文本(action 优先,空则回 query) */
function detailText(data: SearchToolData): string {
  const { action } = data
  switch (action?.type) {
    case 'search':
      return searchQueryText(action.query, action.queries)
    case 'openPage':
      return action.url ?? ''
    case 'findInPage':
      return action.pattern && action.url
        ? `'${action.pattern}' in ${action.url}`
        : action.pattern
          ? `'${action.pattern}'`
          : (action.url ?? '')
    case 'other':
      return ''
    default:
      return data.query.trim()
  }
}

export function SearchToolPart({
  invocation,
  data
}: {
  invocation: ToolInvocation
  data: SearchToolData
}): React.JSX.Element {
  const running = toolStatus(invocation) === 'running'
  const detail = detailText(data)

  return (
    <ActivityHeaderRow
      icon={<ToolActivityIcon invocation={invocation} />}
      summary={
        <CadencedShimmer active={running} className="min-w-0 truncate text-size-chat">
          {detail.length > 0 ? (
            <>
              <span className="text-token-conversation-summary-leading group-hover:text-token-foreground">
                {running ? 'Searching the web' : 'Searched the web'}
              </span>{' '}
              <span className="text-token-conversation-summary-trailing group-hover:text-token-foreground">
                for {detail}
              </span>
            </>
          ) : (
            <span className="text-token-conversation-summary-leading group-hover:text-token-foreground">
              {running ? 'Searching the web' : 'Searched the web'}
            </span>
          )}
        </CadencedShimmer>
      }
    />
  )
}
