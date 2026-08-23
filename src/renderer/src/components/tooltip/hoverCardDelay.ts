/**
 * 「立即打开」的空间规则 —— Codex 的 `bjc` + `kjc`。
 *
 * 指针落进带 `data-hover-card-open-immediately` 的子树时,悬浮卡片的开启
 * 延迟直接归 0:侧栏把这个标记挂在会话行的操作区与状态槽上,鼠标已经精确
 * 停在那些 20×20 的小图标上了,再等 700ms 是多余的。
 *
 * 单独一个文件是为了 react-refresh —— 组件文件里混着导出普通函数会让热更失效。
 */
export const HOVER_CARD_OPEN_IMMEDIATELY_SELECTOR = '[data-hover-card-open-immediately]'

export function hoverCardOpensImmediately(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(HOVER_CARD_OPEN_IMMEDIATELY_SELECTOR) != null
}
