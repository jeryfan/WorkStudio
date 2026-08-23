import type { ReactNode } from 'react'
import { cx } from '../../utils/cx'

/**
 * Composer 里所有下拉/胶囊按钮的**统一内容层** —— Codex 用一个 CSS Module
 * (`[wvw0x]` 组)承载,6 个类共同构成:
 *
 *   span.codex-ComposerDropdownLabel [data-composer-dropdown-foreground]
 *   ├ span.codex-ComposerDropdownLabelIcon            ← 图标槽
 *   ├ span.codex-ComposerDropdownLabelText            ← 文本槽
 *   │ └ span.codex-ComposerFooterLabel.codex-ComposerDropdownLabelValue
 *   │     [data-composer-footer-collapse]             ← 折叠优先级
 *   │   └ span.codex-ComposerDropdownLabelValueContent [data-tooltip-overflow-target]
 *   └ span.codex-ComposerDropdownLabelSecondaryChevron ← 次级 chevron(可选)
 *     └ svg.codex-ComposerDropdownLabelChevron
 *
 * 两个 data 属性是这套东西的灵魂,不能省:
 *
 * - `data-composer-dropdown-foreground` = primary | tertiary | warning
 *   决定前景色。**不是**在按钮上写 text-* 类 —— Codex 靠这个属性 + 模块 CSS 统一控制。
 * - `data-composer-footer-collapse` = none | xs | sm
 *   工具条变窄时的**折叠优先级**:`xs` 先消失,`sm` 次之,`none` 永不折叠。
 *   这是 `[data-composer-footer-responsive]` 容器查询的配合项,
 *   少了它窄窗口下所有标签一起挤成一团。
 */
export type ComposerDropdownForeground = 'primary' | 'tertiary' | 'warning'
export type ComposerFooterCollapse = 'none' | 'xs' | 'sm'

export function ComposerDropdownLabel({
  foreground = 'primary',
  collapse = 'xs',
  icon,
  children,
  valueClassName,
  chevron,
  secondaryChevron
}: {
  foreground?: ComposerDropdownForeground
  collapse?: ComposerFooterCollapse
  icon?: ReactNode
  children: ReactNode
  /** 额外挂到 value 层的类(Codex 在不同调用点给 max-w-40 / !max-w-60 / text-sm) */
  valueClassName?: string
  /**
   * 尾部 chevron。Codex 三种调用形态实测各不相同,别统一:
   * - 项目选择器:**没有** chevron
   * - 运行位置:**裸 svg**.codex-ComposerDropdownLabelChevron(直接是 label 的子元素)
   * - 分支:svg 外面包一层 span.codex-ComposerDropdownLabelSecondaryChevron
   * 所以这里分成两个 prop,由调用方选。
   */
  chevron?: ReactNode
  secondaryChevron?: ReactNode
}): React.JSX.Element {
  return (
    <span className="codex-ComposerDropdownLabel" data-composer-dropdown-foreground={foreground}>
      {icon && <span className="codex-ComposerDropdownLabelIcon">{icon}</span>}
      <span className="codex-ComposerDropdownLabelText">
        <span
          className={cx(
            'codex-ComposerFooterLabel codex-ComposerDropdownLabelValue',
            valueClassName
          )}
          data-composer-footer-collapse={collapse}
        >
          <span
            className="codex-ComposerDropdownLabelValueContent"
            data-tooltip-overflow-target="true"
          >
            {children}
          </span>
        </span>
      </span>
      {chevron}
      {secondaryChevron && (
        <span className="codex-ComposerDropdownLabelSecondaryChevron">{secondaryChevron}</span>
      )}
    </span>
  )
}

/**
 * Composer 按钮基类 —— Codex 全站图标/胶囊按钮共用的那串,
 * 加上 composer 特有的 `h-token-button-composer-sm` 高度。
 * 抽出来是因为它在 composer 里出现 6 次,逐处复制会漂。
 */
export const COMPOSER_BUTTON_BASE =
  'no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-full text-token-text-tertiary enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent'
