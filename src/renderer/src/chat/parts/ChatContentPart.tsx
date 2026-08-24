import type { ChatContent } from '../model/content'
import { MarkdownPart } from './MarkdownPart'
import { ChatErrorPart } from './ChatErrorPart'
import { ChatContextCompactionPart } from './ChatContextCompactionPart'
import { ChatReconnectPart } from './ChatReconnectPart'
import { ChatReviewModePart } from './ChatReviewModePart'
import { HookPart } from './HookPart'
import { ToolInvocationPart } from './ToolInvocationPart'

/**
 * 内容块 → 组件。
 *
 * 对应上游 `chatListRenderer.ts:3055 renderChatContentPart` 那个对 `kind` 的
 * 扁平 switch。保持扁平是有意的：内容块之间没有层级关系，任何"某类 part 归某类
 * 容器管"的分组都会在下一个不合群的 part 出现时塌掉。
 *
 * 每个 kind 都要显式列出，末尾靠 `never` 断言兜底 —— 将来给 ChatContent 加了
 * 新成员却忘了在这里处理，会在编译期报错，而不是在界面上少一块内容。
 */
export function ChatContentPart({ content }: { content: ChatContent }): React.JSX.Element | null {
  switch (content.kind) {
    case 'markdownContent':
      // ChatView 已在助手回复外层套了 codex-MarkdownRoot,这里不能再套一层
      return <MarkdownPart content={content} withRoot={false} />
    case 'errorDetails':
      return <ChatErrorPart content={content} />
    case 'contextCompaction':
      return <ChatContextCompactionPart />
    case 'toolInvocation':
      return <ToolInvocationPart content={content} />
    case 'hook':
      return <HookPart content={content} />
    case 'reconnect':
      return <ChatReconnectPart content={content} />
    case 'reviewMode':
      return <ChatReviewModePart content={content} />

    default: {
      const never: never = content
      throw new Error(`未处理的内容块：${JSON.stringify(never)}`)
    }
  }
}
