import type { ReactNode } from 'react'
import { useSettingsLoaded } from '../../state/settingsStore'
import { LoadingIndicator } from '../loading/LoadingIndicator'

/**
 * 设置预载门禁 —— Codex `vEl`（app-initial:20537087）。
 *
 * ```js
 * function vEl({children}) {
 *   if (V8e()) return <X3 debugName="SettingsPreloadGate"/>   // V8e = get-settings 的 isLoading
 *   return <>{children}</>
 * }
 * ```
 *
 * 它在 Codex 的提供者链里紧跟在 `PersistedStateProvider` 之后、所有业务提供者
 * 之前，位置不是随意的：主题、缩放、reduced-motion 这些都从设置读，先渲染再补
 * 会让首帧用错值然后跳一下（本项目实测过一次：`--padding-row-y` 用默认值时
 * 全应用每行高 2px）。
 *
 * `<X3 debugName>` 就是 `LoadingIndicator` 的那一档：整屏 + 顶部拖拽带 + 56px
 * blossom 流光 —— 与 index.html 的闪屏同一个视觉，所以这一段等待接在启动闪屏
 * 后面是无缝的。
 */
export function SettingsPreloadGate({ children }: { children: ReactNode }): React.JSX.Element {
  if (!useSettingsLoaded()) return <LoadingIndicator debugName="SettingsPreloadGate" />
  return <>{children}</>
}
