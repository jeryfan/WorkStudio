export interface IconProps {
  className?: string
  /**
   * 会话里的图标一律是装饰性的:语义由旁边的文字承担,读屏器不该念它。
   *
   * Codex 的图标组件是 `(e) => <svg {...e}/>`,任意 SVG 属性都能透传,所以它的
   * 调用点写的是 `<Icon aria-hidden={!0} className="icon-xs shrink-0 …"/>`。
   * 这里没有把 92 个图标全改成透传(改动面太大),只把实际用到的这一个属性
   * 加进契约 —— 用到的图标自己把它落到 `<svg>` 上。
   */
  'aria-hidden'?: boolean | 'true' | 'false'
}
