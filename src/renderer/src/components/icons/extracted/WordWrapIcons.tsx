import type { IconProps } from '../types'

/** Codex `xaa` —— word wrap 已开启态的图标(折行箭头) */
export function WordWrapEnabledIcon({
  className,
  'aria-hidden': ariaHidden
}: IconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      aria-hidden={ariaHidden}
      width="21"
      height="21"
      viewBox="0 0 21 21"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15.672 2.668c.367 0 .665.298.665.665l-.002 13.333a.665.665 0 0 1-1.33 0l.002-13.333c0-.367.298-.665.665-.665ZM9.586 6.002a3.582 3.582 0 0 1 0 7.163H5.777l.949.948a.665.665 0 1 1-.94.94l-2.084-2.082a.667.667 0 0 1 0-.94l2.083-2.085a.666.666 0 0 1 .94.942l-.947.947h3.808a2.251 2.251 0 0 0 0-4.503H4.169a.666.666 0 0 1 0-1.33h5.417Z"
        fill="currentColor"
      />
    </svg>
  )
}

/** Codex `vaa` —— word wrap 未开启态的图标 */
export function WordWrapDisabledIcon({
  className,
  'aria-hidden': ariaHidden
}: IconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      aria-hidden={ariaHidden}
      width="21"
      height="21"
      viewBox="0 0 21 21"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10.33 12.668c.367 0 .665.298.665.665l.002 3.333a.665.665 0 0 1-1.33.001l-.002-3.334c0-.367.298-.665.665-.665Zm3.364-5.639a.665.665 0 0 1 .94 0l2.5 2.5c.26.26.26.682 0 .942l-2.5 2.5a.666.666 0 0 1-.94-.942l1.365-1.364H3.33a.665.665 0 1 1 0-1.33h11.728l-1.365-1.364a.666.666 0 0 1 0-.942ZM10.33 2.668c.367 0 .665.298.665.665l.002 3.333a.665.665 0 0 1-1.33.001l-.002-3.334c0-.367.298-.665.665-.665Z"
        fill="currentColor"
      />
    </svg>
  )
}
