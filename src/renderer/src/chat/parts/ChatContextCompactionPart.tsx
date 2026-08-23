import { ActivityCompactionIcon } from '../../components/icons'
import { ActivityHeaderRow } from './activity'
import { ACTIVITY_ICON_CLASS } from './tool/ToolActivityIcon'

/**
 * 上下文压缩 —— Codex **有**这个条目类型(`context-compaction`),而且它就是
 * 一条普通的活动行:
 *
 * ```
 * <ActivityHeaderRow icon={<CompactionIcon aria-hidden className="icon-xs shrink-0 text-token-conversation-body"/>}
 *                    summary={completed ? 'Context compacted' : 'Compacting context'} />
 * ```
 *
 * 文案 id 是 `localConversation.contextAutomaticallyCompacted` /
 * `contextAutomaticallyCompacting`(还有 `contextManually*` 两条,区分是自动
 * 还是用户手动触发的)。WS 的协议不区分,用自动那两句。
 *
 * 之前是自造的 `.chat-context-compaction`(一条带标签的细线),
 * 那是照 VS Code 的视觉语言编的 —— Codex 有真东西,换过来。
 */
export function ChatContextCompactionPart(): React.JSX.Element {
  return (
    <ActivityHeaderRow
      icon={<ActivityCompactionIcon aria-hidden className={ACTIVITY_ICON_CLASS} />}
      summary="Context compacted"
    />
  )
}
