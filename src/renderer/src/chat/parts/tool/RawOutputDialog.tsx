import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../../../components/icons'
import { CodeBlockPart } from '../CodeBlockPart'

/**
 * 「原始输出」对话框 —— MCP 活动行右下角那个 `</>` 按钮打开的东西。
 *
 * 逐层照 Codex 的 `Dialog`(app-initial `SL`/`uui`)+ `DialogBody`(`kL`)
 * + `DialogSection`(`jL`)+ `DialogHeader`(`OL`):
 *
 * ```
 * div.codex-dialog-overlay.fixed.inset-0.z-50.electron:bg-[#00000022]
 * div.codex-dialog.fixed.left-1/2.top-1/2.z-50.-translate-x-1/2.-translate-y-1/2.outline-none
 * └ div.w-[520px].max-w-[92vw].rounded-3xl.ring-[0.5px].ring-token-border
 *      .bg-token-dropdown-background/90.backdrop-blur-xl.shadow-lg.overflow-hidden
 *   ├ button.absolute.top-4.right-4                       ← 关闭
 *   └ div.flex.flex-col.gap-0.px-5.py-5                   ← DialogBody
 *     ├ div.flex.w-full.flex-col.pt-3.first:pt-0 > div.flex.flex-col.items-start.gap-3
 *     │   └ h2.heading-dialog  «Raw {server}.{tool} tool call output»
 *     └ div.flex.w-full.flex-col.pt-3.first:pt-0 > CodeSnippet(json, max-h-128)
 * ```
 *
 * ## 为什么这个对话框是必须的
 *
 * Codex 的 MCP 活动行展开体里**只有结果,没有入参**。入参(以及 callId、耗时、
 * 未经解析的原始 result)全部收进这里。所以它不是"锦上添花的调试面板" ——
 * 去掉它,入参就彻底没有去处了。
 *
 * ## 必须 portal 到 body
 *
 * `#root > div.relative.flex.flex-col` 上有 `zoom: var(--codex-window-zoom)`,
 * 而 `zoom` 会给后代建立新的包含块 —— 挂在会话流里的 `fixed` 元素会相对那一层
 * 定位而不是视口,窗口缩放时对话框会漂。这与 `AppPortals` 挂在 body 下是同一个理由。
 */
export function RawOutputDialog({
  title,
  json,
  onClose
}: {
  title: string
  json: string
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
          aria-label={title}
          className="relative w-[520px] max-w-[92vw] overflow-hidden rounded-3xl bg-token-dropdown-background/90 text-token-foreground ring-[0.5px] ring-token-border shadow-lg backdrop-blur-xl"
        >
          <button
            type="button"
            aria-label="Close"
            className="no-drag cursor-interaction absolute top-4 right-4 rounded p-1 leading-none text-token-foreground/80 hover:bg-token-toolbar-hover-background focus:outline-none focus-visible:ring-1 focus-visible:ring-token-focus-border"
            onClick={onClose}
          >
            <CloseIcon aria-hidden className="icon-xs" />
          </button>
          <div className="flex flex-col gap-0 px-5 py-5 text-base leading-normal tracking-normal">
            <div className="flex w-full flex-col pt-3 first:pt-0">
              <div className="flex flex-col items-start gap-3">
                <h2 className="heading-dialog">{title}</h2>
              </div>
            </div>
            <div className="flex w-full flex-col pt-3 first:pt-0">
              <CodeBlockPart
                code={json}
                lang="json"
                codeContainerClassName="max-h-128 overflow-auto"
              />
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
