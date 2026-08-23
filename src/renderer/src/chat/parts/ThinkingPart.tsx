import { useState } from 'react'
import type { ChatThinkingContent } from '../model/content'
import { CadencedShimmer } from './CadencedShimmer'
import { MarkdownPart } from './MarkdownPart'
import { ActivityHeader, ActivityRow, DisclosureBody, ScrollFadeStack } from './activity'
import { cx } from '../../utils/cx'

/**
 * 推理块 —— 照 Codex 的 `reasoning` 条目重写
 * (`subagent-activity-chip-group-DtZM0hSI.js` 源码 `LT`)。
 *
 * ```
 * ActivityRow
 * ├ header = ActivityHeader disclosure={hasBody ? {expanded, onToggle} : undefined}
 * │   └ CadencedShimmer active={streaming}
 * │       className="text-token-conversation-header text-size-chat truncate
 * │                  group-hover/activity-header:text-token-foreground"
 * │     «Thinking» | «Thought for 12s» | «Thought»
 * └ body = motion.div(高度动画)
 *   └ ActivityBody variant="flush"
 *     └ ScrollFadeStack maxHeight 8.75rem, autoScrollToBottom={streaming}
 *       └ 一整块 markdown
 * ```
 *
 * ## 上一版(照 VS Code 抄的)错在哪
 *
 * | 上一版 | Codex 实测 |
 * |---|---|
 * | 每段推理一个 `.chat-thinking-item` + `codicon-circle-filled` 圆点,连成思维链 | **一整块 markdown**,没有分段、没有圆点 |
 * | 标题固定 "Thinking" | `Thinking` / `Thought for {elapsed}` / `Thought` 三档 |
 * | 固定高度 200px(VS Code 的 `THINKING_SCROLL_MAX_HEIGHT`) | **8.75rem = 140px** |
 * | ResizeObserver + `scrollTop` 手写贴底 | `flex flex-col-reverse`(CSS) |
 * | `onScroll` 里算上下渐隐、切四个类 | `vertical-scroll-fade-mask` + 滚动驱动动画(CSS) |
 * | 折叠壳是 `.chat-used-context` + grid 动画 | `ActivityRow` + 测高的 motion 动画 |
 *
 * 所以整个 `updateFade` / `autoScroll` / `onScroll` 都删掉了 —— 不是简化,
 * 是那两件事在 Codex 里根本不由 JS 做。
 *
 * ## 三个仍然照抄的判断
 *
 * 1. **推理正文里的开头粗体小标题要剥掉**。Codex 的 `reasoning-item-heading`
 *    模块专门干这个(匹配开头的 `**…**` 或 `# … / ## … / ### …`),因为那句
 *    标题是给"活动摘要"用的,留在正文里会和上面的表头重复一遍。
 * 2. **流式期间正文默认可见**(有内容就展开),结束后回到用户控制、默认收起。
 * 3. **markdown 的排版被压过一遍**:`[&_*]:text-token-non-assistant-body-descendant`
 *    让推理正文比最终回复淡一档 —— 它不是回答,不该抢注意力。
 */

/** Codex 实测:推理正文的滚动窗高度三档都是 8.75rem(140px) */
const MAX_HEIGHT = '8.75rem'

/**
 * Codex `reasoning-item-heading` 的 `stripHeading` —— 剥掉正文开头那句
 * `**小标题**` 或 `### 小标题`。
 *
 * Codex 还有一条走 markdown AST 的完整实现(处理 `<!-- -->` 注释、
 * 单个 `strong` 段落等),这里只做那两个正则分支 —— 剩下的情形原样返回,
 * 最坏结果是标题在正文里重复一次,不会渲染错。
 */
function stripHeading(text: string): string {
  const trimmed = text.trimStart()
  const bold = /^\*\*[^\n]*?\*\*\s*/.exec(trimmed)
  if (bold) return trimmed.slice(bold[0].length).trim()
  const hash = /^#{1,3}[ \t]+([^#\\*_[\]`<>&\r\n]+)(?:\r?\n|$)/.exec(text)
  if (hash?.[1]?.trim()) return text.slice(hash[0].length).trim()
  return text
}

export function ThinkingPart({ content }: { content: ChatThinkingContent }): React.JSX.Element {
  const [userExpanded, setUserExpanded] = useState(false)
  const streaming = content.isActive

  // 各段推理拼成一整块 —— Codex 的 reasoning 条目本来就是一个 content 字符串
  const body = stripHeading(content.items.join('\n\n'))
  const hasBody = body.length > 0
  // 流式期间正文常显;结束后交给用户,默认收起
  const expanded = streaming ? hasBody : userExpanded && hasBody

  return (
    <ActivityRow
      header={
        <ActivityHeader
          disclosure={
            hasBody && !streaming
              ? { expanded: userExpanded, onToggle: () => setUserExpanded((v) => !v) }
              : undefined
          }
        >
          <CadencedShimmer
            active={streaming}
            className="text-token-conversation-header text-size-chat truncate group-hover/activity-header:text-token-foreground"
          >
            {label(content)}
          </CadencedShimmer>
        </ActivityHeader>
      }
      body={
        hasBody ? (
          <DisclosureBody expanded={expanded} variant="flush">
            <ScrollFadeStack
              items={[
                {
                  key: 'reasoning-markdown',
                  node: (
                    <div
                      className={cx(
                        'text-token-conversation-body [&_*]:text-token-non-assistant-body-descendant',
                        'break-words text-size-chat [&_*]:text-size-chat',
                        '[&>h1]:mt-2 [&>h2]:mt-2 [&>h3]:mt-2',
                        '[&>h1+*]:mt-1 [&>h2+*]:mt-1 [&>h3+*]:mt-1 [&>p+p]:mt-1'
                      )}
                    >
                      <MarkdownPart
                        content={{ kind: 'markdownContent', content: body }}
                        withRoot={false}
                      />
                    </div>
                  )
                }
              ]}
              autoScrollToBottom={streaming}
              contentClassName="gap-0"
              maxHeightByState={{ preview: MAX_HEIGHT, expanded: MAX_HEIGHT, collapsed: '0px' }}
              viewState="expanded"
              className="[--edge-fade-distance:1rem]"
            />
          </DisclosureBody>
        ) : undefined
      }
    />
  )
}

/**
 * 表头文案 —— Codex 的三档(`BT(streaming, elapsed)`):
 *
 * | 状态 | 文案 id | 文案 |
 * |---|---|---|
 * | 进行中 | `reasoningItem.thinking` | `Thinking` |
 * | 已完成 + 有耗时 | `reasoningItem.thoughtWithElapsed` | `Thought for {elapsed}` |
 * | 已完成 + 无耗时 | `reasoningItem.thought` | `Thought` |
 *
 * **注意它不用推理正文里的小标题当表头。** 我第一版写的是
 * `content.title ?? 'Thought'`,截图里就露馅了:完成的推理块表头显示成
 * 「核对求值规则」,而 Codex 显示的是「Thought」。
 *
 * Codex 对那句小标题的处理是**从正文里剥掉然后丢开**(`stripHeading`),
 * 另有一条 `extractLastHeading` 把它喂给**轮次级的活动摘要**(那是另一个
 * 表面,WS 还没有)。所以标题不是"该显示在这里但被漏掉了",而是
 * 属于别的地方 —— 显示在这里会和正文的第一行重复一遍。
 *
 * WS 的协议不给推理耗时(见 `ChatThinkingContent` 的注释),所以只有
 * `Thinking` / `Thought` 两档能落地 —— 没有耗时时 Codex 走的也正是 `Thought`。
 */
function label(content: ChatThinkingContent): string {
  return content.isActive ? 'Thinking' : 'Thought'
}
