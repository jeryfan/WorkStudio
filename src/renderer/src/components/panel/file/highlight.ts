import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

/**
 * shiki 高亮 —— 按需加载语言包（JavaScript 正则引擎，无需 WASM）。
 * 主题色值对应 panel/1.html 的 --syn-key/str/comment/purple/punct。
 */
const panelTheme = {
  name: 'panel-light',
  type: 'light' as const,
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#24292f'
  },
  tokenColors: [
    {
      scope: [
        'keyword',
        'storage.type',
        'storage.modifier',
        'entity.name.tag',
        'support.type.property-name'
      ],
      settings: { foreground: '#c2410c' }
    },
    { scope: ['string', 'markup.quote'], settings: { foreground: '#15803d' } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#8b909a' } },
    {
      scope: [
        'variable',
        'entity.name.function',
        'entity.name.section',
        'constant',
        'support.constant'
      ],
      settings: { foreground: '#7c3aed' }
    }
  ]
}

/** 扩展名 → shiki 语言 id（懒加载映射） */
const langLoaders: Record<string, () => Promise<unknown>> = {
  toml: () => import('@shikijs/langs/toml'),
  json: () => import('@shikijs/langs/json'),
  md: () => import('@shikijs/langs/markdown'),
  ts: () => import('@shikijs/langs/typescript'),
  tsx: () => import('@shikijs/langs/tsx'),
  js: () => import('@shikijs/langs/javascript'),
  jsx: () => import('@shikijs/langs/jsx'),
  py: () => import('@shikijs/langs/python'),
  yml: () => import('@shikijs/langs/yaml'),
  yaml: () => import('@shikijs/langs/yaml'),
  html: () => import('@shikijs/langs/html'),
  css: () => import('@shikijs/langs/css'),
  sh: () => import('@shikijs/langs/shellscript'),
  ini: () => import('@shikijs/langs/ini'),
  rs: () => import('@shikijs/langs/rust'),
  go: () => import('@shikijs/langs/go')
}

/** shiki 语言 id 归一（部分扩展名直接等于语言 id） */
function langOf(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'lock') return null
  return ext in langLoaders ? ext : null
}

let highlighterPromise: Promise<HighlighterCore> | null = null
const loadedLangs = new Set<string>()

async function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [panelTheme],
      langs: [],
      engine: createJavaScriptRegexEngine()
    })
  }
  return highlighterPromise
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * 高亮代码，返回 HTML（含 span.line 分行）。
 * 无对应语言时返回纯文本转义 HTML。
 */
export async function highlightCode(code: string, filename: string): Promise<string> {
  const lang = langOf(filename)
  if (!lang) {
    return `<pre class="shiki-plain"><code>${code
      .split('\n')
      .map((l) => `<span class="line">${escapeHtml(l) || ' '}</span>`)
      .join('\n')}</code></pre>`
  }
  const highlighter = await getHighlighter()
  if (!loadedLangs.has(lang)) {
    const mod = (await langLoaders[lang]()) as { default: unknown }
    await highlighter.loadLanguage(mod.default as never)
    loadedLangs.add(lang)
  }
  return highlighter.codeToHtml(code, { lang, theme: 'panel-light' })
}
