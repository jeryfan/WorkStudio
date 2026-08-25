/**
 * 三个主题预览缩略图 —— 从 Codex 产物（general-settings 里的 `Er`/`kr`/`jr`）
 * 逐条 path 提取，fill 与 d 未作任何改动。
 *
 * 两点容易看错的地方：
 *
 * 1. **三张图本身都是灰阶稿**（`#fff` / `#dfdfdf` / `#f3f3f3` / `#393939` …），
 *    暗色那张也不是深色的。颜色是外层给的：预览容器带
 *    `background: <底色>`，图用 `mix-blend-luminosity` 只贡献明度。
 *    底色（Codex `Ma`）是
 *      dark   `#5d5d5d`
 *      light  `#f3f3f3`
 *      system `linear-gradient(90deg, #9f9f9f 0 50%, #5d5d5d 50% 100%)`
 *    所以千万别"顺手"把暗色稿改深 —— 混合模式会把它变成一团黑。
 *
 * 2. system 那张是左右各半明暗，靠一个 clipPath（`system-preview-sheet`）
 *    把两半裁成同一个圆角面板；light/dark 两张没有 clipPath。
 */

interface PreviewProps {
  className?: string
}

export function DarkThemePreview({ className }: PreviewProps): React.JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 120" className={className}>
      <path fill="#9f9f9f" d="M49 26h72a3 3 0 0 1 0 6H49a3 3 0 0 1 0-6Z" />
      <path fill="#8f8f8f" d="M28 35h114a2 2 0 0 1 0 4H28a2 2 0 0 1 0-4Z" />
      <path fill="#fff" d="M15 52a8 8 0 0 1 8-8h124a8 8 0 0 1 8 8v68H15V52Z" />
      <path fill="#dfdfdf" d="M22 59a3 3 0 0 1 3-3h39a3 3 0 0 1 0 6H25a3 3 0 0 1-3-3Z" />
      <path fill="#f3f3f3" d="M22 67h65v2H22zM15 76h140v1H15z" />
      <path fill="#dfdfdf" d="M22 83a3 3 0 0 1 3-3h39a3 3 0 0 1 0 6H25a3 3 0 0 1-3-3Z" />
      <path fill="#f3f3f3" d="M22 91h65v2H22zM15 100h140v1H15z" />
      <path fill="#dfdfdf" d="M22 107a3 3 0 0 1 3-3h39a3 3 0 0 1 0 6H25a3 3 0 0 1-3-3Z" />
      <path fill="#f3f3f3" d="M22 115h65v2H22z" />
    </svg>
  )
}

export function LightThemePreview({ className }: PreviewProps): React.JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 120" className={className}>
      <path fill="#cdcdcd" d="M49 26h72a3 3 0 0 1 0 6H49a3 3 0 0 1 0-6Z" />
      <path fill="#dfdfdf" d="M28 35h114a2 2 0 0 1 0 4H28a2 2 0 0 1 0-4Z" />
      <path fill="#fff" d="M15 52a8 8 0 0 1 8-8h124a8 8 0 0 1 8 8v68H15V52Z" />
      <path fill="#dfdfdf" d="M22 59a3 3 0 0 1 3-3h39a3 3 0 0 1 0 6H25a3 3 0 0 1-3-3Z" />
      <path fill="#f3f3f3" d="M22 67h65v2H22zM15 76h140v1H15z" />
      <path fill="#dfdfdf" d="M22 83a3 3 0 0 1 3-3h39a3 3 0 0 1 0 6H25a3 3 0 0 1-3-3Z" />
      <path fill="#f3f3f3" d="M22 91h65v2H22zM15 100h140v1H15z" />
      <path fill="#dfdfdf" d="M22 107a3 3 0 0 1 3-3h39a3 3 0 0 1 0 6H25a3 3 0 0 1-3-3Z" />
      <path fill="#f3f3f3" d="M22 115h65v2H22z" />
    </svg>
  )
}

export function SystemThemePreview({ className }: PreviewProps): React.JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 120" className={className}>
      <defs>
        <clipPath id="system-preview-sheet">
          <path d="M7 42a8 8 0 0 1 8-8h140a8 8 0 0 1 8 8v78H7V42Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#system-preview-sheet)">
        <path fill="#f3f3f3" d="M7 34h78v86H7z" />
        <path fill="#393939" d="M85 34h78v86H85z" />
        <path fill="#cdcdcd" d="M73 59h12v6H73a3 3 0 0 1 0-6Z" />
        <path fill="#767676" d="M85 59h9a3 3 0 0 1 0 6h-9Z" />
        <path fill="#dfdfdf" d="M53 68h32v3H53z" />
        <path fill="#8f8f8f" d="M85 68h32v3H85z" />
        <path fill="#fff" d="M26 84a7 7 0 0 1 7-7h52v43H26V84Z" />
        <path fill="#4f4f4f" d="M85 77h52a7 7 0 0 1 7 7v36H85V77Z" />
        <path fill="#dfdfdf" d="M32 88a3 3 0 0 1 3-3h29a3 3 0 0 1 0 6H35a3 3 0 0 1-3-3Z" />
        <path fill="#767676" d="M103 88a3 3 0 0 1 3-3h29a3 3 0 0 1 0 6h-29a3 3 0 0 1-3-3Z" />
        <path fill="#f3f3f3" d="M32 96h53v2H32zM26 105h59v1H26z" />
        <path fill="#767676" d="M85 96h53v2H85zM85 105h59v1H85z" />
        <path fill="#dfdfdf" d="M32 114a3 3 0 0 1 3-3h29a3 3 0 0 1 0 6H35a3 3 0 0 1-3-3Z" />
        <path fill="#767676" d="M103 114a3 3 0 0 1 3-3h29a3 3 0 0 1 0 6h-29a3 3 0 0 1-3-3Z" />
      </g>
    </svg>
  )
}
