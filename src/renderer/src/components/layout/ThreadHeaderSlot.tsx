import { useState } from 'react'
import { useChatRuntime } from '../../state/ChatRuntimeContext'
import { useWorkspace } from '../../state/WorkspaceContext'
import { HoverCardTitle } from '../sidebar/HoverCardParts'
import { AppShellSlots } from './appShellSlots'
import { ThreadHeaderContent } from './ThreadHeaderContent'
import { ThreadOverflowMenu } from './ThreadOverflowMenu'

/**
 * thread 路由往 app shell header 注册的内容 —— Codex 的
 * `local-conversation-page` 里那段 `jr.Header > ai(...)`：
 *
 *   $P.Header
 *   └ Lsc({ start: <span…>{ut(可改名标题)}</span>, startActions: <…三点菜单…>, … })
 *
 * Codex 的 `start` 是 `span.inline-flex.max-w-[320px].min-w-[2ch].items-center
 * .overflow-hidden.text-token-foreground.focus-within:overflow-visible` 包着
 * `ut`（= 可改名标题 `WNc`，本项目的 `HoverCardTitle` 就是它）。
 * `startActions` 是一个 fragment：[状态 chip, 计划任务按钮, div.flex.items-center.gap-2.no-drag > 三点菜单]。
 * 前两项本项目没有对应能力（thread 状态 chip 与 automations 都未接），只留三点菜单那一格。
 *
 * 注册的节点必须是**引用稳定**的元素，所以这里导出的是常量元素
 * `THREAD_HEADER_SLOT`：一切动态都在组件内部读 context，避免
 * 「每次渲染都是新元素 → 重新注册 → 再渲染」的循环。
 */
function ThreadHeaderSlot(): React.JSX.Element | null {
  const { activeChatId } = useChatRuntime()
  const { chats, renameChat } = useWorkspace()
  /** 三点菜单的 "Rename chat" 把标题切进编辑态（见 ThreadOverflowMenu 的说明） */
  const [renaming, setRenaming] = useState(false)

  if (activeChatId == null) return null
  const chat = chats.find((c) => c.id === activeChatId)
  const title = chat?.title ?? ''

  return (
    <ThreadHeaderContent
      start={
        <span className="inline-flex max-w-[320px] min-w-[2ch] items-center overflow-hidden text-token-foreground focus-within:overflow-visible">
          <HoverCardTitle
            className="max-w-[320px]"
            title={title}
            titleValue={title}
            editing={renaming}
            onEditingChange={setRenaming}
            onRename={(next) => void renameChat(activeChatId, next)}
          />
        </span>
      }
      startActions={
        <div className="flex items-center gap-2 no-drag">
          <ThreadOverflowMenu chatId={activeChatId} onRenameRequest={() => setRenaming(true)} />
        </div>
      }
    />
  )
}

/** 引用稳定的注册节点（见上：不能每次渲染都换新元素） */
const THREAD_HEADER_SLOT = <ThreadHeaderSlot />

/** thread 视图挂这个：把标题 + 三点菜单注册进 header 中段 */
export function ThreadHeaderRegistration(): React.JSX.Element {
  return <AppShellSlots.Header>{THREAD_HEADER_SLOT}</AppShellSlots.Header>
}
