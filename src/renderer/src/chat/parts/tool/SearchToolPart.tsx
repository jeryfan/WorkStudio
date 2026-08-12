import type { SearchToolData, ToolInvocation } from '../../model/toolInvocation'
import { Collapsible } from '../Collapsible'
import { ToolTitle } from './ToolTitle'
import { formatDuration } from '../../model/toolDisplay'

/**
 * 检索工具 —— 对应上游的 ChatResultListSubPart / ChatToolProgressSubPart。
 *
 * 上游在 `chatToolInvocationPart.ts` 里的分支是：**有结果就渲染成可折叠的
 * 结果列表，没有才退回一行进度**。之前这里只画了标题，等于把搜到的东西丢了，
 * 用户看到"Searched the web for X"却没有 X 的结果，会以为什么都没搜到。
 *
 * 结果的字段是协议明确声明的不透明 JSON，抽取在 adapter 里尽力而为；这里只
 * 负责显示：有 url 的做成可点链接，没有的当纯文本。
 */
export function SearchToolPart({
  invocation,
  data
}: {
  invocation: ToolInvocation
  data: SearchToolData
}): React.JSX.Element {
  const duration =
    invocation.state.type === 'completed' ? formatDuration(invocation.state.durationMs) : null

  const title = (
    <ToolTitle
      invocation={invocation}
      variant={data.results.length > 0 ? 'collapsible' : 'progress'}
      suffix={
        <>
          {data.results.length > 0 && <span>{data.results.length} results</span>}
          {duration && <span>{duration}</span>}
        </>
      }
    />
  )

  // 没有结果时不套折叠壳：一个点开是空的箭头比没有箭头更烦人
  if (data.results.length === 0) {
    return <div className="chat-tool-invocation-part chat-tool-simple">{title}</div>
  }

  return (
    <div className="chat-tool-invocation-part">
      <Collapsible title={title}>
        <ul className="chat-search-results">
          {data.results.map((result, i) => (
            <li key={`${i}:${result.url ?? result.title}`}>
              {result.url ? (
                <a href={result.url} target="_blank" rel="noreferrer" title={result.url}>
                  {result.title}
                </a>
              ) : (
                <span>{result.title}</span>
              )}
            </li>
          ))}
        </ul>
      </Collapsible>
    </div>
  )
}
