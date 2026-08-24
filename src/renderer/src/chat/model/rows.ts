/**
 * 列表行。
 *
 * 上游的对话列表是**请求行与回复行交替**的扁平列表（`.interactive-request` /
 * `.interactive-response`，见 chatListRenderer.ts:901 的模板），而不是"一轮"这样
 * 的复合单元。这一点必须跟着：虚拟滚动按行测量高度，一轮里如果既有用户消息又有
 * 几十个工具调用，它作为一整行会高得没法虚拟化。
 *
 * 所以 adapter 把一个 RuntimeTurn 拆成 1 个 request 行 + 1 个 response 行。
 */
import type { ChatContent } from './content'

/** 用户消息行 */
export interface ChatRequestRow {
  kind: 'request'
  id: string
  /** 消息正文（Markdown） */
  text: string
  /** 附件：文件引用、图片等 */
  attachments: { id: string; name: string; description: string | null; icon: string }[]
  /** 毫秒时间戳；用于底部的相对时间 */
  timestamp: number | null
}

/** 助手回复行 */
export interface ChatResponseRow {
  kind: 'response'
  id: string
  /** 按到达顺序排列的内容块(不含推理 —— 推理不进渲染流,见 content.ts) */
  content: ChatContent[]
  /**
   * 轮次状态行的文案来源 —— 最新一条推理的最后一行(Codex 的
   * `thinkingFallbackMessage`,经 `extractLastHeading` 从推理正文提取)。
   * 没有推理时为 null,状态行显示 "Thinking"。
   */
  thinkingFallback: string | null
  /** 轮次已收尾（无论成功、失败还是被停） */
  isComplete: boolean
  /** 被用户停止 */
  isCanceled: boolean
  startedAtMs: number | null
  completedAtMs: number | null
}

export type ThreadRow = ChatRequestRow | ChatResponseRow

/**
 * 行的 React key。
 *
 * 必须在流式过程中保持稳定：key 一变 React 会卸载重建整行，正在播放的
 * shimmer、已展开的折叠、Monaco 编辑器实例全部重来。所以用协议给的稳定 id，
 * 不用数组下标。
 */
export function rowKey(row: ThreadRow): string {
  return `${row.kind}:${row.id}`
}
