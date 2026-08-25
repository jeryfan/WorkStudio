import type {
  AppShellTabDescriptorInput,
  AppShellTabPanelController,
  AppShellTabRenderProps
} from '../../state/AppShellContext'
import { TerminalIcon } from '../icons'
import { TerminalTab } from './TerminalTab'

/**
 * Terminal tab 描述符。
 *
 * **tabId 是按会话固定的**（`terminal:<conversationId>`），不是随机 UUID ——
 * 与 browser tab 相反。理由是宿主侧的复用键就是 `(ownerId, conversationId)`：
 * 一个会话在一个窗口里只有一个终端会话，tabId 随机化会让"再开一次终端"变成
 * 开一个新 tab 却 attach 到同一个 pty，两个 tab 抢同一份输出。
 */

/** 终端没有需要持久化的渲染态（滚动位置在 xterm 自己的 buffer 里） */
export type TerminalTabState = Record<string, never>

export interface TerminalTabRenderProps extends AppShellTabRenderProps<TerminalTabState> {
  /** 宿主按它复用终端会话 */
  conversationId: string
  /** 首次创建时的工作目录；null 交给宿主决定 */
  cwd: string | null
}

export function terminalTabId(conversationId: string): string {
  return `terminal:${conversationId}`
}

export function createTerminalTabDescriptor(params: {
  conversationId: string
  cwd: string | null
}): AppShellTabDescriptorInput<TerminalTabState> {
  return {
    tabId: terminalTabId(params.conversationId),
    title: 'Terminal',
    icon: <TerminalIcon className="size-full" />,
    defaultState: () => ({}) as TerminalTabState,
    /*
     * 关 tab 时不通知宿主关会话。
     * Codex 的终端会话生命周期由 `preserveOnOwnerDestroy` 与窗口销毁决定，
     * 关一个 tab 不等于结束正在跑的进程 —— 用户关掉 tab 再开回来，构建还在跑。
     */
    renderPanel: (props) => (
      <TerminalTab {...props} conversationId={params.conversationId} cwd={params.cwd} />
    )
  }
}

/** launcher / 「+」菜单 / `toggleTerminal` 命令共用这一条 */
export function openTerminalTab(
  controller: AppShellTabPanelController,
  params: { conversationId: string; cwd: string | null }
): string {
  return controller.openTab(createTerminalTabDescriptor(params))
}
