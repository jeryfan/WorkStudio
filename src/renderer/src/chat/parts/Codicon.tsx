/**
 * codicon 图标。
 *
 * VSCode 的图标是字体而不是 SVG，移植过来的 CSS 里直接写着
 * `.codicon.codicon-chevron-down` 这类选择器，所以这里也必须产出同样的类名，
 * 否则那些规则会全部落空。
 */

export function Codicon({
  name,
  className,
  spin = false
}: {
  /** 图标名，不含 `codicon-` 前缀 */
  name: string
  className?: string
  spin?: boolean
}): React.JSX.Element {
  return (
    <span
      // aria-hidden：图标一律是装饰性的，语义由旁边的文字承担。
      // 不这么标，屏幕阅读器会把字体图标的私有区码点念成乱码。
      aria-hidden="true"
      className={['codicon', `codicon-${name}`, spin ? 'codicon-modifier-spin' : null, className]
        .filter(Boolean)
        .join(' ')}
    />
  )
}
