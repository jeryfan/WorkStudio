/**
 * 内容块的 React key。
 *
 * 单独成文件是因为这件事比看起来重要：key 一变，React 会卸载重建整块内容——
 * 正在播的流光重头开始、已展开的折叠收起、Monaco 实例销毁重建（代码块会闪一下
 * 白）。流式期间内容块每帧都在变，key 必须只跟"是哪一块"有关，不能跟内容有关。
 *
 * 有稳定 id 的用 id；没有 id 的（markdown、错误）用下标 —— 它们在一条回复里
 * 的位置是稳定的，内容块只追加不插队。
 */
import type { ChatContent } from './content'

export function contentKey(content: ChatContent, index: number): string {
  switch (content.kind) {
    case 'thinking':
    case 'progressMessage':
    case 'hook':
    case 'contextCompaction':
    case 'reviewMode':
      return `${content.kind}:${content.id}`
    case 'toolInvocation':
      return `tool:${content.invocation.id}`
    // 每条回复至多一个，且永远在末尾——用固定 key 让它在流式过程中不被重建，
    // 否则 shimmer 每帧都从头开始，看着像卡住
    case 'working':
      return 'working'
    default:
      return `${content.kind}:${index}`
  }
}
