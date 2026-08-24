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
    case 'hook':
    case 'contextCompaction':
    case 'reviewMode':
      return `${content.kind}:${content.id}`
    case 'toolInvocation':
      return `tool:${content.invocation.id}`
    default:
      return `${content.kind}:${index}`
  }
}
