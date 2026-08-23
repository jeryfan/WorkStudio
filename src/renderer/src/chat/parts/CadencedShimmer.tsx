import type { ReactNode } from 'react'
import { cx } from '../../utils/cx'

/**
 * Codex 的「正在做事」文字流光 —— `cadencedShimmer` 一族。
 *
 * 取证路径:CSS dump 里有一个专门的文件 `thinking-shimmer-C6cWVbB-.css`,
 * 里面只有四个类 `_cadencedShimmer{,Active,Highlight,Sweep}_1q6es_*`;
 * 提取器已把它们生成成 `codex-cadencedShimmer*`(components.css 里 9 处规则)。
 *
 * ⚠️ 这一族只**消费** `--shimmer-text-secondary` / `--shimmer-contrast`,不定义它们,
 * 必须同时挂一个「载体」类。实测过两次才挑对:
 *
 * | 载体 | contrast 值 | 用在哪 |
 * |---|---|---|
 * | `loading-shimmer-pure-text` / `loading-shimmer` | `#ffffffbf`(白 75%) | 列表/侧栏 loading 态 |
 * | `codex-thinkingShimmer` | `color-mix(currentColor/token-foreground …)` | **会话里的思考/工作文字** |
 *
 * 第一版挂了 `loading-shimmer-pure-text`,实测高亮色算出来是
 * `rgba(255,255,255,0.75)` —— 浅色背景上等于**看不见**。那条规则是给深色表面
 * 写的(它的 `.dark` 变体反而给黑色,语义是反的,应该是从 ChatGPT web 带过来的)。
 * `thinkingShimmer` 的两个值都由 `currentColor` / `--color-token-foreground` 推导,
 * 深浅色都成立,这才是会话内该用的载体 —— 而且那个 CSS 文件本来就叫
 * `thinking-shimmer.css`,cadencedShimmer 四个类就住在里面。
 *
 * 另外这两个类原先都没被提取器收进来,已加进 NAMED 列表重跑。
 *
 * ## 它不是"给文字加个渐变背景"
 *
 * 文字被渲染**两遍**:
 *
 * ```
 * span.codex-cadencedShimmer[.codex-cadencedShimmerActive]   ← 底层文字,色 --shimmer-text-secondary
 * └ span.codex-cadencedShimmerSweep                          ← absolute 铺满 + 渐变 mask 开的一条亮带
 *   └ span.codex-cadencedShimmerHighlight  {同样的文字}       ← 高亮副本,色 --shimmer-contrast
 * ```
 *
 * 动画是两个**方向相反**的位移:sweep 从 `translate(-50%)` 到 `translate(125%)`,
 * highlight 从 `translate(50%)` 到 `translate(-125%)`。两者相消,于是高亮副本在
 * 视觉上原地不动,而 mask 那条亮带扫过它 —— 这样才做得到"只有笔画被照亮"
 * 而不是整块背景在动。用单层 background-clip:text 的渐变做不出这个效果。
 *
 * 另外两个容易做错的点:
 * - 时序是 `steps(48, end)` 的 **1s 单次**(不是 infinite):Codex 的流光是
 *   一次一次"打拍子"扫过,不是连续流动。iteration-count 由 `Active` 类给。
 * - 颜色用 `!important` 压后代(`.codexadencedShimmer *`),所以内部即使有
 *   自己的 text 色也会被统一;highlight 子树再被压回 contrast 色。
 *
 * `active=false` 时结构保持不变、只是不加 `Active` 类 —— 与 Codex 一致
 * (它靠类而不是靠卸载节点来停):文字不会因为动画开关而重排。
 */
export function CadencedShimmer({
  active = true,
  children,
  className
}: {
  /** 是否正在打拍子。false 只去掉动画,结构不变 */
  active?: boolean
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cx(
        // 变量载体:必须同时挂,且要挂 thinkingShimmer 这一个(见上表)
        'codex-thinkingShimmer',
        'codex-cadencedShimmer',
        active && 'codex-cadencedShimmerActive',
        className
      )}
    >
      {children}
      <span aria-hidden="true" className="codex-cadencedShimmerSweep">
        {/* 高亮副本 —— aria-hidden,否则屏幕阅读器会把同一句话念两遍 */}
        <span className="codex-cadencedShimmerHighlight">{children}</span>
      </span>
    </span>
  )
}
