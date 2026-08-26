import { CODEX_CLASS } from '../../assets/codex/class-map'
import { BlossomIcon } from '../icons/BlossomIcon'
import { BLOSSOM_MASK_URL } from '../icons/blossomMask'
import { cx } from '../../utils/cx'
import type { IconProps } from '../icons/types'

/**
 * blossom 流光 —— Codex `Uir`(app-initial:5721743),CSS Module 哈希 `174ad`。
 *
 * 结构是两层叠一起,**同一个标记画两遍**:
 *
 *   div[aria-hidden].Root            ← inline-flex,持有 --openai-blossom-shimmer-* 五个变量
 *   ├ svg.Base                       ← 实色底(亮色 24% / 暗色 68% 前景)
 *   └ div.Overlay                    ← 112° 高光渐变,用同一个标记做 mask-image
 *
 * 流光是 Overlay 的 `background-position` 从 140% 扫到 -105%,
 * `2.2s cubic-bezier(.4,0,.2,1) infinite`;`prefers-reduced-motion` 下停掉。
 * 亮暗两套色由 CSS 里的 `--lightningcss-light/dark` 变量切换,组件不管。
 *
 * mask 的四个属性写在**内联 style** 里(Codex 同),因为 mask-image 是运行时
 * 拼出来的 data URI;Codex 连 `-webkit-` 前缀一起写,这里照搬。
 *
 * 尺寸靠外部类给(调用点一律 `size-14` = 56px),组件自己不设宽高。
 */
export function BlossomShimmer({
  className,
  Icon = BlossomIcon,
  maskUrl = BLOSSOM_MASK_URL
}: {
  className?: string
  /** 默认是 blossom 标记;Codex 留了这个口子换别的标记 */
  Icon?: (props: IconProps) => React.JSX.Element
  maskUrl?: string
}): React.JSX.Element {
  const mask = `url(${maskUrl})`
  return (
    <div aria-hidden="true" className={cx(CODEX_CLASS.Root_174ad, className)}>
      {/* Base 的类名在本项目的抽取里是唯一名,已改写成 `codex-Base`
          (Root / Overlay 与别的模块重名,只能保留哈希 —— 见 class-map.ts) */}
      <Icon className="codex-Base" />
      <div
        className={CODEX_CLASS.Overlay_174ad}
        style={{
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskSize: 'contain',
          maskSize: 'contain'
        }}
      />
    </div>
  )
}
