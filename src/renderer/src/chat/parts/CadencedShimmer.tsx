import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from '../../utils/cx'

/**
 * Codex 的「正在做事」文字流光 —— `thinking-shimmer-*.js` 的 `C`/`w`。
 *
 * 与上一版的出入(都是这轮读源码推翻的):
 *
 * 1. **`active=false` 时渲染成纯 span**,sweep/highlight 两个子节点直接不挂载
 *    (`if (!active || !context) return <span className={className}>{children}</span>`)。
 *    上一版保留结构只摘 Active 类 —— 完成态的活动行在 Codex 的 DOM 里
 *    一个 shimmer 类都没有,就是这分支。
 * 2. **载体类是 `loading-shimmer-pure-text` + `cadencedShimmer`**,
 *    没有 `thinkingShimmer`(那个类在 Codex 当前构建里 `--shimmer-*` 两个值
 *    都解析为空,已实测)。`--shimmer-text-secondary` 解析为前景 55% 的
 *    color-mix,深浅色都成立。
 * 3. **打拍子由 JS 驱动**,不是 CSS 常开:
 *
 *    ```
 *    600ms 后第一次:加 cadencedShimmerActive → 1s 后摘掉
 *    之后每 4000ms 重复一次
 *    ```
 *
 *    (源码常量 `j=600` / `A=4000` / `k=1000`。)`Active` 类触发的是
 *    `steps(48,end) 1s 单次` 的扫带动画,扫完摘掉,所以闪烁是
 *    "隔几秒扫一下",不是一直流动。类的增删直接走 `classList`
 *    (与 Codex 一致 —— 不为打拍子引起 React 重渲染)。
 *
 * 4. `prefers-reduced-motion: reduce` 时不启动计时器(CSS 侧也有兜底)。
 *
 * Codex 另有一个 statsig 档位(`shimmer_variant === 'cadenced_legacy'`)
 * 控制是否启用扫带;WS 没有实验平台,按启用处理 —— CSS 与行为都已就位,
 * 关掉扫带只是少了点缀,不影响可读性。
 */

/** 首次扫带前的等待(Codex `j`) */
const INITIAL_DELAY_MS = 600
/** 两次扫带的间隔(Codex `A`) */
const CADENCE_MS = 4000
/** 一次扫带的时长(Codex `k`,与 CSS 的 1s steps(48) 单次对应) */
const SWEEP_MS = 1000

export function CadencedShimmer({
  active = true,
  ariaHidden,
  children,
  className
}: {
  /** false 时渲染成纯 span —— 完成态的行在 Codex 里没有 shimmer 结构 */
  active?: boolean
  /**
   * 挂到载体 span 上的 `aria-hidden` —— Codex 的调用方(`No` 的
   * `aria-hidden={!isVisible}`)会在"占位但不可见"时把整块对屏幕阅读器藏掉。
   * 与 `active` 是两件事:那一档摘的是流光结构,这一档只改可访问性。
   */
  ariaHidden?: boolean
  children: ReactNode
  className?: string
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!active) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = ref.current
    if (el == null) return

    let sweepTimer: number | undefined
    let interval: number | undefined
    const stopSweep = (): void => {
      if (sweepTimer != null) {
        window.clearTimeout(sweepTimer)
        sweepTimer = undefined
      }
    }
    const pulse = (): void => {
      stopSweep()
      // 先摘再加强制同一拍内动画重播 —— 与 Codex 的 remove/add 序列一致
      el.classList.remove('codex-cadencedShimmerActive')
      el.classList.add('codex-cadencedShimmerActive')
      sweepTimer = window.setTimeout(() => {
        el.classList.remove('codex-cadencedShimmerActive')
        sweepTimer = undefined
      }, SWEEP_MS)
    }
    const initial = window.setTimeout(() => {
      pulse()
      interval = window.setInterval(pulse, CADENCE_MS)
    }, INITIAL_DELAY_MS)
    return () => {
      stopSweep()
      window.clearTimeout(initial)
      if (interval != null) window.clearInterval(interval)
      el.classList.remove('codex-cadencedShimmerActive')
    }
  }, [active])

  // Codex 的 `C` 的非活跃分支:纯 span,没有流光结构
  if (!active) {
    return (
      <span aria-hidden={ariaHidden} className={className}>
        {children}
      </span>
    )
  }
  return (
    <span
      ref={ref}
      aria-hidden={ariaHidden}
      className={cx('loading-shimmer-pure-text', 'codex-cadencedShimmer', className)}
    >
      {children}
      <span aria-hidden="true" className="codex-cadencedShimmerSweep">
        {/* 高亮副本 —— aria-hidden,否则屏幕阅读器会把同一句话念两遍 */}
        <span className="codex-cadencedShimmerHighlight">{children}</span>
      </span>
    </span>
  )
}
