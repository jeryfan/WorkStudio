/**
 * 条件类名拼接 —— 与 Codex 产物里的 `$(...)` helper 同语义:
 * 丢掉 falsy 项(false / undefined / null / ''),其余用单空格连接。
 *
 * Codex 用的应该是 clsx;这里不引依赖,因为只需要这一个语义,
 * 而且 clsx 的对象/数组形态在 Codex 的调用点里没出现过 —— 全是
 * `$('base', cond && 'a', cond2 ? 'b' : 'c')` 这种平铺形式。
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
