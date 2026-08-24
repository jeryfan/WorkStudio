import { useSyncExternalStore } from 'react'

/**
 * 文件查看器全局偏好 —— Codex 的持久化 signal(`Th(key, false)`):
 * - word wrap:`wrapCodeDiff.2`(Codex `vB`;默认关)
 * - git blame:`fileSourceGitBlame`(Codex `mWi`;本构建被特性开关关掉,WS 未实现 blame,保留键位备用)
 *
 * 全局而非 per-tab:Codex 里这是作用域级 signal,所有文件 tab 共享。
 */

const WORD_WRAP_KEY = 'wrapCodeDiff.2'
/** markdown 代码块的 word wrap —— Codex 是另一个独立 atom(`Zpa` 里的 `Raa`),键名未能从产物确认 */
const CODE_BLOCK_WRAP_KEY = 'wrapCodeBlock'

function readBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

let wordWrap = readBool(WORD_WRAP_KEY)
let codeBlockWrap = readBool(CODE_BLOCK_WRAP_KEY)
const listeners = new Set<() => void>()

export function isWordWrapEnabled(): boolean {
  return wordWrap
}

export function toggleWordWrap(): void {
  wordWrap = !wordWrap
  try {
    localStorage.setItem(WORD_WRAP_KEY, String(wordWrap))
  } catch {
    /* 静默 */
  }
  listeners.forEach((l) => l())
}

export function isCodeBlockWrapEnabled(): boolean {
  return codeBlockWrap
}

export function toggleCodeBlockWrap(): void {
  codeBlockWrap = !codeBlockWrap
  try {
    localStorage.setItem(CODE_BLOCK_WRAP_KEY, String(codeBlockWrap))
  } catch {
    /* 静默 */
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useWordWrap(): boolean {
  return useSyncExternalStore(subscribe, isWordWrapEnabled)
}

/** markdown 代码块的 word wrap(Codex 的 `user-controlled` 档) */
export function useCodeBlockWrap(): boolean {
  return useSyncExternalStore(subscribe, isCodeBlockWrapEnabled)
}
