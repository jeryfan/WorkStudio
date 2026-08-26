import { use } from 'react'
import { AppRoutes } from './AppRoutes'
import {
  AccessibilityAnnouncerHead,
  AccessibilityAnnouncerTail
} from './components/overlay/AppPortals'
import { SettingsPreloadGate } from './components/settings/SettingsPreloadGate'
import { AuthProvider } from './state/AuthContext'

/**
 * Codex 的 `#root` 里是三个子元素:两个 a11y announcer span 夹着应用本体。
 * 这层薄壳存在的唯一理由就是复刻那个结构 —— announcer 必须在 #root 内、
 * 且在应用本体前后各一个(屏幕阅读器按 DOM 顺序读 aria-live 区域)。
 *
 * ── 提供者链（对齐 Codex `ojl` 的返回值）───────────────────────────────────
 * 上游是
 *   PersistedStateProvider(iOl)          ← 等宿主回 persisted-atom-sync
 *   └ BAl
 *     ├ announcer ×2                     ← 与 gate 同级，先于它
 *     └ SettingsPreloadGate(vEl)         ← 等 get-settings 首份快照
 *       └ …CodexStatsigProvider…         ← 遥测/实验，本项目没有
 *         └ 路由
 * 本项目对应
 *   Suspense(startupReady)               ← 在 main.tsx，等宿主 startup 服务
 *   ├ announcer ×2
 *   └ SettingsPreloadGate
 *     └ AuthProvider → AppRoutes
 *
 * 两处不同都有理由：
 * - 没有 `PersistedStateProvider`：本项目没有跨窗口的 persisted atom 同步，
 *   宿主也不会发 `persisted-atom-sync`。等一个永远不来的消息只能等超时。
 * - 没有 statsig：遥测本身没有搬（见 AgentServerHost 里
 *   `--analytics-default-enabled` 那段说明）。
 *
 * `startupReady` 由 `use()` 消费 —— **必须在这里 use、不能在 main.tsx await**：
 * await 会让 `root.render` 整个延后，那期间 React 一行都没渲染，屏幕上是
 * index.html 的静态闪屏；`use()` 则是 React 自己挂起，fallback 由 Suspense 给，
 * 之后的每一层门禁都能接着用同一个视觉。Codex 就是 `use(startupReady)`。
 */
function App({ startupReady }: { startupReady?: Promise<void> }): React.JSX.Element {
  if (startupReady != null) use(startupReady)
  return (
    <>
      <AccessibilityAnnouncerHead />
      <SettingsPreloadGate>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </SettingsPreloadGate>
      <AccessibilityAnnouncerTail />
    </>
  )
}

export default App
