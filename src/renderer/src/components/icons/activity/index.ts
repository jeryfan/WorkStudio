/**
 * 会话活动行的图标 —— 由 scripts/extract-activity-icons.mjs 从 Codex 产物生成。
 * 不要手改:改了下次重跑会被覆盖。要换图标请改脚本里的映射表。
 *
 * 用法固定是 `<XxxIcon aria-hidden className="icon-xs shrink-0 text-token-conversation-body" />`
 * —— Codex 里这个类名串写死在 `Fg` 的常量 `Lg` 上,所有活动行图标共用。
 */
export { ActivityCompactionIcon } from './ActivityCompactionIcon'
export { ActivityInterruptedIcon } from './ActivityInterruptedIcon'
export { ActivityListFilesIcon } from './ActivityListFilesIcon'
export { ActivityPatchIcon } from './ActivityPatchIcon'
export { ActivityReadFileIcon } from './ActivityReadFileIcon'
export { ActivityStreamErrorIcon } from './ActivityStreamErrorIcon'
export { ActivitySystemErrorIcon } from './ActivitySystemErrorIcon'
export { ActivityTerminalIcon } from './ActivityTerminalIcon'
export { CircleCheckIcon } from './CircleCheckIcon'
export { CirclePendingIcon } from './CirclePendingIcon'
export { CircleXIcon } from './CircleXIcon'
export { RawOutputIcon } from './RawOutputIcon'
