import { useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SubmenuChevronIcon } from '../components/icons'
import { cx } from '../utils/cx'
import { preserveViewportPosition, windowZoom } from './preserveViewportPosition'

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

/**
 * turn 内部各段之间的分隔槽 —— Codex 的 `ConversationItemGap`(源码 `XC`)。
 *
 * ```
 * <div aria-hidden className="w-full"
 *      style={{height: variant === 'grouped'
 *        ? 'var(--conversation-grouped-item-gap, 4px)'
 *        : 'var(--conversation-item-gap, 16px)'}} />
 * ```
 *
 * **高度是内联给的,不是靠父级的 gap。** 上一轮我只写了 `<div className="w-full"/>`
 * ——而 turn 的容器是 `flex flex-col gap-0`,于是这些分隔槽的实际高度是 **0**:
 * 用户消息、过程段、最终回复三段全贴在一起。DOM 结构对了,间距全丢了,
 * 而且因为节点确实存在,结构 diff 也看不出问题。
 *
 * 这也解释了 Codex 为什么把 `gap-0` 显式写在容器上:间距**只能**由这些槽提供,
 * 容器不许有自己的 gap,否则两套间距会叠加。
 */
export function ThreadTurnGap({
  variant = 'item'
}: {
  variant?: 'item' | 'grouped'
} = {}): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="w-full"
      style={{
        height:
          variant === 'grouped'
            ? 'var(--conversation-grouped-item-gap, 4px)'
            : 'var(--conversation-item-gap, 16px)'
      }}
    />
  )
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
 *
 * ## `showToggle` 为假时:**按钮和发丝线一起消失**
 *
 * 这不是"折叠头一直在、只是不能点",Codex 源码(`Io`)把两者放在同一个三元里:
 *
 * ```jsx
 * {showToggle ? <>
 *    <CollapsedTurnSummary …/>
 *    <div className="pt-1 …"><div className="w-full border-t border-token-border"/></div>
 * </> : null}
 * …
 * {!isCollapsed && content != null ? (
 *   <motion.div …>{showToggle ? <Gap/> : null}{content}</motion.div>
 * ) : null}
 * ```
 *
 * 三个连带的细节:
 * - `isCollapsed = showToggle && collapsed` —— 没有折叠头就不可能是折叠态,
 *   过程条目**无条件摊开**。
 * - 内容前面那个 16px 间隔槽也只在有折叠头时才有 —— 它隔开的是"发丝线与条目",
 *   没有发丝线就没有要隔开的东西。
 * - 入场动画的 `motion.div` **两种情况都在**(不是只在展开时才包),
 *   所以摊开态的进入方式与展开态一致。
 *
 * 什么时候为假见 `ChatView` 的 `shouldShowProcessToggle` —— 一句话:
 * 最终回答那条的 `phase` 不是 `final_answer` 就没有折叠头。
 */
export function ThreadProcessSection({
  children,
  summary,
  showToggle = true,
  defaultExpanded = false
}: {
  children: ReactNode
  /** 折叠头文案 —— `Worked for 1m 28s` 或 `3 previous messages`,见 turnSummaryLabel */
  summary: string
  /** Codex 的 `showToggle`(`Ln`)。为假时没有按钮、没有发丝线,内容摊开 */
  showToggle?: boolean
  defaultExpanded?: boolean
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded)
  // Codex 的 `isCollapsed = Ln && Nn` —— 没有折叠头就谈不上折叠
  const collapsed = showToggle && !expanded
  return (
    <div className="flex flex-col">
      {showToggle && (
        <>
          <div className="text-size-chat text-token-text-secondary">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={(e) => {
                /*
                 * **先记基准,再改 state。** 滚动容器是反向 flex(贴底跟随),
                 * 于是内容长高时 P 之前的部分整体上移 —— 折叠头就在自己展开内容的
                 * 前面,点一下它自己就往上跳(实测 51px / 74px)。
                 *
                 * Codex 在**同一个位置**做同一件事:`Ge(e.currentTarget, u)`
                 * (local-conversation-turn 源码,`u` 是窗口 zoom),
                 * 详见 preserveViewportPosition 的注释。
                 * 基准必须在这个同步回调里取 —— 等到 effect 里布局已经变了。
                 */
                preserveViewportPosition(e.currentTarget, windowZoom())
                setExpanded((v) => !v)
              }}
              className="inline-flex items-center gap-1 rounded-md border border-transparent text-size-chat focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none"
            >
              <span>
                <span className="text-token-conversation-body">{summary}</span>
              </span>
              <SubmenuChevronIcon
                className={cx(
                  'icon-2xs text-token-conversation-summary-trailing transition-transform duration-basic',
                  // Codex 折叠时写的是显式的 `rotate-0`,不是"不加类" —— 照抄
                  expanded ? 'rotate-90' : 'rotate-0'
                )}
              />
            </button>
          </div>
          <div className="pt-1 text-size-chat text-token-text-secondary">
            <div className="w-full border-t border-token-border" />
          </div>
        </>
      )}
      {/*
       * 展开的内容是**第三个兄弟**,而且带入场动画 —— Codex 用 AnimatePresence
       * 包一个 `motion.div`:透明度 0→1、`translateY(-8px)→0`,
       * 220ms / `cubic-bezier(.33,1,.68,1)`(reduced-motion 时 120ms 且不位移)。
       * 之前是硬切,展开会"跳"出来。
       */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, transform: 'translateY(-8px)' }}
            animate={{ opacity: 1, transform: 'translateY(0)' }}
            transition={{ duration: 0.22, ease: [0.33, 1, 0.68, 1] }}
          >
            {showToggle && <ThreadTurnGap />}
            <div className="flex flex-col gap-[var(--conversation-item-gap,16px)]">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
