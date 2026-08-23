import { useEffect, useRef, useState } from 'react'
import { CheckIcon, CopyIcon } from '../../components/icons'
import { resolveLang } from '../../shiki/langs'
import { copyText } from '../../utils/clipboard'
import { cx } from '../../utils/cx'
import { useTheme } from '../theme/themeContext'

/**
 * 代码块 —— 外壳照 Codex 的 `CodeSnippet`(app-initial 源码 `Taa` + `Oaa` + `kaa`):
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
 * └ div[codeContainerClassName][tabIndex]
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
 * ## 一个明确保留的差距:高亮引擎
 *
 * Codex 用 **highlight.js**(`assets/highlight-code-bx-gqOKs.js` 里
 * `hljs.registerLanguage` 注册 40 个语言,导出 `highlightCode` /
 * `detectCodeLanguage`,产出带 `.hljs-*` 类的 HTML —— 那批 CSS 已经在
 * `assets/codex/highlight.css` 里了,目前是死代码)。
 *
 * WS 这里仍然是 Monaco 只读编辑器。换引擎要加一个依赖、重新对 40 个语言、
 * 还牵连 DiffView(同样用 Monaco),属于独立一轮的活,没有塞进本轮。
 * **外壳已经是 Codex 的了**,换的时候只需要替换 `<code>` 里的内容。
 */

/** 行高固定,用于按行数换算容器高度;与 Monaco 的 lineHeight 配置保持一致 */
const LINE_HEIGHT = 19
/** 收起时的最大高度:超长代码块不该把回答挤出屏幕 */
const MAX_HEIGHT = 480

export function CodeBlockPart({
  code,
  lang,
  title,
  codeContainerClassName
}: {
  code: string
  /** 围栏上写的语言名,可能为空或不认识 */
  lang: string | null
  /** 标题栏文案。Codex 的默认值是 `title ?? language` */
  title?: string
  /** 代码容器的附加类。工具输出那边传 `max-h-48 overflow-auto` */
  codeContainerClassName?: string
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<{ setValue: (v: string) => void; dispose: () => void } | null>(null)
  const [copied, setCopied] = useState(false)
  const { variant } = useTheme()
  const isDark = variant === 'dark'
  const [height, setHeight] = useState(() =>
    Math.min(MAX_HEIGHT, Math.max(1, code.split('\n').length) * LINE_HEIGHT + 8)
  )

  // 创建与销毁。依赖为空数组:语言变化在流式期间不会发生(围栏第一行就定了),
  // 代码变化走下面的 setValue 分支。
  useEffect(() => {
    let disposed = false
    let instance: import('monaco-editor/editor/editor.api').editor.IStandaloneCodeEditor | null =
      null

    void (async () => {
      const { monaco, ensureLanguage } = await import('../monaco/setup')
      const resolved = resolveLang(lang)
      const languageId = resolved ? await ensureLanguage(resolved) : null

      // 异步期间组件可能已经卸载
      if (disposed || !host.current) return

      instance = monaco.editor.create(host.current, {
        value: code,
        language: languageId ?? 'plaintext',
        readOnly: true,
        // 只读展示,不是编辑器:关掉一切编辑期才有意义的装饰
        lineNumbers: 'off',
        glyphMargin: false,
        folding: false,
        lineDecorationsWidth: 0,
        lineNumbersMinChars: 0,
        renderLineHighlight: 'none',
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
        scrollBeyondLastLine: false,
        // 外层已经有滚动容器;再让编辑器抢滚轮会导致滚不动对话
        scrollbar: { alwaysConsumeMouseWheel: false },
        automaticLayout: true,
        fontSize: 12,
        lineHeight: LINE_HEIGHT,
        padding: { top: 4, bottom: 4 },
        contextmenu: false,
        minimap: { enabled: false },
        stickyScroll: { enabled: false },
        wordWrap: 'off'
      })

      // 内容高度反过来决定容器高度,否则只读编辑器会塌成默认高度
      const sync = (): void => {
        if (disposed || !instance) return
        setHeight(Math.min(MAX_HEIGHT, instance.getContentHeight() + 8))
      }
      instance.onDidContentSizeChange(sync)
      sync()

      editor.current = {
        setValue: (v) => instance?.getModel()?.setValue(v),
        dispose: () => {
          instance?.getModel()?.dispose()
          instance?.dispose()
        }
      }
    })()

    return () => {
      disposed = true
      editor.current?.dispose()
      editor.current = null
      instance?.getModel()?.dispose()
      instance?.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 流式增长:只换内容,不换实例
  useEffect(() => {
    editor.current?.setValue(code)
  }, [code])

  return (
    <div
      data-markdown-copy="code-block"
      data-markdown-copy-text={code}
      data-theme={isDark ? 'dark' : 'light'}
      className={cx(
        'relative w-full min-w-0 overflow-clip rounded-lg contain-inline-size',
        'bg-token-text-code-block-background',
        isDark ? 'dark' : 'light'
      )}
    >
      <div
        data-markdown-copy="exclude"
        className="flex items-center py-1 pe-2 ps-2 font-sans text-sm text-token-description-foreground select-none rounded-t-lg"
      >
        <div className="min-w-0 flex-1 truncate">{title ?? lang ?? 'plaintext'}</div>
        <div className="ms-auto flex shrink-0 items-center">
          <button
            type="button"
            aria-label={copied ? 'Copied' : 'Copy code'}
            onClick={() => {
              void copyText(code).then((ok) => {
                if (!ok) return
                setCopied(true)
                setTimeout(() => setCopied(false), 1200)
              })
            }}
          >
            {copied ? (
              <CheckIcon aria-hidden className="icon-xs" />
            ) : (
              <CopyIcon aria-hidden className="icon-xs" />
            )}
          </button>
        </div>
      </div>
      <div className={codeContainerClassName}>
        <div ref={host} style={{ height }} />
      </div>
    </div>
  )
}
