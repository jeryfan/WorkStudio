import type { ChatHookContent } from '../model/content'
import { Collapsible } from './Collapsible'

/**
 * 钩子注入的上下文 —— 对应上游的 chatHookContentPart.ts。
 *
 * 复用上游的折叠外壳与 `.chat-hook-details` / `.chat-hook-message` 结构，
 * 但语义不同：上游那个 part 表达的是钩子**拦截**了操作（Blocked by X hook），
 * 所以用 error/warning 图标；本项目协议的 `hookPrompt` 是钩子往对话里**追加
 * 了提示词**，没有拦截含义，用 `plug` 更贴切——用红色警告图标去标一件正常
 * 发生的事，只会让人以为出了问题。
 *
 * 默认收起：注入的提示词往往很长，而且是给模型看的，不是给人看的。
 */
export function HookPart({ content }: { content: ChatHookContent }): React.JSX.Element {
  return (
    <div className="chat-hook-content-part">
      <Collapsible icon="plug" title={content.title}>
        <div className="chat-hook-details">
          <div className="chat-hook-message">{content.body}</div>
        </div>
      </Collapsible>
    </div>
  )
}
