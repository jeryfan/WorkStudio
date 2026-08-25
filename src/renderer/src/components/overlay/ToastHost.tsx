import { dismissToast, useToasts } from '../../state/toastStore'
import { CloseIcon } from '../icons'

/**
 * toast 卡片 —— Codex `_$a`（app-initial:581830 附近）的容器类逐字照搬：
 *
 *   div.no-drag.pointer-events-auto.grid.w-[340px].max-w-[70vw]
 *      .grid-cols-[minmax(0,1fr)_auto_auto].overflow-hidden.rounded-[20px]
 *      .border-[0.5px].border-token-border.bg-token-side-bar-background
 *      .shadow-[0px_8px_16px_-4px_rgba(0,0,0,0.12)]
 *
 * 三列布局（内容 / 动作 / 关闭）也是那个 class 定的。**卡片内部的排版不确定**：
 * Codex 的 toast 行内容由各调用方传（`custom({content})`），错误类那一条的具体
 * 结构没取证到。这里按同族菜单/卡片的 token 取 `px-4 py-3 text-sm`，
 * 只放文字 + 关闭按钮 —— 宁可少画，不猜一套图标/标题层级。
 */
export function ToastHost(): React.JSX.Element | null {
  const toasts = useToasts()
  if (toasts.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="no-drag pointer-events-auto grid w-[340px] max-w-[70vw] grid-cols-[minmax(0,1fr)_auto_auto] overflow-hidden rounded-[20px] border-[0.5px] border-token-border bg-token-side-bar-background shadow-[0px_8px_16px_-4px_rgba(0,0,0,0.12)]"
        >
          <div className="min-w-0 px-4 py-3 text-sm text-token-foreground">{toast.text}</div>
          <div />
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismissToast(toast.id)}
            className="cursor-interaction flex items-center justify-center px-3 text-token-text-tertiary hover:text-token-foreground"
          >
            <CloseIcon className="icon-xs" />
          </button>
        </div>
      ))}
    </div>
  )
}
