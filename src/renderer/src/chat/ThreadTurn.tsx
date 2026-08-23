import { useState } from 'react'
import type { ReactNode } from 'react'
import { SubmenuChevronIcon } from '../components/icons'
import { cx } from '../utils/cx'

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

/**
 * 过程段 —— turn 的**中间那一段**,折叠头写着「Worked for 1m 28s」。
 *
 * 实测(Codex,展开/折叠各抓一次):
 *
 * ```
 * div.flex.flex-col                                          ← 本组件的根
 * ├ div.text-size-chat.text-token-text-secondary
 * │ └ button[type=button][aria-expanded]
 * │     .inline-flex.items-center.gap-1.rounded-md.border.border-transparent.text-size-chat
 * │     .focus-visible:ring-2.focus-visible:ring-token-focus-border.focus-visible:outline-none
 * │   └ span > span.text-token-conversation-body  «Worked for 1m 28s»
 * ├ div.pt-1.text-size-chat.text-token-text-secondary
 * │ └ div.w-full.border-t.border-token-border                ← 折叠态**只剩这条发丝线**
 * └ [仅展开时存在的第三个兄弟] div
 *   ├ div.w-full[aria-hidden="true"]
 *   └ div.flex.flex-col.gap-[var(--conversation-item-gap,16px)]  ← 过程条目列表
 * ```
 *
 * 几个实测要点:
 * - **那条 `border-t` 折叠时也在**,不是展开才有的分隔线 —— 它是折叠头下面
 *   固定的一条发丝线,展开的内容追加在它**之后**。
 * - 展开的内容是**第三个兄弟**,不是塞进第二个 div 里;它自己又先放一个
 *   `div.w-full[aria-hidden]` 空隔离元素,再接条目列表。
 * - 条目间距走 `--conversation-item-gap`(16px),不写死。
 * - chevron 是 button 的**第二个子元素**(svg,与那个 span 平级),不是伪元素。
 *   上一轮没抓到是因为我的 dump 把 `SVG` 放进了 skip 名单里,不是 Codex 没有。
 *   实测类名:`icon-2xs text-token-conversation-summary-trailing
 *   transition-transform duration-basic`,展开时追加 **`rotate-90`** ——
 *   所以它本体是个**朝右**的 chevron,展开时转 90° 变朝下。path 与
 *   `SubmenuChevronIcon` 完全一致(已复用,没有新建图标)。
 *
 * 默认折叠:实测重新打开已完成会话时 `aria-expanded="false"`。
 * 运行中是否默认展开还没实测,所以把初始值交给调用方(`defaultExpanded`)。
 */
export function ThreadProcessSection({
  children,
  durationLabel,
  defaultExpanded = false
}: {
  children: ReactNode
  /** 折叠头文案,例如 `Worked for 1m 28s` */
  durationLabel: string
  defaultExpanded?: boolean
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded)
  return (
    <div className="flex flex-col">
      <div className="text-size-chat text-token-text-secondary">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border border-transparent text-size-chat focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none"
        >
          <span>
            <span className="text-token-conversation-body">{durationLabel}</span>
          </span>
          <SubmenuChevronIcon
            className={cx(
              'icon-2xs text-token-conversation-summary-trailing transition-transform duration-basic',
              expanded && 'rotate-90'
            )}
          />
        </button>
      </div>
      <div className="pt-1 text-size-chat text-token-text-secondary">
        <div className="w-full border-t border-token-border" />
      </div>
      {expanded && (
        <div>
          <div className="w-full" aria-hidden="true" />
          <div className="flex flex-col gap-[var(--conversation-item-gap,16px)]">{children}</div>
        </div>
      )}
    </div>
  )
}

/**
 * 工具活动行的表头 —— Codex 的 `group/activity-header`。
 *
 * 实测**两种形态,标签不同**,取决于这条活动有没有可展开的细节:
 *
 * ```
 * // 有细节(如 "Searched the web for …",点开看结果)
 * button.group/activity-header.inline-flex.min-w-0.max-w-full.self-start.items-center.gap-1.p-0
 *       .text-start.cursor-interaction  [aria-expanded]
 * └ span.inline-flex.min-w-0.gap-1.5.items-center.shrink.truncate.text-size-chat
 *   └ span.text-token-conversation-body.flex.min-w-0.max-w-full.items-center.truncate.shrink
 *         .group-hover/activity-header:text-token-foreground
 *     └ span.flex.min-h-4.max-w-full.min-w-0.items-center.truncate
 *       └ span.inline-flex.min-w-0.gap-1.5.items-center.max-w-full.overflow-hidden
 *         └ span.contents.text-token-conversation-body  → svg.icon-xs.shrink-0 + 文字
 *
 * // 无细节(如只写 "Searched the web")
 * div.group/activity-header.inline-flex.min-w-0.max-w-full.self-start.items-center.gap-1.p-0
 *     .text-start.max-w-full            ← 注意 max-w-full 出现两次,且没有 cursor-interaction
 * └ span.inline-flex.min-w-0.gap-1.5.items-center.shrink.truncate.text-size-chat
 *   └ span.contents.text-token-conversation-body   ← **直接到 contents,少三层**
 * ```
 *
 * 差别不是可有可无的:可展开那版多出的三层里,`group-hover/activity-header:…`
 * 那层负责 hover 变色(不可点的那版不该有 hover 反馈),`min-h-4` 那层保证
 * 单行高度稳定。所以按 `onToggle` 有无分流,不要合成一个。
 *
 * 外面还有一层条目壳(实测 `div.min-w-0.text-size-chat.relative.overflow-visible.py-0`
 * → `div.flex.min-w-0.flex-col`),由 ThreadActivityItem 提供。
 */
export function ThreadActivityHeader({
  icon,
  label,
  expanded,
  onToggle
}: {
  icon?: ReactNode
  label: ReactNode
  expanded?: boolean
  /** 传了才是可展开的那一档(渲染成 button) */
  onToggle?(): void
}): React.JSX.Element {
  const inner = (
    <span className="contents text-token-conversation-body">
      {icon}
      {label}
    </span>
  )
  if (onToggle == null) {
    return (
      <div className="group/activity-header inline-flex min-w-0 max-w-full self-start items-center gap-1 p-0 text-start max-w-full">
        <span className="inline-flex min-w-0 gap-1.5 items-center shrink truncate text-size-chat">
          {inner}
        </span>
      </div>
    )
  }
  return (
    <button
      type="button"
      aria-expanded={expanded ?? false}
      onClick={onToggle}
      className="group/activity-header inline-flex min-w-0 max-w-full self-start items-center gap-1 p-0 text-start cursor-interaction"
    >
      <span className="inline-flex min-w-0 gap-1.5 items-center shrink truncate text-size-chat">
        <span className="text-token-conversation-body flex min-w-0 max-w-full items-center truncate shrink group-hover/activity-header:text-token-foreground">
          <span className="flex min-h-4 max-w-full min-w-0 items-center truncate">
            <span className="inline-flex min-w-0 gap-1.5 items-center max-w-full overflow-hidden">
              {inner}
            </span>
          </span>
        </span>
      </span>
    </button>
  )
}

/** 活动条目的外壳 —— 实测 `div.min-w-0.text-size-chat.relative.overflow-visible.py-0 > div.flex.min-w-0.flex-col` */
export function ThreadActivityItem({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="min-w-0 text-size-chat relative overflow-visible py-0">
      <div className="flex min-w-0 flex-col">{children}</div>
    </div>
  )
}
