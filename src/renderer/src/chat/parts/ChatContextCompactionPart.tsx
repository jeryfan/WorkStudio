/**
 * 上下文压缩分隔线。
 *
 * 上游没有这个 part —— VSCode 的上下文管理不向用户暴露。本项目的协议会推
 * `contextCompaction` 条目，不显示的话用户会看到 agent "突然忘了前面说过什么"
 * 而没有任何解释。
 *
 * 做成一条带标签的细线而不是卡片：它描述的是会话的结构性事件，不是 agent 的
 * 一次动作，视觉权重应当低于工具调用。
 */
export function ChatContextCompactionPart(): React.JSX.Element {
  return <div className="chat-context-compaction">Context compacted</div>
}
