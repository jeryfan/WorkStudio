import { useState } from 'react'

/**
 * Codex 的 spinner —— bundle 里的 `$m`(容器 + 默认图标 `n5e`)。
 *
 * 逐项对齐:
 * - 容器 `div.animate-spin inline-flex h-fit w-fit items-center justify-center
 *   leading-none contain-layout contain-paint contain-style`。
 * - `animationDelay` = 挂载时刻的 `-${Date.now() % 1000}ms` —— 让一排 spinner
 *   错开相位,而不是齐刷刷同步转。
 * - `animationDurationMs` 由调用方给(侧栏状态槽是 2000ms),写成内联
 *   `animationDuration: '<ms>ms'`;不传就没有内联时长。
 * - 图标是 24×24 的双 path 圆弧(实心 path + 30% 透明底色环)。
 *
 * Codex 里还有 reduced-motion 时去掉 animate-spin 的分支(`Zm()`),WS 的
 * 全局样式已统一处理 reduced-motion,这里不重复。
 */
export function Spinner({
  className,
  animationDurationMs
}: {
  className?: string
  animationDurationMs?: number
}): React.JSX.Element {
  const [animationDelay] = useState(() => `-${Date.now() % 1000}ms`)
  return (
    <div
      className="animate-spin inline-flex h-fit w-fit items-center justify-center leading-none contain-layout contain-paint contain-style"
      style={{
        animationDelay,
        animationDuration: animationDurationMs == null ? undefined : `${animationDurationMs}ms`
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <path
          opacity={0.3}
          d="M18 12C18 8.68629 15.3137 6 12 6C8.68629 6 6 8.68629 6 12C6 15.3137 8.68629 18 12 18C15.3137 18 18 15.3137 18 12ZM20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12Z"
          fill="currentColor"
        />
        <path
          d="M12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12H6C6 15.3137 8.68629 18 12 18C15.3137 18 18 15.3137 18 12C18 8.68629 15.3137 6 12 6V4Z"
          fill="currentColor"
        />
      </svg>
    </div>
  )
}
