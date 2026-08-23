import { useState } from 'react'
import { CopyIcon } from '../../../components/icons'
import { copyText } from '../../../utils/clipboard'
import { cx } from '../../../utils/cx'

/**
 * 终端输出块 —— 对应 Codex 的 shell 块 `embedded` 档
 * (`reverse/webview-dump/assets/worktree-init-tool-activities-DMSULnlr.js`)。
 *
 * Codex 那个组件有两档:`default` 是**独立**的终端卡片(带边框、标题栏、cwd
 * tooltip、折叠按钮),`embedded` 是**嵌在活动行展开体里**的那一档 ——
 * 没有边框、没有标题栏,只有命令行 + 输出。工具调用用的是后者。
 *
 * ## 三个只有读源码才知道的点
 *
 * 1. **贴底 = `flex flex-col-reverse`,和会话滚动容器同一个手法。**
 *    命令还在跑时输出自动跟住底部,不需要 scrollTop 计算。
 * 2. **`[animation-direction:reverse]` 是必需的。** `vertical-scroll-fade-mask`
 *    的淡出遮罩靠 `animation-timeline: scroll(self y)` 驱动;容器一旦是
 *    column-reverse,滚动进度方向就翻转了,不把动画方向也翻过来的话
 *    上下两条淡出带会**装反** —— 贴底时淡下边、贴顶时淡上边,正好相反。
 * 3. **横向滚动靠内层 `w-max min-w-full`。** 外层 `overflow-x-auto`,内层用
 *    `w-max` 撑到最长那行的宽度、`min-w-full` 保证短输出仍占满 ——
 *    只写 `whitespace-pre` 会让长行被裁掉而不是可滚。
 *
 * 输出上限 `max-h-36`(144px),不是我之前照 VS Code 抄的 400 行。
 *
 * ## 一个已知差距:ANSI 颜色
 *
 * Codex 把输出交给一个 ANSI→HTML 转换器,产出 `.ansi-red-fg` 这类 span
 * (那批类在 `worktree-init-tool-activities-CxuoHau6.css` 里,颜色取
 * `--color-token-terminal-ansi-*` —— 这些 token WS 已经有了,缺的是类规则与
 * 解析器)。这里仍按纯文本渲染,含转义序列的输出会显示成可见的乱码字符。
 * 这是**既有行为**(之前的 `<pre class="chat-terminal-output">` 也一样),
 * 本轮没有改善,记在 audit doc 的差距清单里。
 */
export function TerminalOutput({
  command,
  output
}: {
  command: string
  output: string | null
}): React.JSX.Element {
  const [copiedCommand, setCopiedCommand] = useState(false)
  const [copiedOutput, setCopiedOutput] = useState(false)

  const copy = async (text: string, mark: (v: boolean) => void): Promise<void> => {
    await copyText(text)
    mark(true)
    window.setTimeout(() => mark(false), 1200)
  }

  return (
    <div className="flex flex-col overflow-clip rounded-none border-none">
      <div className="relative">
        {command.length > 0 && (
          <div className="px-2 pt-2">
            <div className="group/command relative pe-6">
              <div
                aria-label={`$ ${command}`}
                className="cursor-interaction text-size-chat-sm font-vscode-editor font-medium whitespace-pre text-token-foreground"
              >
                <span className="me-[1ch] text-token-text-tertiary">$</span>
                <span className="contents">{command}</span>
              </div>
              <button
                type="button"
                aria-label="Copy command"
                onClick={() => void copy(command, setCopiedCommand)}
                className="absolute top-0 right-0 opacity-0 transition-opacity duration-basic group-hover/command:opacity-100"
              >
                <CopyIcon aria-hidden className="icon-2xs" />
                <span className="sr-only">{copiedCommand ? 'Copied' : 'Copy command'}</span>
              </button>
            </div>
          </div>
        )}

        <div className="group/output relative min-h-[1.25rem] pe-0">
          <div
            className={cx(
              'vertical-scroll-fade-mask max-h-36 [--edge-fade-distance:2rem] box-border',
              'flex flex-col-reverse overflow-x-auto overflow-y-auto whitespace-pre',
              'font-vscode-editor font-medium [animation-direction:reverse]',
              'text-token-foreground text-size-chat-sm'
            )}
          >
            <div className="w-max min-w-full p-2">{output ?? ''}</div>
          </div>
          {output != null && output.length > 0 && (
            <button
              type="button"
              aria-label="Copy output"
              onClick={() => void copy(output, setCopiedOutput)}
              className="absolute top-0 right-2.5 opacity-0 transition-opacity duration-basic group-hover/output:opacity-100"
            >
              <CopyIcon aria-hidden className="icon-2xs" />
              <span className="sr-only">{copiedOutput ? 'Copied' : 'Copy output'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
