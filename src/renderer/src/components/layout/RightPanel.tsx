import type { ReactNode } from 'react'
import { ResizeHandle } from './ResizeHandle'

/**
 * 右侧面板外壳 —— 逐层复刻 Codex 实测形态(见 ContentArea 里的层级注释)。
 *
 * 四个细节都是实测出来的,别按直觉改:
 *
 * 1. **左缘是投影不是边框**:`div.w-px.shadow-[-8px_0_16px_-8px_rgb(0_0_0/0.18)]`
 *    单独一个 1px 元素扛投影;真正的 `border-l` 在最内层那个 div 上。两者都有。
 * 2. **内层用 absolute + 同值 min-width/width**。宽度动画时外层 aside 的 width 在变,
 *    内层锁死自己的宽度,内容才不会跟着一帧一帧重排。
 * 3. `ltr:ms-auto` 把面板推到行尾 —— 主区 MainContentViewport 是 flex-1,
 *    但面板折叠时(不渲染)不留空隙,靠 auto margin 而不是 justify-end。
 * 4. `z-[41]` / 手柄 `z-40` / 投影 `z-30` 三层次序固定,手柄必须压在投影之上
 *    才能接到指针。
 */
export function RightPanel({
  width,
  onResize,
  children
}: {
  width: number
  onResize(desired: number): void
  children: ReactNode
}): React.JSX.Element {
  return (
    <aside
      data-app-shell-focus-area="right-panel"
      className="relative z-[41] h-full min-h-0 min-w-0 shrink-0 overflow-visible ltr:ms-auto rtl:me-auto"
      style={{ opacity: 1, width: `${width}px` }}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-30 w-px shadow-[-8px_0_16px_-8px_rgb(0_0_0/0.18)]" />
      <ResizeHandle
        placement="panel-start"
        size={width}
        onResize={onResize}
        ariaLabel="Resize side panel"
      />
      <div className="absolute inset-0 min-h-0 min-w-0 overflow-hidden">
        <div
          className="absolute top-0 bottom-0 left-0 min-w-0 bg-token-main-surface-primary border-l border-token-border-default"
          style={{ minWidth: `${width}px`, width: `${width}px` }}
        >
          {children}
        </div>
      </div>
    </aside>
  )
}
