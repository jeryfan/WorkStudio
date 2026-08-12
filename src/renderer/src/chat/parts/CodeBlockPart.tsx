import { useEffect, useRef, useState } from 'react'
import { resolveLang } from '../../shiki/langs'
import { copyText } from '../../utils/clipboard'
import { Codicon } from './Codicon'

/**
 * 代码块 —— 对应上游的 codeBlockPart.ts，用 Monaco 只读编辑器渲染。
 *
 * 三处必须处理的细节：
 *
 * 1. **惰性加载**。Monaco 静态 import 会让主包从 1.5MB 涨到 6.6MB，而对话里
 *    未必有代码块。所以整个 setup 模块走动态 import，第一个代码块挂载时才拉。
 *
 * 2. **流式增长**。代码块在围栏闭合前就会开始渲染，`code` 每帧都在变。用
 *    `setValue` 而不是重建编辑器——重建会丢掉滚动位置并让整块闪一下。
 *
 * 3. **虚拟列表里的生死**。行滚出视口会被 Virtuoso 卸载，编辑器必须跟着 dispose，
 *    否则每滚一遍就泄漏一批。异步创建期间可能已经卸载，所以要有取消标记。
 *
 * 与上游的差异：上游用 EditorPool 复用编辑器实例，这里一个代码块一个实例。
 * 池化是纯优化，等实测出瓶颈再说。
 */

/** 行高固定，用于按行数换算容器高度；与 Monaco 的 lineHeight 配置保持一致 */
const LINE_HEIGHT = 19
/** 收起时的最大高度：超长代码块不该把回答挤出屏幕 */
const MAX_HEIGHT = 480

export function CodeBlockPart({
  code,
  lang
}: {
  code: string
  /** 围栏上写的语言名，可能为空或不认识 */
  lang: string | null
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<{ setValue: (v: string) => void; dispose: () => void } | null>(null)
  const [copied, setCopied] = useState(false)
  const [height, setHeight] = useState(() =>
    Math.min(MAX_HEIGHT, Math.max(1, code.split('\n').length) * LINE_HEIGHT + 8)
  )

  // 创建与销毁。依赖为空数组：语言变化在流式期间不会发生（围栏第一行就定了），
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
        // 只读展示，不是编辑器：关掉一切编辑期才有意义的装饰
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
        // 外层已经有滚动容器；再让编辑器抢滚轮会导致滚不动对话
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

      // 内容高度反过来决定容器高度，否则只读编辑器会塌成默认高度
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

  // 流式增长：只换内容，不换实例
  useEffect(() => {
    editor.current?.setValue(code)
  }, [code])

  return (
    <div className="interactive-result-code-block" data-code="">
      <div className="interactive-result-code-block-toolbar">
        <span className="code-block-lang">{lang || 'plaintext'}</span>
        <button
          type="button"
          aria-label={copied ? 'Copied' : 'Copy code'}
          title={copied ? 'Copied' : 'Copy code'}
          onClick={() => {
            void copyText(code).then((ok) => {
              if (!ok) return
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            })
          }}
        >
          <Codicon name={copied ? 'check' : 'copy'} />
        </button>
      </div>
      <div ref={host} className="code-block-editor" style={{ height }} />
    </div>
  )
}
