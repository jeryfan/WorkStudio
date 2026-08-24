import { useState } from 'react'
import { CheckIcon, CopyIcon } from '../../../components/icons'
import { copyText } from '../../../utils/clipboard'
import { cx } from '../../../utils/cx'
import { displayCommand } from '../../model/shellCommand'
import {
  ansiClassName,
  ansiToJson,
  decorationStyle,
  resolveCarriageReturns,
  stripBackspaces
} from '../../model/ansi'

/**
 * 终端输出块 —— Codex 的 `jm`(`worktree-init-tool-activities-*.js` 的 `Ne`/`z`,
 * 嵌在活动行展开体里的 `embedded` 档)+ `Footer`(`I`)。
 *
 * 本轮补齐的三件事(全部按源码):
 *
 * 1. **ANSI 颜色**。输出先过 `\b` 退格剥离(`Ee`)与 `\r` 行内覆盖(`xe`),
 *    再经 `ansiToJson` 转成 `.ansi-red-fg` 一族 span(配色规则在
 *    assets/codex/ansi.css,取 `--color-token-terminal-ansi-*` token)。
 *    之前按纯文本渲染,带转义序列的输出全是可见乱码。
 * 2. **命令行点击展开**:`role="button"` + `line-clamp-2`,长命令默认两行截断,
 *    点一下展开全文(Enter/Space 同样触发)。
 * 3. **Footer**:进行中是空壳、被停显示 "Stopped"、结束按退出码显示
 *    "Success"(带勾)或 "Exit code {code}"。非零退出码的归属在这里,
 *    不在活动行摘要里。
 *
 * 贴底(`flex flex-col-reverse`)与 `[animation-direction:reverse]` 的理由
 * 见上一版注释,不变。
 */

/** ANSI span 层(Codex 的 `we` + `Te`):输出 → `<code>` 里一串带类 span */
function AnsiText({ text, className }: { text: string; className?: string }): React.JSX.Element {
  const chunks = ansiToJson(resolveCarriageReturns(stripBackspaces(text)))
  return (
    <code className={className}>
      {chunks.map((chunk, i) => (
        <span
          key={i}
          className={ansiClassName(chunk) || undefined}
          style={decorationStyle(chunk.decorations)}
          data-ansi-is-inverted={chunk.isInverted || undefined}
          data-ansi-truecolor-fg={chunk.fgTruecolor ?? undefined}
          data-ansi-truecolor-bg={chunk.bgTruecolor ?? undefined}
        >
          {chunk.content}
        </span>
      ))}
    </code>
  )
}

function CopyHoverButton({
  label,
  text,
  className
}: {
  label: string
  text: string
  className: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        void copyText(text).then((ok) => {
          if (!ok) return
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1200)
        })
      }}
      className={cx(
        'no-drag cursor-interaction items-center justify-center border border-transparent select-none',
        'text-token-text-tertiary enabled:hover:bg-token-list-hover-background',
        'focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none',
        'flex p-0.5 electron:p-1 electron:[&>svg]:icon-sm rounded-full electron:rounded-md',
        className
      )}
    >
      {copied ? (
        <CheckIcon aria-hidden className="icon-2xs" />
      ) : (
        <CopyIcon aria-hidden className="icon-2xs" />
      )}
      <span className="sr-only">{copied ? 'Copied' : label}</span>
    </button>
  )
}

export function TerminalOutput({
  command,
  output,
  isInProgress = false,
  footer
}: {
  command: string
  output: string | null
  isInProgress?: boolean
  footer?: React.ReactNode
}): React.JSX.Element {
  const shown = displayCommand(command)
  const [commandExpanded, setCommandExpanded] = useState(false)
  const hasOutput = output != null && /\S/.test(output)

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-token-border-heavy bg-token-text-code-block-background">
      {/* 命令行(embedded 档):$ 提示符 + 两行截断,点击展开 */}
      {shown.length > 0 && (
        <div className="px-2 pt-2">
          <div className="group/command relative pe-6">
            <div
              aria-label={`$ ${shown}`}
              role="button"
              tabIndex={0}
              onClick={() => setCommandExpanded((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setCommandExpanded((v) => !v)
                }
              }}
              className={cx(
                'cursor-interaction text-size-chat-sm font-vscode-editor',
                'whitespace-pre-wrap break-words text-token-description-foreground',
                !commandExpanded && 'line-clamp-2'
              )}
            >
              <span className="me-[1ch] text-token-text-tertiary">$</span>
              <span className="contents">{shown}</span>
            </div>
            <CopyHoverButton
              label="Copy command"
              text={shown}
              className="absolute top-0 right-0 opacity-0 transition-opacity duration-basic group-hover/command:opacity-100"
            />
          </div>
        </div>
      )}

      <div className="group/output relative min-h-[1.25rem] pe-0">
        <div
          className={cx(
            'vertical-scroll-fade-mask max-h-36 [--edge-fade-distance:2rem] box-border',
            'flex flex-col-reverse overflow-x-auto overflow-y-auto whitespace-pre',
            'font-vscode-editor font-medium [animation-direction:reverse]',
            'text-token-description-foreground text-size-chat-sm'
          )}
        >
          <div className="w-max min-w-full p-2">
            <AnsiText
              text={hasOutput ? output : isInProgress ? '' : 'No output'}
              className={cx(
                hasOutput
                  ? 'text-token-description-foreground'
                  : 'text-token-input-placeholder-foreground opacity-80'
              )}
            />
          </div>
        </div>
        {hasOutput && (
          <CopyHoverButton
            label="Copy output"
            text={output}
            className="absolute top-0 right-2.5 opacity-0 transition-opacity duration-basic group-hover/output:opacity-100"
          />
        )}
      </div>
      {footer}
    </div>
  )
}

/** Codex `jm.Footer`(`I`)—— 命令的收尾状态 */
TerminalOutput.Footer = function TerminalOutputFooter({
  isInProgress,
  isSuccess,
  exitCode,
  wasInterrupted
}: {
  isInProgress: boolean
  isSuccess: boolean
  exitCode: number | null
  wasInterrupted?: boolean
}): React.JSX.Element {
  if (isInProgress) {
    return <div className="px-2.5 pt-0.5 pb-1 text-size-chat" />
  }
  if (wasInterrupted) {
    return (
      <div className="flex items-center gap-2 px-2.5 pt-0.5 pb-1 text-size-chat text-token-input-placeholder-foreground">
        <span className="ms-auto">Stopped</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 px-2.5 pt-0.5 pb-1 text-size-chat text-token-input-placeholder-foreground">
      {isSuccess ? (
        <span className="ms-auto flex items-center gap-1">
          <CheckIcon aria-hidden className="icon-xxs" />
          Success
        </span>
      ) : (
        <span className="ms-auto">Exit code {exitCode ?? 'unknown'}</span>
      )}
    </div>
  )
}
