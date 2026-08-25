import { useState, type ReactNode } from 'react'
import { cx } from '../../utils/cx'

/**
 * 悬浮卡片里的一行 —— Codex 的 `tPc`,会话卡片专用。
 *
 * 图标槽固定 `h-5 w-4`,图标本身被强制加上 `icon-xs`(Codex 用 cloneElement
 * 注入,这里由调用方直接写在图标上,效果相同)。
 *
 * 三个形态开关都在实测里出现过:
 * - `allowWrap`:整行改成 `items-start` + `whitespace-normal`,并且**不加 h-5**
 *   —— 分支不匹配警告那类长文案要换行,固定行高会截掉第二行
 * - `tone: 'danger'`:文字换 `token-editor-warning-foreground`
 * - `trailingContent`:尾槽存在时也不加 h-5,并且行变成按钮时内边距不同
 */
export interface HoverCardRow {
  id: string
  icon: ReactNode
  label: ReactNode
  allowWrap?: boolean
  tone?: 'danger'
  trailingContent?: ReactNode
  onClick?(event: React.MouseEvent): void
}

export function HoverCardRowView({ row }: { row: HoverCardRow }): React.JSX.Element {
  const base = cx(
    'flex min-w-0 gap-1.5 text-sm leading-5',
    row.allowWrap ? 'items-start' : 'items-center',
    !row.allowWrap && row.trailingContent == null && 'h-5'
  )
  const body = (
    <>
      <span className="flex h-5 w-4 shrink-0 items-center justify-center text-token-description-foreground">
        {row.icon}
      </span>
      <span
        className={cx(
          'block min-w-0 flex-1 leading-5',
          row.allowWrap ? 'whitespace-normal' : 'overflow-hidden text-ellipsis whitespace-nowrap',
          row.tone === 'danger' ? 'text-token-editor-warning-foreground' : 'text-token-foreground'
        )}
      >
        {row.label}
      </span>
      {row.trailingContent != null && (
        <span className="flex h-5 shrink-0 items-center">{row.trailingContent}</span>
      )}
    </>
  )
  if (row.onClick == null) return <div className={base}>{body}</div>
  return (
    <button
      type="button"
      className={cx(
        base,
        'cursor-interaction rounded-md text-start hover:bg-token-list-hover-background focus-visible:bg-token-list-hover-background focus-visible:outline-none',
        row.trailingContent == null ? 'w-full' : '-mx-1 px-1 py-1'
      )}
      onClick={(event) => {
        event.stopPropagation()
        row.onClick?.(event)
      }}
    >
      {body}
    </button>
  )
}

/** 一组行 —— Codex 的 `ZNc`,按 section 分组,组间没有分隔线只有 gap */
export interface HoverCardSection {
  id: string
  rows: HoverCardRow[]
}

export function HoverCardSectionView({
  section
}: {
  section: HoverCardSection
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {section.rows.map((row) => (
        <HoverCardRowView key={row.id} row={row} />
      ))}
    </div>
  )
}

/**
 * 卡片里的可改名标题 —— Codex 的 `WNc`。
 *
 * 三个只有读源码才知道的细节,都照做了:
 * 1. `size={Math.max(1, value.length)}` —— input 的 size 属性跟着字数变,
 *    这样输入框宽度随内容走(外层还有 w-0 flex-1 兜底)。
 * 2. Enter **不直接提交**,而是 `blur()`,由 onBlur 统一提交 —— 只有一条提交路径。
 * 3. Escape 走 `dataset.cancelRename = 'true'` 打标记再 blur,onBlur 看到标记
 *    就跳过提交。用状态变量做不到:blur 先于 React 状态更新到达。
 *
 * `onRename == null` 时退化成纯文本 div(不可点),这也是 Codex 的分支。
 */
export function HoverCardTitle({
  className,
  onRename,
  title,
  titleValue,
  editing: editingProp,
  onEditingChange
}: {
  className?: string
  onRename?(next: string): void
  title: ReactNode
  titleValue?: string
  /**
   * 受控编辑态（可选）。给 header 用：三点菜单里的 "Rename chat" 要能从外面
   * 把这个标题切进编辑态。不传就退回内部自管（侧栏 hover card 的用法）。
   */
  editing?: boolean
  onEditingChange?(editing: boolean): void
}): React.JSX.Element {
  const [editingState, setEditingState] = useState(false)
  const editing = editingProp ?? editingState
  const setEditing = (next: boolean): void => {
    setEditingState(next)
    onEditingChange?.(next)
  }
  const [value, setValue] = useState(titleValue ?? '')

  if (onRename == null || titleValue == null) {
    return (
      <div
        className={cx(
          '-ms-0.5 min-w-0 truncate px-1.5 text-base leading-6 font-medium text-token-foreground',
          className
        )}
      >
        {title}
      </div>
    )
  }

  const commit = (next: string): void => {
    const trimmed = next.trim()
    setEditing(false)
    if (trimmed.length === 0 || trimmed === titleValue) {
      setValue(titleValue)
      return
    }
    onRename(trimmed)
  }

  if (editing) {
    return (
      <input
        autoFocus
        size={Math.max(1, value.length)}
        className={cx(
          'no-drag -ms-0.5 h-6 min-w-0 rounded-md border border-token-focus-border bg-token-input-background px-1.5 text-base leading-6 font-medium text-token-input-foreground outline-none',
          className
        )}
        value={value}
        aria-label="Chat title"
        onBlur={(e) => {
          if (e.currentTarget.dataset.cancelRename === 'true') return
          commit(e.currentTarget.value)
        }}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === ' ') e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
            return
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            e.currentTarget.dataset.cancelRename = 'true'
            setValue(titleValue)
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <button
      type="button"
      className={cx(
        'no-drag -ms-0.5 min-w-0 cursor-interaction truncate rounded-md px-1.5 text-start text-base leading-6 font-medium text-token-foreground hover:bg-token-list-hover-background focus-visible:bg-token-list-hover-background focus-visible:outline-none',
        className
      )}
      onClick={() => {
        setValue(titleValue)
        setEditing(true)
      }}
    >
      {title}
    </button>
  )
}
