import { Fragment, memo, useEffect, useRef, useState } from 'react'
import { CheckIcon, CopyIcon } from '../../components/icons'
import { WordWrapDisabledIcon, WordWrapEnabledIcon } from '../../components/icons'
import { copyText } from '../../utils/clipboard'
import { cx } from '../../utils/cx'
import { useTheme } from '../theme/themeContext'
import { useCodeBlockWrap, toggleCodeBlockWrap } from '../../state/fileViewerPrefs'
import {
  highlightCode,
  resolveHighlightLanguage,
  type HighlightResult
} from '../highlight/highlightCode'

/**
 * 代码块 —— 逐层照 Codex 的 `CodeSnippet`(app-initial 源码 `Taa` + `Oaa` + `kaa` + `Aaa`):
 *
 * ```
 * div[data-markdown-copy="code-block"][data-markdown-copy-text][data-theme="light|dark"]
 *    .relative.w-full.min-w-0.overflow-clip.rounded-lg.contain-inline-size
 *    .bg-token-text-code-block-background
 * ├ div[data-markdown-copy="exclude"]                      ← 标题栏(showActionBar)
 * │   .flex.items-center.py-1.pe-2.ps-2.font-sans.text-sm
 * │   .text-token-description-foreground.select-none.rounded-t-lg
 * │ ├ div.min-w-0.flex-1.truncate            → 标题(默认取语言名)
 * │ └ div.ms-auto.flex.shrink-0.items-center → 复制按钮
 * └ div.text-size-chat.overflow-auto.p-2[dir="ltr"][codeContainerClassName]
 *   └ code.whitespace-pre!                   → 高亮后的内容
 * ```
 *
 * 两个 `data-markdown-copy` 属性是给"复制整段回复"用的:块本身标 `code-block`
 * 并在 `data-markdown-copy-text` 里给出纯文本,标题栏标 `exclude` ——
 * 所以复制回复时拿到的是代码本身,不会把 "typescript" 和复制按钮的文案也抄进去。
 *
 * `contain-inline-size` 让代码块成为容器查询的边界:里面的长行不会把外层
 * (会话流)的宽度撑开。`data-theme` 给 `.hljs-*` 那套配色选明暗档。
 *
 * ## 引擎:Monaco → highlight.js
 *
 * 之前这里是一个 Monaco **只读编辑器**。Codex 用的是 highlight.js
 * (`highlight-code-bx-gqOKs.js`,注册 44 个语言),产出带 `.hljs-*` 类的 HTML
 * —— 那批配色规则早就在 `assets/codex/highlight.css` 里,在此之前是死代码。
 *
 * 换掉的三个理由:Monaco 是编辑器而这里只是只读展示(6.6MB 不划算);
 * 它自带一整套 codicon 字体与 DOM;最要紧的是**流式**下面这条。
 *
 * ## 流式:已高亮的部分 + 未高亮的尾巴
 *
 * Codex 的做法(`Taa` 里那段)不是"每次内容变就整块重高亮":
 *
 * ```js
 * const cached = highlighted != null && content.startsWith(highlighted.code) ? highlighted : null
 * const lines  = cached?.html.split('\n') ?? null
 * const tail   = cached == null ? content : content.slice(cached.code.length)
 * ```
 *
 * - 缓存只在**当前内容以它为前缀**时才用(流式是追加,所以命中率很高)
 * - 已高亮的部分逐行 `dangerouslySetInnerHTML`,行间插真实的 `\n` 文本节点
 * - **还没轮到高亮的尾巴按纯文本渲染** —— 于是围栏没闭合时也不会闪、不会空白
 *
 * 高亮本身有 **120ms 节流**(`Paa`):一个 setTimeout 链,上一次跑完至少隔
 * 120ms 才跑下一次。流式期间每帧都重高亮会明显掉帧。
 *
 * ## 一处刻意差异
 *
 * 围栏不写语言时,Codex 走 `highlightAuto` 自动识别 —— 那要求 44 个语言
 * **全部**已注册,与按需加载互斥。这里退回纯文本(没有配色,但结构与转义都对)。
 * 详见 highlightCode.ts 顶部。
 */

/** Codex 的 `Paa` —— 两次高亮之间至少隔这么久 */
const HIGHLIGHT_THROTTLE_MS = 120

/** 动作栏按钮(ghost/icon 档)—— 类名取自 Codex 运行时的实测 */
const ACTION_BUTTON_CLASS =
  'no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-full electron:rounded-md text-token-text-tertiary enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent electron:p-1 electron:[&>svg]:icon-sm flex items-center justify-center p-0.5'

export function CodeBlockPart({
  code,
  lang,
  title,
  codeContainerClassName,
  deferEnhancementsUntilVisible = true
}: {
  code: string
  /** 围栏上写的语言名,可能为空或不认识 */
  lang: string | null
  /** 标题栏文案。Codex 的默认值是 `title ?? language` */
  title?: string
  /** 代码容器的附加类。工具输出那边传 `max-h-48 overflow-auto` */
  codeContainerClassName?: string
  /**
   * Codex 的 `deferEnhancementsUntilVisible`:IntersectionObserver(rootMargin
   * 600px) 之外不高亮 —— 长会话里几十个视口外代码块一起跑高亮会掉帧。
   * 默认开(会话流里的形态);工具输出对话框之类一眼可见的可以关。
   */
  deferEnhancementsUntilVisible?: boolean
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const [highlighted, setHighlighted] = useState<HighlightResult | null>(null)
  const { variant } = useTheme()
  const isDark = variant === 'dark'
  const language = resolveHighlightLanguage(lang)
  // Codex `Zpa`:wrap 是全局持久化偏好(user-controlled 档)
  const shouldWrapCode = useCodeBlockWrap()

  // IntersectionObserver(rootMargin 600px) 之内才开始高亮(Codex `Taa`)
  const rootRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(!deferEnhancementsUntilVisible)
  useEffect(() => {
    if (visible) return
    const el = rootRef.current
    if (el == null) return
    if (typeof IntersectionObserver === 'undefined') {
      const t = window.setTimeout(() => setVisible(true), 0)
      return () => window.clearTimeout(t)
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '600px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  /*
   * 节流的高亮循环 —— 结构照 Codex:一个可变的 state 对象记住"最新的内容/语言",
   * 计时器到点时读**当时最新的**值去跑。这样流式期间不会排起一长串待跑任务,
   * 每一轮跑的都是最新内容。
   */
  const job = useRef({
    disposed: false,
    latestCode: code,
    latestLanguage: language,
    lastStartedAtMs: null as number | null,
    timeout: null as number | null
  })

  useEffect(() => {
    const state = job.current
    state.disposed = false
    return () => {
      state.disposed = true
      if (state.timeout != null) {
        window.clearTimeout(state.timeout)
        state.timeout = null
      }
    }
  }, [])

  useEffect(() => {
    const state = job.current
    state.latestCode = code
    state.latestLanguage = language
    if (state.timeout != null) return
    // 视口外的块不跑高亮(Codex `deferEnhancementsUntilVisible`)
    if (!visible) return

    const now = performance.now()
    const since =
      state.lastStartedAtMs == null ? HIGHLIGHT_THROTTLE_MS : now - state.lastStartedAtMs
    const wait = Math.max(0, HIGHLIGHT_THROTTLE_MS - since)

    const run = (): void => {
      state.timeout = null
      if (state.disposed) return
      const target = state.latestCode
      const targetLang = state.latestLanguage
      state.lastStartedAtMs = performance.now()
      void highlightCode(target, targetLang).then((result) => {
        if (!state.disposed) setHighlighted(result)
      })
    }

    if (wait === 0) run()
    else state.timeout = window.setTimeout(run, wait)
  }, [code, language, visible])

  // 缓存只在当前内容以它为前缀时可用 —— 流式是追加,命中率很高
  const cached = highlighted != null && code.startsWith(highlighted.code) ? highlighted : null
  const lines = cached == null ? null : cached.html.split('\n')
  const tail = cached == null ? code : code.slice(cached.code.length)

  return (
    <div
      ref={rootRef}
      data-markdown-copy="code-block"
      data-markdown-copy-text={code}
      data-theme={isDark ? 'dark' : 'light'}
      className={cx(
        'relative w-full min-w-0 overflow-clip rounded-lg contain-inline-size',
        'bg-token-text-code-block-background',
        'codex-CodeBlock',
        isDark ? 'dark' : 'light'
      )}
    >
      <div
        data-markdown-copy="exclude"
        className="flex items-center py-1 pe-2 ps-2 font-sans text-sm text-token-description-foreground select-none rounded-t-lg"
      >
        <div className="min-w-0 flex-1 truncate">{title ?? lang ?? 'plaintext'}</div>
        <div className="ms-auto flex shrink-0 items-center">
          {/* Codex 的 wrap 切换 + 复制 —— 按钮是 ghost/icon 那一档,各包一层 tooltip span */}
          <span data-state="closed">
            <button
              type="button"
              aria-label={shouldWrapCode ? 'Disable word wrap' : 'Enable word wrap'}
              onClick={() => toggleCodeBlockWrap()}
              className={ACTION_BUTTON_CLASS}
            >
              {shouldWrapCode ? (
                <WordWrapEnabledIcon aria-hidden className="icon-2xs" />
              ) : (
                <WordWrapDisabledIcon aria-hidden className="icon-2xs" />
              )}
            </button>
          </span>
          <span data-state="closed">
            <button
              type="button"
              aria-label={copied ? 'Copied' : 'Copy'}
              onClick={() => {
                void copyText(code).then((ok) => {
                  if (!ok) return
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1200)
                })
              }}
              className={ACTION_BUTTON_CLASS}
            >
              {copied ? (
                <CheckIcon aria-hidden className="icon-2xs" />
              ) : (
                <CopyIcon aria-hidden className="icon-2xs" />
              )}
            </button>
          </span>
        </div>
      </div>
      {/*
       * 代码容器 —— Codex 的 `Iaa`:`text-size-chat overflow-auto p-2` + `dir="ltr"`。
       * 三个都不能省:`overflow-auto` 给长行横向滚(外层是 `overflow-clip`,
       * 少了它长行直接被裁掉);`p-2` 是代码与边框的间距;`dir="ltr"` 让代码
       * 在 RTL 语言下也从左往右排 —— 外层用的是 `pe-2/ps-2` 这类逻辑属性,
       * 会跟着文档方向翻,代码不能翻。
       */}
      <div className={cx('text-size-chat overflow-auto p-2', codeContainerClassName)} dir="ltr">
        {/* Codex 的 `Aaa`:`whitespace-pre!` ↔ `whitespace-pre-wrap!`(wrap 开) */}
        <code className={shouldWrapCode ? 'whitespace-pre-wrap!' : 'whitespace-pre!'}>
          {lines == null ? (
            <span>{code}</span>
          ) : (
            <span>
              {lines.map((line, i) => (
                <Fragment key={i}>
                  <HighlightedLine html={line} />
                  {i < lines.length - 1 ? '\n' : null}
                </Fragment>
              ))}
              {tail ? <span>{tail}</span> : null}
            </span>
          )}
        </code>
      </div>
    </div>
  )
}

/**
 * 一行高亮后的 HTML —— Codex 的 `Faa`,是 `memo` 的。
 *
 * memo 不是可选的:流式时每帧都会重渲染整块,而已经高亮好的行内容没变,
 * 少了 memo 会把几百个 `dangerouslySetInnerHTML` 每帧全部重设一遍。
 */
const HighlightedLine = memo(function HighlightedLine({
  html
}: {
  html: string
}): React.JSX.Element {
  return <span dangerouslySetInnerHTML={{ __html: html }} />
})
