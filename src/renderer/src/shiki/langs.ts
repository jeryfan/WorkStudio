/**
 * shiki 语法包的按需加载表。
 *
 * 对话代码块与文件面板共用同一张表：两边的键空间不同（一个是围栏语言名
 * ```ts，一个是文件扩展名 .ts），但要加载的语法包是同一批。分成两份维护的
 * 结果一定是某一边先支持了新语言、另一边没有。
 *
 * 用静态的 `import()` 字面量而不是模板拼接，Vite 才能把每个语法包切成
 * 独立 chunk；拼接出来的动态路径会被打进主包，几百个语法包一次性加载。
 */

/** 语言 id → 语法包。key 就是 shiki 的 language id */
export const LANG_LOADERS = {
  bash: () => import('@shikijs/langs/bash'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  css: () => import('@shikijs/langs/css'),
  dart: () => import('@shikijs/langs/dart'),
  diff: () => import('@shikijs/langs/diff'),
  docker: () => import('@shikijs/langs/docker'),
  go: () => import('@shikijs/langs/go'),
  graphql: () => import('@shikijs/langs/graphql'),
  html: () => import('@shikijs/langs/html'),
  ini: () => import('@shikijs/langs/ini'),
  java: () => import('@shikijs/langs/java'),
  javascript: () => import('@shikijs/langs/javascript'),
  jsx: () => import('@shikijs/langs/jsx'),
  json: () => import('@shikijs/langs/json'),
  jsonc: () => import('@shikijs/langs/jsonc'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  lua: () => import('@shikijs/langs/lua'),
  make: () => import('@shikijs/langs/make'),
  markdown: () => import('@shikijs/langs/markdown'),
  'objective-c': () => import('@shikijs/langs/objective-c'),
  php: () => import('@shikijs/langs/php'),
  powershell: () => import('@shikijs/langs/powershell'),
  proto: () => import('@shikijs/langs/proto'),
  python: () => import('@shikijs/langs/python'),
  ruby: () => import('@shikijs/langs/ruby'),
  rust: () => import('@shikijs/langs/rust'),
  scss: () => import('@shikijs/langs/scss'),
  shellscript: () => import('@shikijs/langs/shellscript'),
  sql: () => import('@shikijs/langs/sql'),
  svelte: () => import('@shikijs/langs/svelte'),
  swift: () => import('@shikijs/langs/swift'),
  toml: () => import('@shikijs/langs/toml'),
  tsx: () => import('@shikijs/langs/tsx'),
  typescript: () => import('@shikijs/langs/typescript'),
  vue: () => import('@shikijs/langs/vue'),
  xml: () => import('@shikijs/langs/xml'),
  yaml: () => import('@shikijs/langs/yaml')
} as const

export type ShikiLang = keyof typeof LANG_LOADERS

/**
 * 别名 → 语言 id。
 *
 * 同时覆盖两种来源：代码围栏写的语言名（`ts`、`sh`、`c++`）和文件扩展名
 * （`.mjs`、`.zsh`、`.h`）。两者大量重合，所以合成一张表。
 */
const ALIASES: Record<string, ShikiLang> = {
  // JS / TS
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  node: 'javascript',
  // Shell
  sh: 'shellscript',
  zsh: 'shellscript',
  shell: 'shellscript',
  console: 'shellscript',
  // C 家族
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  h: 'c',
  'c#': 'csharp',
  cs: 'csharp',
  // 其他常见简写
  py: 'python',
  rs: 'rust',
  rb: 'ruby',
  kt: 'kotlin',
  yml: 'yaml',
  md: 'markdown',
  mdx: 'markdown',
  htm: 'html',
  dockerfile: 'docker',
  makefile: 'make',
  ps1: 'powershell',
  protobuf: 'proto',
  patch: 'diff',
  objc: 'objective-c',
  m: 'objective-c'
}

/**
 * 把围栏语言名或文件扩展名归一到语言 id；不认识的返回 null。
 *
 * 返回 null 时调用方应当退回纯文本渲染——猜一个语言比不高亮更糟：
 * 错误的语法着色会把普通文本染成关键字色，读起来比灰底纯文本更费劲。
 */
export function resolveLang(hint: string | null | undefined): ShikiLang | null {
  if (!hint) return null
  const key = hint.trim().toLowerCase()
  if (!key) return null
  if (key in LANG_LOADERS) return key as ShikiLang
  return ALIASES[key] ?? null
}
