import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 跑马灯测量 —— 从 Codex 的 bundle 逆出的完整算法。
 *
 * **职责划分(与 Codex 一致)**:
 * - CSS 负责 hover 触发、transform 动画、遮罩渐变、停止模式、animation-fill-mode
 *   (见 assets/codex/components.css 里的 codex-viewport / codex-track /
 *    codex-scrolling / codex-overflowingViewport 等)
 * - **JS 只负责测量**:判断是否溢出、算滚动距离与时长,把三个变量注入 inline style,
 *   并按需挂 `codex-scrolling` / `codex-overflowingViewport` 两个条件类
 *
 * 不溢出时 Codex **不注入任何变量、不挂条件类** —— 动画因此不存在,
 * 而不是"跑一个距离为 0 的动画"。这一点很重要:挂了类但距离为 0 会让
 * `stopAtEnd` 的遮罩动画照样跑一遍,标题右侧无故闪一下。
 *
 * **挂载位置**(实测,别搞反):
 * - inline style 三个变量 + `codex-overflowingViewport` → **clipViewport 层**
 * - `codex-scrolling` → **track 层**(动画作用在它的 transform 上)
 * - `codex-animateOnGroupHover` / `codex-stopAtEnd` → viewport 层(静态,由组件写死)
 *
 * 公式已用 Codex 运行时数值验证到小数位:
 *   viewport 136px / content 188.15625px / fontSize 14px / speed 2em/s
 *   → distance = 188.15625 - 136 = 52.15625px  (实测注入值一致)
 *   → duration = 0.35 + 52.15625/(2×14) = 2.213s  (实测注入值一致)
 * 注意距离是 **content − viewport**,不是 content − clipViewport
 * (clip 比 viewport 宽了一个 --marquee-left-fade)。
 *
 * 常量全部取自 Codex 实测值:
 *   --marquee-speed-em-per-second: 2   (CSS 里的默认值,可被覆盖)
 *   起始静止 0.35s;loop 模式额外 +1.85s 停顿
 *   linear() 用 129 点采样三次贝塞尔 (0.49,0.6)(0.7,1) —— 起步慢、中段匀速、收尾稳
 *   字号读不到时兜底 13px
 */
const START_DELAY_S = 0.35
const LOOP_TAIL_S = 1.85
const SAMPLES = 128
const FALLBACK_FONT_SIZE = 13
const FALLBACK_SPEED_EM_PER_S = 2
const LOOP_GAP_EM = 1.15
const BEZIER = { x1: 0.49, y1: 0.6, x2: 0.7, y2: 1 }

/** 单个 linear() 采样点:`<输出值> <时间百分比>` */
function point(value: number, atSeconds: number, totalSeconds: number): string {
  return `${value.toFixed(4)} ${((atSeconds / totalSeconds) * 100).toFixed(4)}%`
}

/** 贝塞尔曲线采样成 linear() 的点集 —— CSS 没法直接给"先慢后匀"的缓动,只能采样 */
function bezierPoints(startS: number, durationS: number, totalS: number): string[] {
  return Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const t = i / SAMPLES
    const inv = 1 - t
    const b1 = 3 * inv ** 2 * t
    const b2 = 3 * inv * t ** 2
    const b3 = t ** 3
    return point(
      b1 * BEZIER.y1 + b2 * BEZIER.y2 + b3,
      startS + durationS * (b1 * BEZIER.x1 + b2 * BEZIER.x2 + b3),
      totalS
    )
  })
}

function buildVars(
  distancePx: number,
  speedPxPerS: number,
  mode: 'stop-at-end' | 'loop'
): Record<string, string> {
  const scrollS = distancePx / speedPxPerS
  const totalS = START_DELAY_S + scrollS + (mode === 'loop' ? LOOP_TAIL_S : 0)
  return {
    '--marquee-duration': `${totalS.toFixed(3)}s`,
    '--marquee-scroll-distance': `${distancePx}px`,
    '--marquee-scroll-timing': `linear(${[
      point(0, 0, totalS),
      ...bezierPoints(START_DELAY_S, scrollS, totalS),
      ...(mode === 'loop' ? [point(1, totalS, totalS)] : [])
    ].join(', ')})`
  }
}

export interface MarqueeState {
  /** 注入到 viewport 元素的 inline style;不溢出时为 undefined */
  style?: Record<string, string>
  /** 是否溢出 —— 决定挂不挂 codex-overflowingViewport / codex-scrolling */
  overflowing: boolean
}

/**
 * @param mode 'stop-at-end' 滚到末尾停住(侧栏标题用这个) / 'loop' 循环
 */
export function useMarquee(
  text: string,
  mode: 'stop-at-end' | 'loop' = 'stop-at-end'
): { ref: (el: HTMLElement | null) => void; state: MarqueeState } {
  const [state, setState] = useState<MarqueeState>({ overflowing: false })
  const elRef = useRef<HTMLElement | null>(null)

  const measure = useCallback((): void => {
    const viewport = elRef.current
    if (!viewport) return
    const content = viewport.querySelector('[data-marquee-content]')
    if (!(content instanceof HTMLElement)) return

    // scrollWidth 兜底:getBoundingClientRect 在 transform 期间会量到变换后的宽度
    const contentWidth = content.getBoundingClientRect().width || content.scrollWidth
    const viewportWidth = viewport.getBoundingClientRect().width || viewport.clientWidth

    if (viewportWidth <= 0 || contentWidth <= viewportWidth) {
      setState((prev) => (prev.overflowing ? { overflowing: false } : prev))
      return
    }

    const cs = getComputedStyle(content)
    const fontSize = Number.parseFloat(cs.fontSize)
    const em = Number.isFinite(fontSize) ? fontSize : FALLBACK_FONT_SIZE
    const speedEm = Number.parseFloat(cs.getPropertyValue('--marquee-speed-em-per-second'))
    const speedPxPerS =
      (Number.isFinite(speedEm) && speedEm > 0 ? speedEm : FALLBACK_SPEED_EM_PER_S) * em

    let distance = contentWidth - viewportWidth
    if (mode === 'loop') {
      // loop 要滚过"整份内容 + 间隙",这样第二份接上时看不出接缝。
      // 有副本元素时以副本左缘为准 —— 比按 em 估更准(字体渲染有亚像素差)
      distance = contentWidth + em * LOOP_GAP_EM
      const copy = viewport.querySelector('[data-marquee-copy]')
      if (copy instanceof HTMLElement) {
        const d = copy.getBoundingClientRect().left - content.getBoundingClientRect().left
        if (d > 0) distance = d
      }
    }

    const style = buildVars(distance, speedPxPerS, mode)
    setState((prev) =>
      prev.overflowing &&
      prev.style?.['--marquee-scroll-distance'] === style['--marquee-scroll-distance']
        ? prev
        : { overflowing: true, style }
    )
  }, [mode])

  const ref = useCallback(
    (el: HTMLElement | null) => {
      elRef.current = el
      if (el) measure()
    },
    [measure]
  )

  // 文本变了要重测(标题会随流式更新)
  useEffect(() => {
    measure()
  }, [text, measure])

  // 侧栏宽度可拖 —— 宽度变化直接决定是否溢出,必须观察
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  return { ref, state }
}
