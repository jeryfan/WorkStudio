import type { ChatWorkingContent } from '../model/content'
import { CadencedShimmer } from './CadencedShimmer'
import { ActivityHeader, ActivityRow } from './activity'

/**
 * "工作中" —— 追加在**未完成**回复的末尾,填补"已经发出去了、但还什么都没回来"
 * 的空档。
 *
 * Codex 没有单独的 `working` 条目,但它有等价物:活动摘要那一行
 * (`localConversation.agentActivity.*`,例如 `Running command` /
 * `Editing files` / `Searching the web`),形态就是**一行走流光的摘要、
 * 没有图标、不可展开**。这里用同一套原语表达。
 *
 * 之前是 `.progress-container.shimmer-progress` + `.rendered-markdown.progress-step`
 * 那一串 VS Code 类名,靠共享 CSS 里的 `.shimmer-progress > .codicon {display:none}`
 * 把图标藏掉 —— 现在干脆不渲染图标,规则由结构本身表达。
 */
export function ChatWorkingPart({ content }: { content: ChatWorkingContent }): React.JSX.Element {
  return (
    <ActivityRow
      header={
        <ActivityHeader>
          <CadencedShimmer className="min-w-0 truncate text-size-chat text-token-conversation-summary-leading">
            {content.label}
          </CadencedShimmer>
        </ActivityHeader>
      }
    />
  )
}
