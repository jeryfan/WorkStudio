/**
 * Monaco 接入 —— 编辑器行为用 Monaco，分词与配色用 shiki。
 *
 * 为什么不用 Monaco 自带的 Monarch 分词器：
 * Monarch 产出的 token 名是粗粒度的（`comment` / `keyword` / `string` /
 * `number` / `identifier` / `delimiter`，每语言约 20 个），而 VSCode 主题的着色
 * 规则是 TextMate scope（`entity.name.function`、`variable.other.constant`……
 * Dark 2026 有 118 条）。两者只在少数粗根上重合，直接用 Monarch 会让数字、类型、
 * 函数名、变量、标点全部落回前景色——配色保真度反而不如纯 shiki。
 *
 * 于是分工：
 *   Monaco  负责选择、查找、折叠、滚动、以及 diff 编辑器
 *   shiki   负责 TextMate 语法与主题着色（吃 gen-vscode-tokens.mjs 导出的主题）
 *
 * 因为分词由 shiki 提供，这里**不导入** Monaco 的任何语言包（`languages/
 * definitions/*`）——只 `monaco.languages.register` 一个 id 让 Monaco 知道它存在。
 * 省下的是 monaco-editor 里最大的一块。
 */
import * as monaco from 'monaco-editor/editor/editor.api'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { shikiToMonaco } from '@shikijs/monaco'
import { LANG_LOADERS, type ShikiLang } from '../../shiki/langs'
import { THEME_VARIANTS, VSCODE_THEMES, type ThemeVariant } from '../theme/themes'
import { getTheme, subscribeTheme } from '../theme/themeStore'

export type { ThemeVariant }
export { monaco }

/**
 * Monaco 的 worker。
 *
 * 只挂基础 editor worker：语言服务（TS/JSON 的诊断与补全）在对话代码块里既用不上
 * 也不该有——那是只读展示，不是编辑器。但 editor worker 不能省，**diff 的差异
 * 计算就在它里面跑**。
 */
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker()
}

let bootPromise: Promise<HighlighterCore> | null = null
const registered = new Set<ShikiLang>()

async function boot(): Promise<HighlighterCore> {
  const highlighter = await createHighlighterCore({
    themes: THEME_VARIANTS.map((variant) => VSCODE_THEMES[variant] as never),
    langs: [],
    // JavaScript 正则引擎：省掉 oniguruma 的 WASM 资源。代价是极少数语法
    // （用到 oniguruma 独有语法的）会降级，常见语言不受影响。
    engine: createJavaScriptRegexEngine()
  })
  shikiToMonaco(highlighter, monaco)

  // shikiToMonaco 会把主题设成它注册的第一个，这里纠正回当前主题，
  // 并跟随后续切换
  monaco.editor.setTheme(getTheme())
  subscribeTheme((theme) => monaco.editor.setTheme(theme))

  return highlighter
}

/** 惰性初始化；重复调用共享同一个 Promise */
export function initMonaco(): Promise<HighlighterCore> {
  bootPromise ??= boot()
  return bootPromise
}

/**
 * 确保某语言可用，返回 Monaco 的 language id；不支持则返回 null。
 *
 * 顺序不能换：先让 Monaco 认得这个 id，shikiToMonaco 才会给它挂 tokenizer
 * （它只处理已注册的 id）。
 */
export async function ensureLanguage(lang: ShikiLang): Promise<string | null> {
  const highlighter = await initMonaco()
  if (registered.has(lang)) return lang

  const loader = LANG_LOADERS[lang]
  if (!loader) return null

  monaco.languages.register({ id: lang })
  const mod = (await loader()) as { default: unknown }
  await highlighter.loadLanguage(mod.default as never)

  // 重挂：shikiToMonaco 只覆盖调用那一刻已加载的语言，且会重置主题
  shikiToMonaco(highlighter, monaco)
  monaco.editor.setTheme(getTheme())

  registered.add(lang)
  return lang
}
