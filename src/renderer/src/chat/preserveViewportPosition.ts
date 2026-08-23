/**
 * 让一个元素在**内容重排期间**保持在视口里的原位 —— Codex 的
 * `preserveElementViewportPosition`(app-initial 源码 `fWo`,导出名 `QD`)。
 *
 * ## 为什么需要它
 *
 * 会话滚动容器是 `flex flex-col-reverse`(贴底跟随靠它,见 ThreadScrollContainer)。
 * 反向 flex 的主轴起点在**底部**:唯一那个子元素从容器底边往上排。于是内容在
 * 位置 P 处长高 N 之后:
 *
 * - P **之前**的内容(离子元素顶边更近的)整体**上移 N**
 * - P 之后的内容位置不变
 *
 * 而折叠头恰恰在它自己展开内容的**前面** —— 点一下展开,它自己就往上跳了 N 像素。
 * 展开越多跳越远,实测过 51px / 74px。普通(非反向)容器里不会有这个问题:
 * 那边是把 P 之后的内容往下推,被点的元素不动。
 *
 * ## Codex 怎么做
 *
 * ```js
 * function fWo(el, zoom = 1) {
 *   const scroller = el.closest('[data-app-action-timeline-scroll]')
 *   if (scroller == null) return
 *   const baseline = el.getBoundingClientRect().top      // 点击那一刻的基准
 *   let raf = null
 *   const adjust = () => {
 *     if (el.isConnected) scroller.scrollTop += (el.getBoundingClientRect().top - baseline) / zoom
 *   }
 *   const schedule = () => { raf ??= requestAnimationFrame(() => { raf = null; adjust() }) }
 *   const onResize = () => { if (raf != null) cancelAnimationFrame(raf); raf = null; adjust(); schedule() }
 *   const turn = el.closest('[data-turn-key]')
 *   const ro = turn && new ResizeObserver(onResize)
 *   ro?.observe(turn)
 *   schedule()
 *   setTimeout(() => { raf != null && cancelAnimationFrame(raf); ro?.disconnect() }, 250)
 * }
 * ```
 *
 * 四个都不是可以省的:
 *
 * 1. **基准在点击的同步阶段就取好**,不能等 effect —— React 一 commit,布局已经变了。
 * 2. **观察的是 `[data-turn-key]` 而不是展开体**:展开动画是 framer-motion 在动
 *    `height`,每一帧都触发这一层的 resize;观察展开体自己会漏掉"turn 里别的东西
 *    也在变高"的情况(例如同时到达的流式内容)。
 * 3. **rAF 与 ResizeObserver 双轨**:RO 只在尺寸真变时触发,而 `scrollTop` 的写入
 *    要等下一帧才生效,单靠 RO 会慢半帧、看得出抖动。所以每次 RO 之后再排一个 rAF。
 * 4. **250ms 后收摊**。展开动画是 300ms(`DISCLOSURE_TRANSITION`),这里比它短
 *    —— 收尾那几十毫秒高度变化已经小于一像素,继续跟只会和用户自己的滚动打架。
 *
 * `scrollTop` 的增量要**除以 zoom**(Codex 的 `kh(e, t) => e / t`):
 * 应用根上挂着 `zoom: var(--codex-window-zoom)`,`getBoundingClientRect()` 返回的是
 * 缩放后的像素,而 `scrollTop` 是缩放前的。zoom 为 1 时两者相同,但不能写死。
 */

/** Codex 的 `pWo` */
const SETTLE_MS = 250

/** Codex 的 `sm.timelineScroll` —— 挂在 `.thread-scroll-container` 上 */
export const TIMELINE_SCROLL_ATTR = 'data-app-action-timeline-scroll'

export function preserveViewportPosition(element: HTMLElement, zoom = 1): void {
  const scroller = element.closest<HTMLElement>(`[${TIMELINE_SCROLL_ATTR}]`)
  if (scroller == null) return

  const baseline = element.getBoundingClientRect().top
  let raf: number | null = null

  const adjust = (): void => {
    if (!element.isConnected) return
    scroller.scrollTop += (element.getBoundingClientRect().top - baseline) / zoom
  }
  const schedule = (): void => {
    raf ??= window.requestAnimationFrame(() => {
      raf = null
      adjust()
    })
  }
  const onResize = (): void => {
    if (raf != null) {
      window.cancelAnimationFrame(raf)
      raf = null
    }
    adjust()
    schedule()
  }

  const turn = element.closest<HTMLElement>('[data-turn-key]')
  let observer: ResizeObserver | null = null
  if (turn != null && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(onResize)
    observer.observe(turn)
  }
  schedule()
  window.setTimeout(() => {
    if (raf != null) window.cancelAnimationFrame(raf)
    observer?.disconnect()
  }, SETTLE_MS)
}

/** 当前窗口缩放 —— Codex 走 context(`On()`),这里直接读那个 CSS 变量 */
export function windowZoom(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--codex-window-zoom')
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : 1
}
