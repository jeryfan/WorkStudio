import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { EditorState, Plugin, PluginKey, TextSelection, type Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'
import { Schema, type Node as PMNode } from 'prosemirror-model'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'
import type { UserInput } from '@shared/protocol/entities'

/**
 * Composer 输入区 —— Codex 用 ProseMirror,这里复刻它实测的 DOM 契约:
 *
 *   div.codex-RichTextInput.text-base.[&_.ProseMirror]:leading-5 [data-rich-text-layout]
 *   └ div.ProseMirror[contenteditable="true"][aria-multiline="true"][dir="auto"]
 *       [role="textbox"][spellcheck="true"][translate="no"][data-virtualkeyboard="true"]
 *       [data-codex-composer="true"][aria-label]
 *       style="font-size: var(--codex-chat-font-size); height: auto; resize: none;
 *              min-height: 2.75rem;"
 *     ├ p.placeholder[dir="auto"][data-placeholder]      ← 空文档时才有 .placeholder
 *     │ └ br.ProseMirror-trailingBreak
 *     └ p[dir="auto"]
 *       └ span.codex-ComposerMention[data-mention-kind][data-mention-path]
 *           [contenteditable="false"]                     ← mention chip(atom 节点)
 *
 * 为什么必须是 contenteditable 而不能继续用 textarea:
 * - `p.placeholder[data-placeholder]` 的占位符走 CSS,不是 placeholder 属性;
 *   Codex 的 components.css 里那条规则只匹配这个结构。
 * - 高度自增长靠 `height:auto` + `min-height:2.75rem`(44px),textarea 得靠 JS 量行数。
 * - @-mention / slash 触发 / 附件粘贴都挂在 ProseMirror 的 plugin 上,
 *   textarea 无法承载(这也是 Codex 选它的原因)。
 *
 * autocomplete(Codex 的 `@`/`/` 触发体系):
 * - 插件 state 形如 Codex `{active, kind: 'slash-command'|'at-mention', trigger, range, query}`。
 * - `/` 只在段落首字符触发;`@` 在段首或空白后触发。
 * - 菜单激活时 ArrowUp/ArrowDown/Enter/Tab/Escape 被插件拦截,不进入编辑器
 *   (Enter 此时是"选中菜单项"而不是提交 —— 插件顺序在本文件 keymap 之前)。
 */

/** 菜单触发状态(对齐 Codex 的 autocomplete 插件 state 形状) */
export interface ComposerAutocompleteState {
  active: boolean
  kind: 'slash-command' | 'at-mention'
  trigger: '/' | '@'
  /** 触发字符在文档中的位置 */
  from: number
  /** 触发字符之后、光标之前的查询串 */
  query: string
}

export interface ComposerDraft {
  /** 纯文本(mention 以其名字计入);判空/排队/编辑回填用 */
  text: string
  /** 提交用的协议输入:文本段 + skill/mention 变体 */
  inputs: UserInput[]
}

export interface RichTextInputHandle {
  /** 用 mention chip 替换当前触发区间(选中菜单项时调用) */
  insertMention(kind: 'skill' | 'file', name: string, path: string): void
  /** 清空文档(加号菜单选文件前清掉查询串) */
  clearDoc(): void
}

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
    text: { group: 'inline' },
    /**
     * mention chip —— Codex 的 composer 把 @文件 / /技能 存成内联原子节点,
     * 提交时投影成协议的 `mention` / `skill` UserInput 变体。
     * DOM 结构(codex-ComposerMention)未见 Codex 源码逐字确认,属性为本地约定。
     */
    mention: {
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      attrs: {
        kind: { default: 'file' },
        name: { default: '' },
        path: { default: '' }
      },
      toDOM: (node) => [
        'span',
        {
          class: 'codex-ComposerMention',
          'data-mention-kind': node.attrs.kind,
          'data-mention-path': node.attrs.path,
          contenteditable: 'false'
        },
        node.attrs.name
      ],
      parseDOM: [
        {
          tag: 'span[data-mention-kind]',
          getAttrs: (dom) => ({
            kind: dom.getAttribute('data-mention-kind') ?? 'file',
            name: dom.textContent ?? '',
            path: dom.getAttribute('data-mention-path') ?? ''
          })
        }
      ]
    }
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

/** 关闭 autocomplete 的事务 meta 标识 */
const AUTOCOMPLETE_CLOSE_META = 'codex-composer-autocomplete-close'
const autocompleteKey = new PluginKey<ComposerAutocompleteState | null>(
  'codex-composer-autocomplete'
)

/** 对象替换符 —— textBetween 遇到 atom 节点(mention)时的占位,触发检测遇之即停 */
const OBJECT_REPLACEMENT_CHAR = '￼'

/**
 * 从选择状态推导触发态(Codex:activation 'typed' 的来源)。
 * 仅光标态(非选区)参与;查询串跨 mention / 换行即失效。
 */
function computeAutocomplete(state: EditorState): ComposerAutocompleteState | null {
  const sel = state.selection
  if (!sel.empty) return null
  const $from = sel.$from
  if (!$from.parent.isTextblock) return null
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')

  // `/`:必须是段落首字符(Codex slash 命令的触发约束)
  if (textBefore.startsWith('/')) {
    const query = textBefore.slice(1)
    if (!query.includes(OBJECT_REPLACEMENT_CHAR)) {
      return {
        active: true,
        kind: 'slash-command',
        trigger: '/',
        from: sel.from - textBefore.length,
        query
      }
    }
    return null
  }

  // `@`:段首或空白之后
  const atIndex = textBefore.lastIndexOf('@')
  if (atIndex >= 0 && (atIndex === 0 || /\s/.test(textBefore[atIndex - 1]))) {
    const query = textBefore.slice(atIndex + 1)
    if (!query.includes(OBJECT_REPLACEMENT_CHAR)) {
      return {
        active: true,
        kind: 'at-mention',
        trigger: '@',
        from: sel.from - (textBefore.length - atIndex),
        query
      }
    }
  }
  return null
}

/** 文档 → 提交序列:文本段按 mention 节点切开,mention 投影成协议变体 */
function serializeDoc(doc: PMNode): ComposerDraft {
  const inputs: UserInput[] = []
  let buf = ''
  const flush = (): void => {
    if (buf.length > 0) {
      inputs.push({ type: 'text', text: buf, text_elements: [] })
      buf = ''
    }
  }
  let firstParagraph = true
  doc.forEach((paragraph) => {
    if (!firstParagraph) buf += '\n'
    firstParagraph = false
    paragraph.forEach((node) => {
      if (node.isText) {
        buf += node.text ?? ''
      } else if (node.type.name === 'mention') {
        flush()
        inputs.push({
          type: node.attrs.kind === 'skill' ? 'skill' : 'mention',
          name: node.attrs.name,
          path: node.attrs.path
        })
      }
    })
  })
  flush()
  const text = doc.textBetween(0, doc.content.size, '\n', ' ')
  return { text, inputs }
}

export const RichTextInput = forwardRef<
  RichTextInputHandle,
  {
    value: string
    placeholder: string
    ariaLabel: string
    disabled?: boolean
    onChange(draft: ComposerDraft): void
    onSubmit(draft: ComposerDraft): void
    /** autocomplete 状态变化(null = 关闭) */
    onAutocompleteChange(state: ComposerAutocompleteState | null): void
    /** 菜单激活时的导航命令(ArrowUp/ArrowDown/Enter/Tab) */
    onAutocompleteCommand(command: 'up' | 'down' | 'enter'): void
    /** 加号菜单打开(此时导航键归菜单,Escape 走 onMenuEscape) */
    plusMenuOpen: boolean
    /** Escape 且 autocomplete 未激活(用于关加号菜单) */
    onMenuEscape(): void
  }
>(function RichTextInput(
  {
    value,
    placeholder,
    ariaLabel,
    disabled = false,
    onChange,
    onSubmit,
    onAutocompleteChange,
    onAutocompleteCommand,
    plusMenuOpen,
    onMenuEscape
  },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // 回调放 ref:EditorView 只创建一次,plugin 里的闭包不能捕获过期的 props
  const cb = useRef({
    onChange,
    onSubmit,
    placeholder,
    onAutocompleteChange,
    onAutocompleteCommand,
    plusMenuOpen,
    onMenuEscape
  })
  useEffect(() => {
    cb.current = {
      onChange,
      onSubmit,
      placeholder,
      onAutocompleteChange,
      onAutocompleteCommand,
      plusMenuOpen,
      onMenuEscape
    }
  })
  // 上次外抛的 autocomplete 状态:按值比较,避免每次击键都触发父级 setState
  const lastAutocompleteRef = useRef<ComposerAutocompleteState | null>(null)

  useImperativeHandle(ref, () => ({
    insertMention(kind, name, path) {
      const view = viewRef.current
      if (!view) return
      const autocomplete = autocompleteKey.getState(view.state)
      const from = autocomplete?.active ? autocomplete.from : view.state.selection.from
      const mentionNode = schema.nodes.mention.create({
        kind: kind === 'skill' ? 'skill' : 'file',
        name,
        path
      })
      const tr = view.state.tr.replaceWith(from, view.state.selection.from, mentionNode)
      // chip 后补一个空格,光标落在空格后(Codex 实测行为:chip 与后续文本分隔)
      const after = from + mentionNode.nodeSize
      tr.insertText(' ', after)
      tr.setSelection(TextSelection.create(tr.doc, after + 1))
      tr.setMeta(AUTOCOMPLETE_CLOSE_META, true)
      view.dispatch(tr)
      view.focus()
    },
    clearDoc() {
      const view = viewRef.current
      if (!view) return
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, [])
      tr.setMeta('addToHistory', false)
      view.dispatch(tr)
      view.focus()
    }
  }))

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const reportAutocomplete = (state: EditorState): void => {
      // 以插件 state 为准(它尊重 close meta;直接重算会让 Esc 关掉的菜单下一帧又弹回)
      const next = autocompleteKey.getState(state) ?? null
      const prev = lastAutocompleteRef.current
      const same =
        (next === null && prev === null) ||
        (next != null &&
          prev != null &&
          next.kind === prev.kind &&
          next.from === prev.from &&
          next.query === prev.query)
      if (same) return
      lastAutocompleteRef.current = next
      cb.current.onAutocompleteChange(next)
    }

    const autocompletePlugin = new Plugin<ComposerAutocompleteState | null>({
      key: autocompleteKey,
      state: {
        init: () => null,
        apply: (tr, _prev, _oldState, newState) => {
          if (tr.getMeta(AUTOCOMPLETE_CLOSE_META)) return null
          return computeAutocomplete(newState)
        }
      },
      props: {
        // 菜单激活时接管导航键;先于后面的 keymap(Enter 此时不是提交)
        handleKeyDown: (view, event) => {
          const autocomplete = autocompleteKey.getState(view.state)
          const navActive = autocomplete?.active === true || cb.current.plusMenuOpen
          if (!navActive) return false
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            cb.current.onAutocompleteCommand(event.key === 'ArrowDown' ? 'down' : 'up')
            return true
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault()
            cb.current.onAutocompleteCommand('enter')
            return true
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            if (autocomplete?.active === true) {
              view.dispatch(view.state.tr.setMeta(AUTOCOMPLETE_CLOSE_META, true))
            } else {
              cb.current.onMenuEscape()
            }
            return true
          }
          return false
        }
      }
    })

    const view = new EditorView(host, {
      state: EditorState.create({
        schema,
        plugins: [
          placeholderPlugin(() => cb.current.placeholder),
          autocompletePlugin,
          history(),
          keymap({
            // Enter 提交、Shift+Enter 换行 —— 与 Codex 的行为一致
            Enter: () => {
              cb.current.onSubmit(serializeDoc(viewRef.current!.state.doc))
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
        if (tr.docChanged || tr.selectionSet) reportAutocomplete(next)
        if (tr.docChanged) cb.current.onChange(serializeDoc(next.doc))
      }
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
      lastAutocompleteRef.current = null
    }
    // 只建一次:ariaLabel/disabled 的后续变化由下面两个 effect 处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部清空(提交后)或回填(发送失败/编辑排队消息)时同步文档内容
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    // 与 serializeDoc 同一序列化口径(mention 计为单个空格),否则每次插入
    // chip 后值与文档都会对不上,被这里整体重排把 chip 抹掉
    const current = view.state.doc.textBetween(0, view.state.doc.content.size, '\n', ' ')
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
})
