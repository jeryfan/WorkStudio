import { useState, type ReactNode } from 'react'
import type { ChatMarkdownContent } from '../model/content'
import { CodeBlockPart } from './CodeBlockPart'
import { InlineAnchor } from './InlineAnchor'
import { Codicon } from './Codicon'
import { copyText } from '../../utils/clipboard'

/**
 * Markdown 渲染。
 *
 * 解析逻辑移植自旧实现（components/session/Markdown.tsx），保留了那个决定：
 * **刻意不引 Markdown 库**。流式期间正文每帧增长，完整解析每帧跑一次会明显掉帧，
 * 而这里要覆盖的构造集合有限且稳定。
 *
 * 相对旧实现的改动：
 *   - 类名换成上游的 `.rendered-markdown` 体系，样式全部由移植的 CSS 提供
 *   - 标题按真实层级输出 h1/h2/h3，不再一律 h2
 *   - 补上引用块（CSS 早已移植，之前没有对应的解析分支）
 *   - 代码块交给 Monaco（CodeBlockPart）
 */

/**
 * 文件引用识别。
 *
 * 只靠"有斜杠"或"有点"都会误伤：域名（chatgpt.com/codex）、时区
 * （Asia/Shanghai）、并列词（Landlock/seccomp）都长得像路径。这里要求末段带
 * 真实的源码/配置扩展名，并排除以域名开头的 token。
 *
 * 宁可漏判也不要把散文渲染成假链接——点不开的胶囊比纯文本更糟。
 */
const FILE_EXT =
  'ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|mdx|css|scss|html|htm|py|rs|go|java|kt|swift|c|h|cc|cpp|hpp|rb|php|sh|bash|zsh|fish|yml|yaml|toml|ini|env|sql|proto|lock|txt|log|svg|png|jpg|jpeg|gif|webp|ico|pdf|csv'
const PATH_RE = new RegExp(
  String.raw`(?:^|[\s(（])((?:[\w.@~-]+\/)+[\w.@-]+\.(?:${FILE_EXT})(?::\d+)?)`,
  'g'
)
/** 以域名开头（首段含点且是常见 TLD）的 token 不是本地文件 */
const DOMAIN_HEAD = /^[\w-]+\.(?:com|org|net|io|dev|ai|co|cn|app|sh|gg|me|xyz)\b/i

/** 行内构造：代码、粗体、Markdown 链接 */
const INLINE_RE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let idx = 0
  for (const chunk of text.split(INLINE_RE)) {
    if (!chunk) continue
    const key = `${keyBase}-${idx++}`
    if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length > 1) {
      out.push(<code key={key}>{chunk.slice(1, -1)}</code>)
      continue
    }
    if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 3) {
      out.push(
        <strong key={key} className="font-semibold">
          {chunk.slice(2, -2)}
        </strong>
      )
      continue
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(chunk)
    if (link) {
      const [, label, href] = link
      out.push(
        <a
          key={key}
          href={href}
          title={href}
          // 外链一律交给系统浏览器：应用窗口不是浏览器，站内打开会把用户困住
          onClick={(e) => {
            e.preventDefault()
            void window.api.openExternal(href)
          }}
        >
          {label}
        </a>
      )
      continue
    }
    out.push(...linkifyPaths(chunk, key))
  }
  return out
}

/** 把裸文件路径变成可点击的引用 */
function linkifyPaths(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const m of text.matchAll(PATH_RE)) {
    const path = m[1]
    if (DOMAIN_HEAD.test(path)) continue
    const start = m.index + m[0].length - path.length
    if (start > last) out.push(text.slice(last, start))
    out.push(<InlineAnchor key={`${keyBase}-p${n++}`} path={path} />)
    last = start + path.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim())
}

/**
 * 表格。
 *
 * 外面套一层可横向滚动的壳：宽表格直接撑破 950px 的正文列，
 * 让整行出现横向滚动条比让表格自己滚动糟糕得多。
 */
function Table({ head, rows }: { head: string[]; rows: string[][] }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const plain = [head, ...rows].map((r) => r.join('\t')).join('\n')
  return (
    <div className="codex-TableContainer" data-markdown-table="true" data-wide-block>
      <div className="codex-TableScroller horizontal-scroll-fade-mask">
        <div className="codex-TableWrapper">
          <table>
            <thead>
              <tr>
                {head.map((cell, i) => (
                  <th key={i}>{renderInline(cell, `th${i}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{renderInline(cell, `td${r}-${c}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Codex 把复制按钮放在 TableActions 里,并用 data-markdown-copy="exclude"
          把它自己从"复制表格"的文本里排除掉 */}
      <div className="codex-TableActions" data-markdown-copy="exclude">
        <div className="sticky top-0 flex flex-col items-start">
          <button
            type="button"
            aria-label={copied ? 'Copied' : 'Copy table'}
            onClick={() => {
              void copyText(plain).then((ok) => {
                if (!ok) return
                setCopied(true)
                setTimeout(() => setCopied(false), 1200)
              })
            }}
          >
            <Codicon name={copied ? 'check' : 'copy'} />
          </button>
        </div>
      </div>
    </div>
  )
}

/** 块级解析。返回节点数组，交由外层容器包裹 */
function renderBlocks(text: string): ReactNode[] {
  const blocks: ReactNode[] = []
  const lines = text.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trimEnd()

    // ── 围栏代码块：未闭合时（流式中）也要能渲染已到达的部分 ──
    const fence = /^\s*```(\S+)?\s*$/.exec(line)
    if (fence) {
      const lang = fence[1] ?? null
      const body: string[] = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++])
      i++ // 跳过闭合围栏（缺失时正好越界，循环自然结束）
      blocks.push(<CodeBlockPart key={`c${blocks.length}`} code={body.join('\n')} lang={lang} />)
      continue
    }

    // ── 表格：表头 + 分隔行 + 若干数据行 ──
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const head = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(splitRow(lines[i++]))
      blocks.push(<Table key={`t${blocks.length}`} head={head} rows={rows} />)
      continue
    }

    // ── 引用块：连续的 `> ` 行 ──
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote key={`q${blocks.length}`} className="codex-Blockquote">
          {renderBlocks(quoted.join('\n'))}
        </blockquote>
      )
      continue
    }

    // ── 列表：连续同类行合并成一个列表 ──
    const isBullet = /^\s*[-*]\s+/.test(line)
    const isNumbered = /^\s*\d+[.)]\s+/.test(line)
    if (isBullet || isNumbered) {
      const ordered = isNumbered
      const items: string[] = []
      const re = ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*]\s+(.*)$/
      while (i < lines.length) {
        const m = re.exec(lines[i].trimEnd())
        if (!m) break
        items.push(m[1])
        i++
      }
      const Tag = ordered ? 'ol' : 'ul'
      blocks.push(
        <Tag
          key={`l${blocks.length}`}
          className={`codex-List ${ordered ? 'codex-OrderedList' : 'codex-UnorderedList'}`}
        >
          {items.map((item, n) => (
            <li key={n} className="codex-ListItem">
              {renderInline(item, `l${blocks.length}-${n}`)}
            </li>
          ))}
        </Tag>
      )
      continue
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={`hr${blocks.length}`} className="codex-HorizontalRule" />)
      i++
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      // h4~h6 在对话里几乎不出现，且再小就和正文没区别了，统一压到 h3
      const level = Math.min(heading[1].length, 3)
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3'
      blocks.push(
        <Tag key={`h${blocks.length}`} className="codex-Heading">
          {renderInline(heading[2], `h${blocks.length}`)}
        </Tag>
      )
      i++
      continue
    }

    if (line.trim()) {
      blocks.push(
        <p key={`p${blocks.length}`} className="codex-Paragraph">
          {renderInline(line, `p${blocks.length}`)}
        </p>
      )
    }
    i++
  }

  return blocks
}

/**
 * `.rendered-markdown` 这个类名是硬要求：用户消息气泡的底色与圆角、链接色、
 * 引用块、表格样式全都挂在它上面。
 */
export function MarkdownPart({
  content,
  /** 是否自带 codex-MarkdownRoot 外壳(助手回复由 ChatView 自己套,传 false) */
  withRoot = true,
  textStyle = 'user-message'
}: {
  content: ChatMarkdownContent
  withRoot?: boolean
  textStyle?: 'assistant-message' | 'user-message'
}): React.JSX.Element {
  /*
   * Codex 的 markdown 根是 `codex-MarkdownRoot` + 三个边距修正类
   * + `data-markdown-text-style` 选档(assistant-message / user-message)。
   *
   * 助手回复那侧由 ChatView 自己套(它要挂 data-selected-text-overlay-target
   * 之类的标注属性),所以这里 root 可关 —— 避免嵌两层 MarkdownRoot
   * 让 [&>*:last-child]:mb-0 之类的选择器打在错误的层上。
   */
  if (!withRoot) return <>{renderBlocks(content.content)}</>
  return (
    <div
      data-markdown-text-style={textStyle}
      className="codex-MarkdownRoot [&>*:last-child]:mb-0 [&>ol:first-child]:mt-0 [&>ul:first-child]:mt-0"
    >
      {renderBlocks(content.content)}
    </div>
  )
}
