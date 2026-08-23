import type { SearchToolData, ToolInvocation } from '../../model/toolInvocation'
import { toolStatus, toolSummary } from '../../model/toolDisplay'
import { ToolActivityDisclosure } from '../activity'
import { ToolActivityIcon } from './ToolActivityIcon'

/**
 * 网页检索的活动行。
 *
 * Codex 的 `web-search` 条目实测文案是
 * `{status, select, completed {Searched the web} other {Searching the web}}`,
 * 图标是地球(与 exec 里"跑了个网络命令"同一个图标)。有查询词时 adapter 会
 * 拼成 "Searched the web for X" —— 与 Codex 的
 * `agentActivity.searchingWebForQuery` 同构。
 *
 * 没有结果时**不给展开体**:`ToolActivityDisclosure` 在 children 为空时不渲染
 * chevron、表头退回不可点的 `div` —— 一个点开是空的箭头比没有箭头更烦人,
 * 这条规则在 Codex 里是由"有没有 body"自动决定的,不需要调用方判断。
 */
export function SearchToolPart({
  invocation,
  data
}: {
  invocation: ToolInvocation
  data: SearchToolData
}): React.JSX.Element {
  return (
    <ToolActivityDisclosure
      icon={<ToolActivityIcon invocation={invocation} />}
      status={toolStatus(invocation)}
      summary={toolSummary(invocation)}
    >
      {data.results.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-1 text-size-chat text-token-conversation-body">
          {data.results.map((result, i) => (
            <li key={`${i}:${result.url ?? result.title}`} className="min-w-0 truncate">
              {result.url ? (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                  title={result.url}
                  className="text-token-link hover:underline"
                >
                  {result.title}
                </a>
              ) : (
                <span>{result.title}</span>
              )}
            </li>
          ))}
        </ul>
      ) : undefined}
    </ToolActivityDisclosure>
  )
}
