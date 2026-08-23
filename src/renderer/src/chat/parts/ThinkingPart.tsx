import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatThinkingContent } from '../model/content'
import { Collapsible } from './Collapsible'
import { Codicon } from './Codicon'
import { CadencedShimmer } from './CadencedShimmer'
import { MarkdownPart } from './MarkdownPart'

/**
 * 推理块 —— 对应上游的 chatThinkingContentPart.ts。
 *
 * 上游那个文件 2413 行，因为它还把工具调用嵌进思考框、带懒渲染与外部资源列表。
 * 这里做的是它**默认模式**的核心：`fixedScrolling`。
 *
 * 那个默认值很重要，之前做错了。`chat.agent.thinkingStyle` 默认是
 * `'fixedScrolling'`，配置里的说明是：
 *
 *   > Show thinking in a fixed-height streaming panel that auto-scrolls;
 *   > click header to expand to full height.
 *
 * 也就是说**推理进行中，正文是直接可见的**——一个 200px 高的窗口，自动滚动
 * 跟住最新几行。收起只发生在推理结束之后。做成"一直收起、要自己点开再滚到底"
 * 就把这块的意义抽掉了：用户想知道的正是此刻在想什么。
 *
 * 三处从上游照搬的判断：
 *
 * 1. **自动滚动只在用户没有往上翻时生效**（上游 `handleScroll` 里的
 *    `scrollTop >= maxScrollTop - 10`）。翻上去看前面几步时被拽回底部，
 *    比不滚还烦。
 *
 * 2. **上下渐隐遮罩跟着滚动位置走**，让被截断的行淡出而不是硬切。
 *
 * 3. **点标题展开到完整高度**，再点收起。
 */

/** 上游 THINKING_SCROLL_MAX_HEIGHT */
const SCROLL_MAX_HEIGHT = 200

export function ThinkingPart({ content }: { content: ChatThinkingContent }): React.JSX.Element {
  const title = content.title ?? 'Thinking'
  const [userExpanded, setUserExpanded] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const autoScroll = useRef(true)
  const [fade, setFade] = useState({ top: false, bottom: false })

  // 进行中：正文常显（固定高度的滚动窗）。结束后回到普通折叠块。
  const streaming = content.isActive && !userExpanded
  const expanded = content.isActive || userExpanded

  const updateFade = useCallback((el: HTMLDivElement) => {
    const max = el.scrollHeight - el.clientHeight
    setFade({ top: el.scrollTop > 5, bottom: max > 0 && el.scrollTop < max - 5 })
  }, [])

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      const max = el.scrollHeight - el.clientHeight
      // 容差 10px 与上游一致：贴底判定太严会因为亚像素误差反复失灵
      autoScroll.current = max <= 0 || el.scrollTop >= max - 10
      updateFade(el)
    },
    [updateFade]
  )

  // 新的推理段落到达时跟住底部
  useEffect(() => {
    const el = body.current
    if (!el || !streaming) return
    if (autoScroll.current) el.scrollTop = el.scrollHeight
    updateFade(el)
  }, [content.items, streaming, updateFade])

  return (
    <Collapsible
      className={[
        'chat-thinking-box',
        content.isActive ? 'chat-thinking-active' : null,
        streaming ? 'chat-thinking-streaming' : null,
        streaming && fade.top ? 'chat-thinking-fade-top' : null,
        streaming && fade.bottom ? 'chat-thinking-fade-bottom' : null
      ]
        .filter(Boolean)
        .join(' ')}
      expanded={expanded}
      onToggle={() => setUserExpanded((v) => !v)}
      title={
        <span className={content.isActive ? 'chat-thinking-title-shimmer' : ''}>
          {content.isActive ? <CadencedShimmer>{title}</CadencedShimmer> : title}
        </span>
      }
      bodyRef={body}
      bodyStyle={streaming ? { maxHeight: SCROLL_MAX_HEIGHT, overflowY: 'auto' } : undefined}
      onBodyScroll={onScroll}
    >
      <div className="chat-used-context-list chat-thinking-collapsible">
        {content.items.map((item, i) => (
          <div key={i} className="chat-thinking-item markdown-content">
            <span className="chat-thinking-icon">
              <Codicon name="circle-filled" />
            </span>
            {/*
             * 推理正文走完整的 Markdown 渲染，不是纯文本。
             * Codex 的推理摘要形如 `**小标题**\n\n正文`，当纯文本渲染会把
             * 星号原样显示出来。
             */}
            <MarkdownPart content={{ kind: 'markdownContent', content: item }} />
          </div>
        ))}

        {/*
         * 还在想时的末行。图标是**实心圆点**不是转圈——上游这里用的就是
         * `createThinkingIcon(Codicon.circleFilled)`，活动由文字流光表达，
         * 与工具行同一条规则。
         */}
        {content.isActive && (
          <div className="chat-thinking-item chat-thinking-spinner-item">
            <span className="chat-thinking-icon">
              <Codicon name="circle-filled" />
            </span>
            <span className="chat-thinking-spinner-label">
              <CadencedShimmer>Thinking</CadencedShimmer>
            </span>
          </div>
        )}
      </div>
    </Collapsible>
  )
}
