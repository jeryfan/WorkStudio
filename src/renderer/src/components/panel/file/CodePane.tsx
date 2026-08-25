import { useEffect, useRef } from 'react'

interface CodePaneProps {
  /** shiki 生成的 HTML（含 span.line 分行），null = 未选择文件 */
  html: string | null
  loading: boolean
  lineCount: number
  /**
   * 要露出的行(1 基)—— Codex 文件 tab 的 `initialLine`(`file.ts:12` 这类引用带来的)。
   * Codex 的 pierre 查看器还会给行范围画选中带并在处理完回调 `onLineRevealHandled`;
   * 那部分属于未移植的富查看器(`Myo`),这里只做滚动露出。
   */
  revealLine?: number
}

/** 行高与行号槽的 leading 一致(25px);滚动位置按它算 */
const LINE_HEIGHT = 25

/**
 * 代码预览区（panel/1.html .code-pane 第 115-136 行）：
 * 56px 行号槽 + 13px/25px 等宽代码，只读预览。
 */
export function CodePane({
  html,
  loading,
  lineCount,
  revealLine
}: CodePaneProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el == null || html == null || revealLine == null || revealLine < 1) return
    // 露出的行放在视口 1/3 处(Codex 的 reveal 是 scrollIntoView 居中偏上的效果)
    const target = (revealLine - 1) * LINE_HEIGHT - el.clientHeight / 3
    el.scrollTop = Math.max(0, target)
  }, [html, revealLine])

  if (!html) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-token-description-foreground">
        {loading ? 'Loading…' : 'Select a file to preview'}
      </div>
    )
  }
  return (
    <div ref={scrollRef} className="h-full overflow-auto pb-[118px]">
      <div className="flex items-start">
        <div className="w-14 shrink-0 select-none pr-3 text-right font-mono text-xs leading-[25px] text-[#8a8f98]">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i + 1}>{i + 1}</div>
          ))}
        </div>
        <div
          className="code-shiki min-w-0 flex-1"
          // shiki 输出为受控的本地高亮 HTML（无用户注入内容）
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}
