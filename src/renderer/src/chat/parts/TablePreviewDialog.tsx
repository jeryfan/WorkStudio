import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../../components/icons'

/**
 * 「Expand table」的表格预览弹层 —— Codex 的 `dSa`(图片预览对话框复用)
 * 在表格上的形态:`previewContent = div.codex-MarkdownRoot.codex-MarkdownTablePreview
 * > table.codex-Table`。
 *
 * Codex 复用的是它的图片查看器(带缩放/下载,表格时两者都关);WS 没有那个
 * 查看器,按 RawOutputDialog 的壳层模式起一个对话框(同一套 codex-dialog 类)。
 */
export function TablePreviewDialog({
  head,
  rows,
  onClose
}: {
  head: string[]
  rows: string[][]
  onClose(): void
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <>
      <div
        className="codex-dialog-overlay fixed inset-0 z-50 electron:bg-[#00000022]"
        onMouseDown={onClose}
      />
      <div className="codex-dialog fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 outline-none">
        <div
          role="dialog"
          aria-label="Table preview"
          className="relative max-h-[85vh] w-[720px] max-w-[92vw] overflow-hidden rounded-3xl bg-token-dropdown-background/90 text-token-foreground ring-[0.5px] ring-token-border shadow-lg backdrop-blur-xl"
        >
          <button
            type="button"
            aria-label="Close table preview"
            className="no-drag cursor-interaction absolute top-4 right-4 z-10 rounded p-1 leading-none text-token-foreground/80 hover:bg-token-toolbar-hover-background focus:outline-none focus-visible:ring-1 focus-visible:ring-token-focus-border"
            onClick={onClose}
          >
            <CloseIcon aria-hidden className="icon-xs" />
          </button>
          <div className="max-h-[85vh] overflow-auto p-5">
            <div className="codex-MarkdownRoot codex-MarkdownTablePreview">
              <table className="codex-Table" dir="auto">
                <thead>
                  <tr className="codex-TableRow">
                    {head.map((cell, i) => (
                      <th
                        key={i}
                        className="codex-TableHeaderCell codex-SingleChildTableCell"
                        dir="auto"
                      >
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="codex-TableBody">
                  {rows.map((row, r) => (
                    <tr key={r} className="codex-TableRow">
                      {row.map((cell, c) => (
                        <td
                          key={c}
                          className="codex-TableCell codex-SingleChildTableCell"
                          dir="auto"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
