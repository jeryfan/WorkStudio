import { AppShell } from './components/layout/AppShell'
import {
  AccessibilityAnnouncerHead,
  AccessibilityAnnouncerTail
} from './components/overlay/AppPortals'

/**
 * Codex 的 `#root` 里是三个子元素:两个 a11y announcer span 夹着应用本体。
 * 这层薄壳存在的唯一理由就是复刻那个结构 —— announcer 必须在 #root 内、
 * 且在应用本体前后各一个(屏幕阅读器按 DOM 顺序读 aria-live 区域)。
 */
function App(): React.JSX.Element {
  return (
    <>
      <AccessibilityAnnouncerHead />
      <AppShell />
      <AccessibilityAnnouncerTail />
    </>
  )
}

export default App
