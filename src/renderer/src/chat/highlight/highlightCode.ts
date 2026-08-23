import type { HLJSApi } from 'highlight.js'

/**
 * 代码高亮 —— 换掉 Monaco,改用 Codex 用的那套。
 *
 * Codex 的高亮在 `reverse/webview-dump/assets/highlight-code-bx-gqOKs.js`:
 * 它 import 一个 highlight.js core,`registerLanguage` 注册 **44 个语言**,
 * 然后导出
 *
 * ```js
 * function highlightCode(code, language) {
 *   if (language) { const {value} = hljs.highlight(code, {language}); return {code, html: value, language} }
 *   const {value, language: detected} = hljs.highlightAuto(code)
 *   return {code, html: value, language: detected}
 * }
 * function detectCodeLanguage(code, candidates) {
 *   const r = hljs.highlightAuto(code, [...candidates])
 *   return { language: candidates.find(c => c === r.language), relevance: r.relevance }
 * }
 * ```
 *
 * 产出的是带 `.hljs-*` 类的 HTML —— 那批配色规则**早就在**
 * `assets/codex/highlight.css` 里(提取器从 Codex 产物生成,与外壳同源),
 * 在此之前一直是死代码。
 *
 * ## 为什么值得换掉 Monaco
 *
 * - Monaco 是编辑器,代码块只是**只读展示**;为它引 6.6MB 依赖不划算
 * - Monaco 自带一整套 codicon 字体与 DOM(上一轮清 `.codicon` 时,
 *   控制台里剩下的那些规则全是它注入的)
 * - 最要紧的是**流式**:Monaco 每次 `setValue` 要重建 token,而 Codex 的做法
 *   是"已高亮的部分 + 未高亮的尾巴按纯文本渲染"(见 CodeBlockPart),
 *   在围栏还没闭合时也不会闪
 *
 * ## 语言按需加载
 *
 * 44 个语言全静态 import 会把 ~400KB 打进主包,而一条对话未必有代码块。
 * 这里与 `shiki/langs.ts` 同一个约定:**静态的 `import()` 字面量**,
 * Vite 才能把每个语法包切成独立 chunk(拼接出来的动态路径会被整包吞进主包)。
 */

/** Codex 的 `highlightLanguages` —— 逐字照抄那 44 个键 */
const LANGUAGE_LOADERS = {
  arduino: () => import('highlight.js/lib/languages/arduino'),
  bash: () => import('highlight.js/lib/languages/bash'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  css: () => import('highlight.js/lib/languages/css'),
  diff: () => import('highlight.js/lib/languages/diff'),
  dockerfile: () => import('highlight.js/lib/languages/dockerfile'),
  dos: () => import('highlight.js/lib/languages/dos'),
  go: () => import('highlight.js/lib/languages/go'),
  graphql: () => import('highlight.js/lib/languages/graphql'),
  ini: () => import('highlight.js/lib/languages/ini'),
  java: () => import('highlight.js/lib/languages/java'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  json: () => import('highlight.js/lib/languages/json'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  latex: () => import('highlight.js/lib/languages/latex'),
  less: () => import('highlight.js/lib/languages/less'),
  lua: () => import('highlight.js/lib/languages/lua'),
  makefile: () => import('highlight.js/lib/languages/makefile'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  mathematica: () => import('highlight.js/lib/languages/mathematica'),
  matlab: () => import('highlight.js/lib/languages/matlab'),
  nginx: () => import('highlight.js/lib/languages/nginx'),
  objectivec: () => import('highlight.js/lib/languages/objectivec'),
  perl: () => import('highlight.js/lib/languages/perl'),
  pgsql: () => import('highlight.js/lib/languages/pgsql'),
  php: () => import('highlight.js/lib/languages/php'),
  'php-template': () => import('highlight.js/lib/languages/php-template'),
  plaintext: () => import('highlight.js/lib/languages/plaintext'),
  powershell: () => import('highlight.js/lib/languages/powershell'),
  python: () => import('highlight.js/lib/languages/python'),
  'python-repl': () => import('highlight.js/lib/languages/python-repl'),
  r: () => import('highlight.js/lib/languages/r'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  rust: () => import('highlight.js/lib/languages/rust'),
  scss: () => import('highlight.js/lib/languages/scss'),
  shell: () => import('highlight.js/lib/languages/shell'),
  sql: () => import('highlight.js/lib/languages/sql'),
  swift: () => import('highlight.js/lib/languages/swift'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  vbnet: () => import('highlight.js/lib/languages/vbnet'),
  wasm: () => import('highlight.js/lib/languages/wasm'),
  xml: () => import('highlight.js/lib/languages/xml'),
  yaml: () => import('highlight.js/lib/languages/yaml')
} as const

export type HighlightLanguage = keyof typeof LANGUAGE_LOADERS

/** Codex 的 `highlightLanguageAliases` —— 只有这一条 */
const ALIASES: Record<string, HighlightLanguage> = {
  wolfram: 'mathematica'
}

/**
 * 围栏语言名 → 注册表里的键。
 *
 * highlight.js 自己也认一批别名(`js` → javascript 之类),但那要等语言**加载后**
 * 才生效,而这里需要在加载**之前**就知道该拉哪个包,所以常见写法要自己映一层。
 */
const FENCE_ALIASES: Record<string, HighlightLanguage> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  sh: 'bash',
  zsh: 'bash',
  console: 'shell',
  shellsession: 'shell',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  yml: 'yaml',
  html: 'xml',
  svg: 'xml',
  vue: 'xml',
  'c++': 'cpp',
  'objective-c': 'objectivec',
  cs: 'csharp',
  ps1: 'powershell',
  docker: 'dockerfile',
  bat: 'dos',
  cmd: 'dos',
  text: 'plaintext',
  txt: 'plaintext',
  tex: 'latex',
  patch: 'diff',
  ...ALIASES
}

export function resolveHighlightLanguage(
  hint: string | null | undefined
): HighlightLanguage | null {
  if (!hint) return null
  const key = hint.trim().toLowerCase()
  if (key in LANGUAGE_LOADERS) return key as HighlightLanguage
  return FENCE_ALIASES[key] ?? null
}

let corePromise: Promise<HLJSApi> | null = null
const registered = new Set<string>()

async function core(): Promise<HLJSApi> {
  corePromise ??= import('highlight.js/lib/core').then((m) => m.default)
  return corePromise
}

/** 结果形状与 Codex 的 `highlightCode` 一致 */
export interface HighlightResult {
  /** 被高亮的**原文**。流式时用它判断缓存还能不能用(见 CodeBlockPart) */
  code: string
  /** 带 `.hljs-*` 类的 HTML */
  html: string
  language: string | null
}

/**
 * 高亮一段代码。
 *
 * 与 Codex 的一处**刻意差异**:它在没有语言时走 `highlightAuto`(自动识别),
 * 那要求 44 个语言**全部**已注册 —— 按需加载就没法自动识别了。
 * 这里没有语言时直接按纯文本转义返回。代价:围栏不写语言的代码块没有配色。
 * 收益:主包不背 44 个语法包。真要自动识别,得先把全部语言拉下来,
 * 那等于放弃按需加载。
 */
export async function highlightCode(
  code: string,
  language: HighlightLanguage | null
): Promise<HighlightResult> {
  if (language == null) return { code, html: escapeHtml(code), language: null }
  const hljs = await core()
  if (!registered.has(language)) {
    const mod = (await LANGUAGE_LOADERS[language]()) as { default: never }
    // 同一语言可能被并发拉两次,registerLanguage 幂等,再判一次省掉重复注册
    if (!registered.has(language)) {
      hljs.registerLanguage(language, mod.default)
      registered.add(language)
    }
  }
  try {
    const { value } = hljs.highlight(code, { language, ignoreIllegals: true })
    return { code, html: value, language }
  } catch {
    // 语言包与内容不匹配时 hljs 会抛;退回纯文本比整块消失好
    return { code, html: escapeHtml(code), language: null }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
