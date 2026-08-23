import { useEffect, useRef } from 'react'
import { EditorState, Plugin, type Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'
import { Schema, type Node as PMNode } from 'prosemirror-model'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'

/**
 * Composer 输入区 —— Codex 用 ProseMirror,这里复刻它实测的 DOM 契约:
 *
 *   div.codex-RichTextInput.text-base.[&_.ProseMirror]:leading-5 [data-rich-text-layout]
 *   └ div.ProseMirror[contenteditable="true"][aria-multiline="true"][dir="auto"]
 *       [role="textbox"][spellcheck="true"][translate="no"][data-virtualkeyboard="true"]
 *       [data-codex-composer="true"][aria-label]
 *       style="font-size: var(--codex-chat-font-size); height: auto; resize: none;
 *              min-height: 2.75rem;"
 *     └ p.placeholder[dir="auto"][data-placeholder]      ← 空文档时才有 .placeholder
 *       └ br.ProseMirror-trailingBreak
 *
 * 为什么必须是 contenteditable 而不能继续用 textarea:
 * - `p.placeholder[data-placeholder]` 的占位符走 CSS ::before,不是 placeholder 属性;
 *   Codex 的 components.css 里那条规则只匹配这个结构。
 * - 高度自增长靠 `height:auto` + `min-height:2.75rem`(44px),textarea 得靠 JS 量行数。
 * - @-mention / 附件粘贴 / 富文本片段后续都挂在 ProseMirror 的 plugin 上,
 *   textarea 无法承载(这也是 Codex 选它的原因)。
 *
 * schema 刻意做到最小:只有 doc/paragraph/text。Codex 的 composer 也不允许标题、
 * 列表这些块级结构 —— 回车是**提交**而不是新段落(见 keymap 里的 Enter)。
 */
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      // dir="auto" 与 Codex 一致:让浏览器按内容首字符定文字方向
      toDOM: () => ['p', { dir: 'auto' }, 0],
      parseDOM: [{ tag: 'p' }]
    },
    text: { group: 'inline' }
  }
})

/** 文档是否为空 —— 决定要不要给 p 挂 .placeholder */
function isEmptyDoc(doc: PMNode): boolean {
  return doc.childCount === 1 && doc.firstChild?.content.size === 0
}

/**
 * 占位符 —— 用 ProseMirror 的 decoration 给空文档的段落挂
 * `class="placeholder"` + `data-placeholder="<文案>"`,
 * Codex 的 CSS 靠 `.ProseMirror .placeholder:after { content: attr(data-placeholder) }`
 * 画出来(注意是 **:after**,不是 :before,也不是 input 的 placeholder 属性)。
 *
 * 为什么必须走 decoration 而不能在事务后手动 classList.add:
 * ProseMirror 每次重绘都会按 state 重建/复用 DOM,手动加的类会被下一次
 * 重绘抹掉 —— 实测表现就是 `<p>` 上 class 恒为空、占位符永不显示。
 * decoration 是 state 的一部分,重绘时会被一起应用。
 */
function placeholderPlugin(getText: () => string): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const doc = state.doc
        if (!isEmptyDoc(doc)) return null
        return DecorationSet.create(doc, [
          Decoration.node(0, doc.firstChild!.nodeSize, {
            class: 'placeholder',
            'data-placeholder': getText()
          })
        ])
      }
    }
  })
}

export function RichTextInput({
  value,
  placeholder,
  ariaLabel,
  disabled = false,
  onChange,
  onSubmit
}: {
  value: string
  placeholder: string
  ariaLabel: string
  disabled?: boolean
  onChange(next: string): void
  onSubmit(): void
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // 回调放 ref:EditorView 只创建一次,plugin 里的闭包不能捕获过期的 props
  const cb = useRef({ onChange, onSubmit, placeholder })
  useEffect(() => {
    cb.current = { onChange, onSubmit, placeholder }
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const view = new EditorView(host, {
      state: EditorState.create({
        schema,
        plugins: [
          placeholderPlugin(() => cb.current.placeholder),
          history(),
          keymap({
            // Enter 提交、Shift+Enter 换行 —— 与 Codex 的行为一致
            Enter: () => {
              cb.current.onSubmit()
              return true
            },
            'Shift-Enter': (state, dispatch) => {
              if (!dispatch) return false
              dispatch(state.tr.insertText('\n'))
              return true
            },
            'Mod-z': undo,
            'Mod-Shift-z': redo,
            'Mod-y': redo
          }),
          keymap(baseKeymap)
        ]
      }),
      // Codex 实测的属性集,逐项照抄
      attributes: {
        'aria-label': ariaLabel,
        'aria-multiline': 'true',
        dir: 'auto',
        role: 'textbox',
        spellcheck: 'true',
        translate: 'no',
        'data-virtualkeyboard': 'true',
        'data-codex-composer': 'true',
        style:
          'font-size: var(--codex-chat-font-size); height: auto; resize: none; min-height: 2.75rem;'
      },
      editable: () => !disabled,
      dispatchTransaction(tr: Transaction) {
        const v = viewRef.current
        if (!v) return
        const next = v.state.apply(tr)
        v.updateState(next)
        if (tr.docChanged) cb.current.onChange(next.doc.textBetween(0, next.doc.content.size, '\n'))
      }
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 只建一次:ariaLabel/disabled 的后续变化由下面两个 effect 处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部清空(提交后)或回填(发送失败)时同步文档内容
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.textBetween(0, view.state.doc.content.size, '\n')
    if (current === value) return
    const tr = view.state.tr.replaceWith(
      0,
      view.state.doc.content.size,
      value ? schema.text(value) : []
    )
    tr.setMeta('addToHistory', false)
    view.dispatch(tr)
  }, [value])

  useEffect(() => {
    viewRef.current?.setProps({ editable: () => !disabled })
  }, [disabled])

  return (
    <div
      ref={hostRef}
      className="codex-RichTextInput text-base [&_.ProseMirror]:leading-5"
      data-rich-text-layout="multiline"
    />
  )
}
