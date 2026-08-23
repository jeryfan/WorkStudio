import { useState } from 'react'
import type { ChatHookContent } from '../model/content'
import { ActivityHeaderRow, DisclosureBody } from './activity'

/**
 * 钩子注入的上下文。
 *
 * **Codex 没有对应的条目类型** —— 这是本项目协议特有的 `hookPrompt`
 * (钩子往对话里追加了提示词)。所以这里不是"复刻 Codex 的某个组件",而是用
 * Codex 的活动行原语表达一个它没有的语义:一行摘要 + 可展开的正文。
 *
 * 不给图标:`Fg()` 里没有 hook 这一档,随便挑一个 Codex 图标去代表它会造出
 * 一个 Codex 里不存在的图标语义。没有图标的活动行是合法形态(推理块就是)。
 *
 * 默认收起:注入的提示词往往很长,而且是给模型看的,不是给人看的。
 */
export function HookPart({ content }: { content: ChatHookContent }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const hasBody = content.body != null && content.body.length > 0

  return (
    <ActivityHeaderRow
      summary={content.title}
      disclosure={hasBody ? { expanded, onToggle: () => setExpanded((v) => !v) } : undefined}
      body={
        hasBody ? (
          <DisclosureBody expanded={expanded}>
            <div className="min-w-0 whitespace-pre-wrap break-words text-size-chat text-token-conversation-body">
              {content.body}
            </div>
          </DisclosureBody>
        ) : undefined
      }
    />
  )
}
