import { activeExecLabel } from '../../model/toolActivityLabel.ts'
import type { ChatToolInvocationContent } from '../../model/content'

/**
 * 组表头 active 态的实况文案 —— Codex 的 `qO`。
 *
 * 按在跑的那条目的类型给:
 *
 * | 条目 | 文案 | 源 |
 * |---|---|---|
 * | 探索类 exec(read/search/list) | `<action>Reading</action> <detail>{目标}</detail>` | `$h`→`tg`→`og` 表 |
 * | 其余 exec | `Running {command}` | `agentActivity.runningCommand` |
 * | patch | `Editing files` | `agentActivity.editingFiles` |
 * | web-search | `Searching the web [for {query}]` | `agentActivity.searchingWeb*` |
 * | mcp / dynamic | 句首大写的工具名(`Xo`,与完成态同名) | —— |
 * | 其它一切 | `Thinking` | `thinkingShimmer.default` |
 *
 * ## 上一版错在哪
 *
 * 之前这里把 adapter 拼好的行摘要(`invocationMessage`)按**第一个空格**切成
 * action/detail。那是两套文案混用:行摘要是 `toolSummaryForCmd` 表(完整路径、
 * `Searched for foo in src/renderer`),组表头是 `og` 表(目录名、
 * `Searching files in renderer folder`)。切空格既拿不到 Codex 的措辞,
 * 也会在 `Searching for a b c` 这种句子上把 detail 切错。
 *
 * 现在两段由 `activeExecLabel` 从 `parsedCmd` 直接组装(与 Codex 同一个输入),
 * 渲染成 `YO`/`JO` 那两个 span:action 不换行、detail 可截断。
 *
 * 流光由调用方加(Codex 这里全部包 `hp`)。
 */
export function GroupActiveLabel({ item }: { item: ChatToolInvocationContent }): React.JSX.Element {
  const { invocation } = item
  const { data } = invocation

  switch (data.kind) {
    case 'terminal': {
      const interrupted =
        invocation.state.type === 'cancelled' && invocation.state.reason === 'interrupted'
      const label = activeExecLabel(data.parsedCmd, {
        command: data.commandForDisplay,
        interrupted,
        finished: invocation.state.type === 'completed'
      })
      if (label.detail == null) return <span className="whitespace-nowrap">{label.action}</span>
      return (
        <>
          {/* Codex `YO` —— action 段 */}
          <span className="whitespace-nowrap">{label.action}</span> {/* Codex `JO` —— detail 段 */}
          <span className="min-w-0 truncate">{label.detail}</span>
        </>
      )
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
