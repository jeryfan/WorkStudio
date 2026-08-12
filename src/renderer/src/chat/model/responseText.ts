/**
 * 回复的纯文本。
 *
 * 用于"复制"按钮。只取 Markdown 正文，不含工具调用、推理、错误提示——
 * 用户点复制想要的是这条回答本身，把工具输出和思考过程一起塞进剪贴板
 * 只会让人再手工删一遍。
 */
import type { ChatResponseRow } from './rows'

export function responsePlainText(row: ChatResponseRow): string {
  return row.content
    .filter((c) => c.kind === 'markdownContent')
    .map((c) => c.content)
    .join('\n\n')
    .trim()
}
