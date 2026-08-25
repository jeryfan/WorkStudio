import { LeftPanelFrame } from '../../sidebar/LeftPanelFrame'
import { SettingsNav } from './SettingsNav'

/**
 * 设置路由的左栏 —— Codex `_$c`（导出名 `Ya`）在 app-shell 分支下的形态。
 *
 * Codex 那一支逐字是：
 *
 *   <AppShell.Root>
 *     <AppShell.LeftPanel>
 *       <div className="flex h-full min-h-0 flex-col overflow-hidden [&>nav]:pt-2">
 *         {sidebar}
 *       </div>
 *     </AppShell.LeftPanel>
 *     <MainSurface …>{children}</MainSurface>
 *   </AppShell.Root>
 *
 * `AppShell.LeftPanel` 是个**插槽标记组件**（它的实现就是 `() => null`，
 * 内容由 `AppShell.Root` 提取后交给 app shell 的 left panel 组件 `yJr`）。
 * 也就是说设置路由用的是**同一个 app shell、同一个左栏外壳**，只把外壳里的
 * children 从聊天侧栏换成设置导航 —— 宽度、折叠、拖拽手柄全部共用。
 *
 * `[&>nav]:pt-2` 是给设置 nav 的顶部留白（聊天侧栏那套自己有 header，
 * 不需要它），不要移到 nav 自己身上：Codex 写在外层，nav 换成别的元素时
 * 这条就自然失效，是有意的。
 */
export function SettingsLeftPanel({
  width,
  onResize,
  activeSection,
  onSelect,
  onBack
}: {
  width: number
  onResize(desired: number): void
  activeSection: string
  onSelect(slug: string): void
  onBack(): void
}): React.JSX.Element {
  return (
    <LeftPanelFrame width={width} onResize={onResize}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden [&>nav]:pt-2">
        <SettingsNav activeSection={activeSection} onSelect={onSelect} onBack={onBack} />
      </div>
    </LeftPanelFrame>
  )
}
