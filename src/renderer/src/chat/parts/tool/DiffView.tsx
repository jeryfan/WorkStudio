import { useEffect, useRef, useState } from 'react'
import { resolveLang } from '../../../shiki/langs'

/**
 * 单个文件的 diff —— Monaco DiffEditor。
 *
 * 两侧文本由 `parseDiff` 从补丁还原（协议只给补丁，不给改动前后全文）。
 * 还原不出来时调用方不会渲染本组件，改走原样显示。
 *
 * 关掉行号是必须的：还原出来的两侧是各 hunk 依次拼接的结果，中间跳过的原文
 * 不出现，行号必然与真实文件对不上。显示一个错的行号比不显示更糟。
 */

const LINE_HEIGHT = 19
const MAX_HEIGHT = 420

export function DiffView({
  original,
  modified,
  path
}: {
  original: string
  modified: string
  path: string
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(() =>
    Math.min(
      MAX_HEIGHT,
      Math.max(original.split('\n').length, modified.split('\n').length) * LINE_HEIGHT + 8
    )
  )

  useEffect(() => {
    let disposed = false
    let editor: import('monaco-editor/editor/editor.api').editor.IStandaloneDiffEditor | null = null
    let models: { original: { dispose(): void }; modified: { dispose(): void } } | null = null

    void (async () => {
      const { monaco, ensureLanguage } = await import('../../monaco/setup')
      // 语言从文件扩展名推断——补丁本身不带语言信息
      const lang = resolveLang(path.split('.').pop())
      const languageId = lang ? await ensureLanguage(lang) : null
      if (disposed || !host.current) return

      const originalModel = monaco.editor.createModel(original, languageId ?? 'plaintext')
      const modifiedModel = monaco.editor.createModel(modified, languageId ?? 'plaintext')
      models = { original: originalModel, modified: modifiedModel }

      editor = monaco.editor.createDiffEditor(host.current, {
        readOnly: true,
        // 内联而不是左右对照：对话区宽度有限，并排两栏后每栏都要横向滚动
        renderSideBySide: false,
        lineNumbers: 'off',
        glyphMargin: false,
        folding: false,
        lineDecorationsWidth: 0,
        renderLineHighlight: 'none',
        overviewRulerLanes: 0,
        scrollBeyondLastLine: false,
        scrollbar: { alwaysConsumeMouseWheel: false },
        automaticLayout: true,
        fontSize: 12,
        lineHeight: LINE_HEIGHT,
        contextmenu: false,
        minimap: { enabled: false },
        // 折叠未改动区域：补丁里本来就只有 hunk，但 hunk 内的上下文仍可能很长
        hideUnchangedRegions: { enabled: true, contextLineCount: 2, minimumLineCount: 4 },
        renderOverviewRuler: false
      })
      editor.setModel({ original: originalModel, modified: modifiedModel })

      /*
       * 高度取 modified 编辑器的 contentHeight —— 内联模式下删除行是作为
       * "view zone" 插进这一侧的，所以它已经是含两侧的权威值，不需要自己
       * 按行数估。
       *
       * 但**必须等差异算完再读**：diff 是异步计算的，创建后立刻读会拿到
       * 只含 modified 的高度（本例 122px 装 11 行，内容被截断）。
       * onDidUpdateDiff 是那个时机；onDidContentSizeChange 负责后续变化。
       */
      const sync = (): void => {
        if (disposed || !editor) return
        setHeight(Math.min(MAX_HEIGHT, editor.getModifiedEditor().getContentHeight() + 12))
      }
      editor.onDidUpdateDiff(sync)
      editor.getModifiedEditor().onDidContentSizeChange(sync)
    })()

    return () => {
      disposed = true
      editor?.dispose()
      models?.original.dispose()
      models?.modified.dispose()
    }
  }, [original, modified, path])

  return <div ref={host} className="chat-diff-editor" style={{ height }} />
}
