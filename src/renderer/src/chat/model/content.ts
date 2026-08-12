/**
 * 一条回复里的内容块。
 *
 * 对应上游的 `IChatRendererContent`（chat/common/model/chatViewModel.ts:223），
 * `chatListRenderer.ts:3055 renderChatContentPart` 就是对这个联合体 `kind` 的
 * 一个扁平 switch —— 本项目的 `ChatContentPart` 组件与它一一对应。
 *
 * 只保留本项目有数据源的 kind。上游另有 questionCarousel / planReview /
 * elicitation / mcpAuthentication / codeCitations / extensions / pullRequest /
 * undoStop 等，协议里没有对应事件，不实现。
 *
 * 反过来，末尾几个 `kind` 是上游没有、本项目协议特有的（上下文压缩、重连、
 * 审阅模式），按 VSCode 的视觉语言自造。
 */
import type { ToolInvocation } from './toolInvocation'

/** 助手的正文。流式期间会不断增长 */
export interface ChatMarkdownContent {
  kind: 'markdownContent'
  /** 原始 Markdown 文本。不预解析：流式期间每帧都会变 */
  content: string
}

/**
 * 推理块。
 *
 * 上游的 `IChatThinkingPart` 用 `id` 把同一段推理的多次增量合并成一块，
 * 标题（`generatedTitle`）从正文里抽。本项目的 `reasoning` 条目自带
 * `summary[]` / `content[]`，语义能对上。
 *
 * `items` 是多条而不是一整段：上游把每一段推理渲染成一个 `.chat-thinking-item`，
 * 用左侧的连接线串成"思维链"。合成一整段会丢掉这个结构。
 *
 * 没有 `durationMs`：上游会持久化推理耗时，本项目的协议不给这个字段。
 * 与其按轮次时间瞎算一个，不如不显示。
 */
export interface ChatThinkingContent {
  kind: 'thinking'
  id: string
  /** 折叠时显示的标题；未产出时为 null，UI 退回 "Thinking" */
  title: string | null
  /** 每一段推理一个条目 */
  items: string[]
  /** 仍在流式产出 —— 决定标题是否走 shimmer */
  isActive: boolean
}

/** 工具调用 */
export interface ChatToolInvocationContent {
  kind: 'toolInvocation'
  invocation: ToolInvocation
}

/**
 * 进度提示行。
 *
 * `id` 相同的后一条**替换**前一条而不是追加 —— 否则实时进度会一行行堆起来。
 */
export interface ChatProgressMessageContent {
  kind: 'progressMessage'
  id: string
  content: string
  /** 是否走流光。静止的进度行不该闪 */
  shimmer: boolean
}

/**
 * 钩子注入的上下文。
 *
 * 与上游的 `chatHookContentPart` 语义不完全相同：那边表达的是钩子**拦截**了
 * 操作（blocked / warning），本项目协议的 `hookPrompt` 是钩子往对话里**追加
 * 了提示词**。共用同一个折叠外壳，图标与文案按实际语义改。
 */
export interface ChatHookContent {
  kind: 'hook'
  id: string
  title: string
  body: string | null
}

/**
 * "工作中"指示 —— 对应上游的 `IChatWorkingProgress` /
 * `ChatWorkingProgressContentPart`。
 *
 * 追加在**未完成**回复的末尾，填补"已经发出去了、但还什么都没回来"的空档。
 * 上游把触发条件写在 `chatListRenderer.ts shouldShowWorkingProgress`，第一条
 * 就是 `!lastPart`——即这里最需要它的场景。
 *
 * 与上游的两点不同，都是为了让 adapter 保持纯函数：
 *
 * 1. 上游每次重渲染随机挑一句、靠 1200ms 防抖避免闪烁；这里按轮次 id 取模，
 *    同一轮永远是同一句，不需要计时器，也就不会闪。
 * 2. 上游在正文流式输出的间隙也会显示（靠 `hasBeenCaughtUpLongEnough` 判断
 *    "卡住了"）；那需要时间状态，这里干脆在有正文之后就不显示——正文正在
 *    一个字一个字冒出来，本身就是最好的进度指示。
 */
export interface ChatWorkingContent {
  kind: 'working'
  label: string
}

/** 轮次级失败/中断 */
export interface ChatErrorContent {
  kind: 'errorDetails'
  level: 'error' | 'warning' | 'info'
  message: string
  /** 是否是回复的最后一块 —— 决定要不要留出底部间距 */
  isLast: boolean
}

// ── 以下为本项目协议特有、上游无对应 part ──────────────────────────

/** 上下文压缩：一条带标签的分隔线 */
export interface ChatContextCompactionContent {
  kind: 'contextCompaction'
  id: string
}

/**
 * 流断开重连。
 *
 * 挂在它所属的那一轮，而不是会话底部的全局横幅：后台可能有别的会话也在跑，
 * 全局横幅说不清是谁在重连。
 */
export interface ChatReconnectContent {
  kind: 'reconnect'
  attempt: number
  maxAttempts: number
  /** 服务端过载（429）时换一句更准确的话 */
  serverOverloaded: boolean
  detail: string | null
}

/** 进入/退出审阅模式 */
export interface ChatReviewModeContent {
  kind: 'reviewMode'
  id: string
  entered: boolean
  review: string
}

export type ChatContent =
  | ChatMarkdownContent
  | ChatThinkingContent
  | ChatToolInvocationContent
  | ChatProgressMessageContent
  | ChatHookContent
  | ChatWorkingContent
  | ChatErrorContent
  | ChatContextCompactionContent
  | ChatReconnectContent
  | ChatReviewModeContent
