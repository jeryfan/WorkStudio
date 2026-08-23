import type { ReactNode } from 'react'

/**
 * 一个会话轮次 —— Codex 的 `data-turn-key` 结构。
 *
 *   div.relative.shrink-0                                    ← 每个 turn 一层
 *   └ div.flex.flex-col
 *     └ div
 *       └ div.[&_[data-virtualized-turn-content]]:[content-visibility:visible]
 *             [data-turn-key="<id>"]
 *         └ div.contents [data-content-search-turn-key="<id>"]
 *           └ div.flex.flex-col.gap-0
 *             ├ div.flex.flex-col      → 用户消息(ThreadUserMessage)
 *             ├ div.w-full             ← 分隔槽(空,靠 gap 撑)
 *             ├ div.flex.flex-col      → 中间过程条目
 *             ├ div.w-full
 *             └ div.flex.flex-col [data-local-conversation-final-assistant]  → 最终回复
 *
 * 两个 data 属性各有用途,不能省:
 * - `data-turn-key` 是滚动定位与"跳到这一轮"的锚点
 * - `data-content-search-turn-key` 给全文搜索用;它挂在 `div.contents` 上,
 *   所以不产生布局盒 —— 搜索能定位到轮次,但不影响 flex 计算
 *
 * `[&_[data-virtualized-turn-content]]:[content-visibility:visible]` 与外层滚动容器的
 * `[content-visibility:auto]` 配对:外层默认跳过视口外绘制,这里按需反向打开。
 */
export function ThreadTurn({
  turnKey,
  children
}: {
  turnKey: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="relative shrink-0">
      <div className="flex flex-col">
        <div>
          <div
            data-turn-key={turnKey}
            className="[&_[data-virtualized-turn-content]]:[content-visibility:visible]"
          >
            <div className="contents" data-content-search-turn-key={turnKey}>
              <div className="flex flex-col gap-0">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** turn 内部各段之间的分隔槽 —— Codex 用空的 div.w-full,靠外层 gap 生效 */
export function ThreadTurnGap(): React.JSX.Element {
  return <div className="w-full" />
}

/**
 * 用户消息 —— Codex 实测:
 *
 *   div.flex.flex-col
 *   └ div.scroll-mt-4 [data-content-search-unit-key][data-local-conversation-user-anchor]
 *     └ div.flex.flex-col.items-end.gap-2
 *       ├ h4.sr-only.select-none  «You said:»                  ← 屏幕阅读器锚点
 *       └ div.group.flex.w-full.flex-col.items-end.justify-end.gap-1
 *         ├ div.bg-token-foreground/5.max-w-[77%]…rounded-2xl.px-3.py-2   ← 气泡
 *         │   .[&_.contain-inline-size]:[contain:initial].text-start
 *         │   .focus-visible:ring-2.focus-visible:ring-token-focus-border
 *         └ div.flex.flex-row-reverse.items-center.gap-1                  ← 悬浮操作条
 *
 * 气泡宽度是 **max-w-[77%]** 这个奇怪的数,不是 max-w-3/4 —— 照抄。
 * `[&_.contain-inline-size]:[contain:initial]` 是为了让气泡里的表格/代码块
 * 不被父级的 contain 裁掉。
 */
export function ThreadUserMessage({
  unitKey,
  children,
  actions
}: {
  unitKey: string
  children: ReactNode
  actions?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col">
      <div
        className="scroll-mt-4"
        data-content-search-unit-key={unitKey}
        data-local-conversation-user-anchor="true"
      >
        <div className="flex flex-col items-end gap-2">
          <h4 className="sr-only select-none">You said:</h4>
          <div className="group flex w-full flex-col items-end justify-end gap-1">
            <div className="bg-token-foreground/5 max-w-[77%] min-w-0 overflow-hidden break-words rounded-2xl px-3 py-2 [&_.contain-inline-size]:[contain:initial] text-start focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none">
              <div className="flex flex-col items-end gap-1">
                <div className="relative w-full min-w-0 text-size-chat">{children}</div>
              </div>
            </div>
            <div className="flex flex-row-reverse items-center gap-1">
              <div className="me-1 ms-1 flex items-center gap-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                {actions}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 助手最终回复 —— Codex 实测:
 *
 *   div.flex.flex-col [data-local-conversation-final-assistant="true"]
 *   └ div [data-content-search-unit-key]
 *     └ div.group.flex.min-w-0.flex-col [data-response-annotation-conversation]
 *                                       [data-response-annotation-target]
 *       ├ h4.sr-only.select-none  «ChatGPT said:»
 *       ├ div.codex-MarkdownRoot…  [data-markdown-text-style="assistant-message"]
 *       └ div.mt-1.5.flex.h-5.items-center.justify-start.gap-0.5…   ← 操作条 + 时间
 *
 * 注意 `h4` 文案是 **"ChatGPT said:"**(不是 "Codex said:"),照抄。
 * 时间戳在 `span[data-assistant-message-sent-time]` 里,默认 opacity-0,hover 才显现。
 */
export function ThreadAssistantMessage({
  unitKey,
  conversationId,
  targetId,
  children,
  actions,
  sentTime
}: {
  unitKey: string
  conversationId?: string
  targetId?: string
  children: ReactNode
  actions?: ReactNode
  sentTime?: string
}): React.JSX.Element {
  return (
    <div className="flex flex-col" data-local-conversation-final-assistant="true">
      <div data-content-search-unit-key={unitKey}>
        <div
          className="group flex min-w-0 flex-col"
          data-response-annotation-conversation={conversationId}
          data-response-annotation-target={targetId}
        >
          <h4 className="sr-only select-none">ChatGPT said:</h4>
          {children}
          <div className="mt-1.5 flex h-5 items-center justify-start gap-0.5 electron:-translate-x-1 extension:-translate-x-1.5 [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-token-focus-border">
            <div className="flex h-full items-center gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
              {actions}
            </div>
            {sentTime && (
              <span
                data-assistant-message-sent-time="true"
                className="ms-1.5 flex h-full items-center opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
              >
                <span className="text-xs text-token-text-tertiary">{sentTime}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 中间过程条目容器(工具调用、思考、推理等) —— Codex 用
 * `div.flex.flex-col.gap-[var(--conversation-item-gap,16px)]` 包住一串条目,
 * 每个条目外面再套一个裸 div。带工具调用 id 的条目会多挂
 * `[data-local-conversation-item-target-ids]` + `outline-none`。
 */
export function ThreadItems({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col">
      <div>
        <div className="flex flex-col gap-[var(--conversation-item-gap,16px)]">{children}</div>
      </div>
    </div>
  )
}

/** 单个中间条目 —— targetIds 有值时挂 Codex 的定位属性 */
export function ThreadItem({
  targetIds,
  children
}: {
  targetIds?: string
  children: ReactNode
}): React.JSX.Element {
  if (targetIds) {
    return (
      <div className="outline-none" data-local-conversation-item-target-ids={targetIds}>
        {children}
      </div>
    )
  }
  return <div>{children}</div>
}
