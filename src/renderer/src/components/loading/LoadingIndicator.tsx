import { BlossomShimmer } from './BlossomShimmer'
import { cx } from '../../utils/cx'

/**
 * 加载态 —— Codex `Jir`(app-initial:5723249),整个应用只有这一个加载指示器。
 *
 * 三档定位(互斥,按 Codex 的三元序):
 *   overlay    → `absolute inset-0 z-10 bg-token-bg-primary/70`   盖在已有内容上
 *   fillParent → `absolute inset-0 bg-transparent`                填满父容器
 *   都不给     → `relative size-full bg-transparent`              自己占满一块
 *
 * 只有第三档会额外渲染一条顶部拖拽带
 * (`absolute inset-x-0 top-0 draggable electron:h-toolbar`)—— 它是整屏加载时
 * 唯一能拖窗口的地方;前两档的父级已经有 header 了,再加一条会盖住工具栏按钮。
 *
 * 内容永远是「一列居中」:`div.flex.flex-col.items-center.gap-2` 里放
 * `size-14`(56px)的 blossom 流光。Codex 的第二个 children 位置是 debug 用的
 * (产物里恒为 null,由 `debugName` 驱动一个从不打开的开关),这里不搬。
 *
 * `debugName` 保留:Codex 每个调用点都传,用来在 profiler / React DevTools 里
 * 区分是谁在转(`LocalConversationThread.state`、`AppShell.Content` 等)。
 * 它不进 DOM —— 与 Codex 一致。
 */
export function LoadingIndicator({
  overlay = false,
  fillParent = false,
  showLogo = true,
  debugName
}: {
  overlay?: boolean
  fillParent?: boolean
  showLogo?: boolean
  /** 仅用于调试标识,不落 DOM(Codex 同) */
  debugName?: string
}): React.JSX.Element {
  void debugName
  return (
    <div
      className={cx(
        'flex items-center justify-center',
        overlay
          ? 'absolute inset-0 z-10 bg-token-bg-primary/70'
          : fillParent
            ? 'absolute inset-0 bg-transparent'
            : 'relative size-full bg-transparent'
      )}
    >
      {!overlay && !fillParent && (
        <div className="absolute inset-x-0 top-0 draggable electron:h-toolbar extension:h-toolbar-sm" />
      )}
      <div className="flex flex-col items-center gap-2">
        {showLogo && <BlossomShimmer className="size-14" />}
      </div>
    </div>
  )
}
