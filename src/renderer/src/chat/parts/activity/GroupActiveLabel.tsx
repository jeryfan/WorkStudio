import type { ChatToolInvocationContent } from '../../model/content'

/**
 * 组表头 active 态的实况文案 —— Codex 的 `qO`。
 *
 * 按在跑的那条目的类型给:
 *
 * | 条目 | 文案 |
 * |---|---|
 * | 探索类 exec(read/search/list) | `<action>Reading</action> <detail>{目标}</detail>` 双段(`$h`/`og` 文案族) |
 * | 其余 exec | `Running {command}` |
 * | patch | `Editing files` |
 * | web-search | `Searching the web [for {query}]` |
 * | mcp / dynamic | 句首大写的工具名(`Xo`) |
 *
 * 流光由调用方加(Codex 这里全部包 `hp`)。
 */
export function GroupActiveLabel({ item }: { item: ChatToolInvocationContent }): React.JSX.Element {
  const { invocation } = item
  const { data } = invocation

  switch (data.kind) {
    case 'terminal': {
      if (data.commandKind !== 'unknown') {
        // 探索命令:动词 + 目标两段。adapter 已把文案拼成 "Reading X" 形态,
        // 这里拆回 action/detail(Codex 是从 parsedCmd 结构直接组装的)
        const space = invocation.invocationMessage.indexOf(' ')
        const action =
          space === -1 ? invocation.invocationMessage : invocation.invocationMessage.slice(0, space)
        const detail = space === -1 ? '' : invocation.invocationMessage.slice(space + 1)
        return (
          <>
            <span className="whitespace-nowrap">{action}</span>{' '}
            <span className="min-w-0 truncate">{detail}</span>
          </>
        )
      }
      return <>Running {data.commandForDisplay.trim() || 'command'}</>
    }
    case 'fileEdit':
      return <>Editing files</>
    case 'search': {
      const query = data.query.trim()
      return query.length > 0 ? <>Searching the web for {query}</> : <>Searching the web</>
    }
    case 'inputOutput':
      // Xo:MCP/动态工具的活动文案与完成文案同名(句首大写工具名)
      return <>{invocation.invocationMessage}</>
  }
}
