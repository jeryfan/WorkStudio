/**
 * 工具名的人话化 —— 逐字移植 Codex 的 `pf`(app-initial 源码 `FE` + `Xzn` 一族)。
 *
 * 用途:MCP/动态工具的显示名(`browser_navigate` → `Browser navigate`),
 * 以及组摘要里 MCP 来源的服务器名(`playwright` → `Playwright`)。
 *
 * 规则(与源码逐行对应):
 *
 * ```js
 * function FE(e, t = {}) {
 *   let n = t.style ?? 'title'
 *   return e.replace(/[_-]+/g, ' ').split(/\s+/).filter(Boolean)
 *     .map((e, i) => Xzn(e, i, n)).join(' ')
 * }
 * ```
 *
 * 每个词先过三张表,再按位置决定大小写:
 *
 * 1. **缩写表**(`$zn`):全大写命中就原样返回(`mcp` → `MCP`)。
 *    带复数:词尾是 `s` 时剥掉再查,命中返回 `Xxxs`(`apis` → `APIs`)。
 * 2. **品牌表**(`eBn`):小写命中返回表里的大小写(`github` → `GitHub`)。
 * 3. **位置规则**:title 档每个词首字母大写,但句中的小词(`tBn`)保持小写;
 *    sentence 档只有第一个词大写。
 */
const ACRONYMS = new Set([
  'GH',
  'IA',
  'MCP',
  'API',
  'CI',
  'CLI',
  'LLM',
  'PDF',
  'PR',
  'UI',
  'URL',
  'SQL',
  'TW',
  'GPU',
  'CPU'
])

const BRANDS = new Map([
  ['openai', 'OpenAI'],
  ['openaideveloperdocs', 'OpenAI Developer Docs'],
  ['openapi', 'OpenAPI'],
  ['github', 'GitHub'],
  ['pagerduty', 'PagerDuty'],
  ['datadog', 'DataDog'],
  ['sharepoint', 'SharePoint'],
  ['sqlite', 'SQLite'],
  ['fastapi', 'FastAPI']
])

/** title 档里不句首时保持小写的词 */
const SMALL_WORDS = new Set(['and', 'or', 'to', 'up', 'with'])

/** Codex 的 `Zzn` —— 缩写表查询,含复数形式 */
function acronym(word: string): string | null {
  const upper = word.toUpperCase()
  if (ACRONYMS.has(upper)) return upper
  if (!word.toLowerCase().endsWith('s')) return null
  const singular = word.slice(0, -1).toUpperCase()
  return ACRONYMS.has(singular) ? `${singular}s` : null
}

/** Codex 的 `Qzn` */
function capitalize(word: string): string {
  return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`
}

/** Codex 的 `Xzn` */
function wordAt(word: string, index: number, style: 'title' | 'sentence'): string {
  const fixed = acronym(word)
  if (fixed != null) return fixed
  const lower = word.toLowerCase()
  const brand = BRANDS.get(lower)
  if (brand != null) return brand
  if (style === 'title') {
    return index > 0 && SMALL_WORDS.has(lower) ? lower : capitalize(lower)
  }
  return index === 0 ? capitalize(lower) : lower
}

/**
 * Codex 的 `FE`/`pf`。
 *
 * - `style: 'title'`(默认):`playwright` → `Playwright`,`mcp server` → `MCP Server`
 * - `style: 'sentence'`:`browser_navigate` → `Browser navigate`
 */
export function humanizeToolName(
  name: string,
  { style = 'title' }: { style?: 'title' | 'sentence' } = {}
): string {
  return name
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w, i) => wordAt(w, i, style))
    .join(' ')
}
