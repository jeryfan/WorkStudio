interface CodePaneProps {
  /** shiki 生成的 HTML（含 span.line 分行），null = 未选择文件 */
  html: string | null
  loading: boolean
  lineCount: number
}

/**
 * 代码预览区（panel/1.html .code-pane 第 115-136 行）：
 * 56px 行号槽 + 13px/25px 等宽代码，只读预览。
 */
export function CodePane({ html, loading, lineCount }: CodePaneProps): React.JSX.Element {
  if (!html) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-desc">
        {loading ? 'Loading…' : 'Select a file to preview'}
      </div>
    )
  }
  return (
    <div className="h-full overflow-auto pb-[118px]">
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
