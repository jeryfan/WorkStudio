#!/usr/bin/env node
/**
 * 从 VSCode 源码生成 `--vscode-*` 设计 token。
 *
 * 为什么要执行 VSCode 自己的注册表、而不是静态解析：
 * 颜色默认值大量使用 `transparent()/darken()/lighten()/oneOf()/lessProminent()`
 * 变换与跨 id 引用（例如 `agentsPanel.border` = `transparent(foreground, 0.15)`，
 * 而 `foreground` 自己又可能被主题 JSON 覆盖）。静态翻译这套求值规则既容易写错，
 * 也会在上游改实现时静默失配。这里用 esbuild 把注册表打包成 ESM 直接跑，
 * 求值逻辑就是 VSCode 本身的那一份。
 *
 * 主题取 VSCode 的四个内置默认值（workbenchThemeService.ts ThemeSettingDefaults）：
 *   Dark 2026 / Light 2026 / Default High Contrast / Default High Contrast Light
 *
 *   node scripts/gen-vscode-tokens.mjs [vscode 仓库路径]
 */
import { build } from 'esbuild'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  statSync,
  readdirSync
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { pathToFileURL } from 'node:url'

const VSCODE = resolve(process.argv[2] ?? join(homedir(), 'Documents/repositories/github/vscode'))
const OUT = resolve('src/renderer/src/chat/theme/tokens.css')

if (!existsSync(join(VSCODE, 'src/vs/platform/theme/common/colorUtils.ts'))) {
  console.error(
    `\n✗ 不是 VSCode 仓库：${VSCODE}\n  用法：node scripts/gen-vscode-tokens.mjs [vscode 仓库路径]\n`
  )
  process.exit(1)
}

/** 四档主题：CSS 选择器 ← 主题类型 ← 主题文件 */
const THEMES = [
  { attr: 'dark', type: 'dark', file: '2026-dark.json' },
  { attr: 'light', type: 'light', file: '2026-light.json' },
  { attr: 'hc-dark', type: 'hcDark', file: 'hc_black.json' },
  { attr: 'hc-light', type: 'hcLight', file: 'hc_light.json' }
]

/**
 * 注册表入口。
 *
 * 只 import 副作用即可——每个模块在顶层调用 registerColor/registerSize，
 * 导入就等于注册。漏掉某个模块的表现是"该 id 未注册"，会在覆盖率检查里报出来。
 */
const ENTRY_MODULES = [
  'src/vs/platform/theme/common/colorRegistry.ts',
  'src/vs/platform/theme/common/sizes/baseSizes.ts',
  'src/vs/workbench/common/theme.ts',
  'src/vs/workbench/contrib/chat/common/widget/chatColors.ts',
  'src/vs/workbench/contrib/agentsVoice/common/agentsVoiceColors.ts',
  'src/vs/workbench/contrib/terminal/common/terminalColorRegistry.ts',
  'src/vs/sessions/common/theme.ts',
  'src/vs/sessions/common/sizes.ts'
].filter((m) => existsSync(join(VSCODE, m)))

/**
 * 手工转录的两条注册。
 *
 * 这两个 id 的注册点都在无法安全导入的位置：
 *   - `peekView.ts` 在 browser 层，导入链会在模块初始化时真的构建 DOM
 *     （DecorationCssRuleExtractor 的静态初始化），Node 里跑不起来；
 *   - `debugColors.ts` 把 registerColor 包在 `registerColors()` 函数里，
 *     光 import 根本不会注册。
 *
 * 于是照抄默认值。转录必然有漂移风险，所以下面的 assertNoDrift 会拿
 * `defaults` 的字面文本去上游源码里比对——上游一改，生成就失败，而不是
 * 悄悄产出过期的颜色。
 */
const TRANSCRIBED = [
  {
    id: 'peekViewTitleDescription.foreground',
    source: 'src/vs/editor/contrib/peekView/browser/peekView.ts',
    defaults: `{ dark: '#ccccccb3', light: '#616161', hcDark: '#FFFFFF99', hcLight: '#292929' }`
  },
  {
    id: 'debugTokenExpression.name',
    source: 'src/vs/workbench/contrib/debug/browser/debugColors.ts',
    defaults: `{ dark: '#c586c0', light: '#9b46b0', hcDark: foreground, hcLight: foreground }`
  }
]

/** 转录漂移守卫：默认值的字面文本必须仍能在上游源码里原样找到 */
function assertNoDrift() {
  const drifted = TRANSCRIBED.filter(({ id, source, defaults }) => {
    const path = join(VSCODE, source)
    if (!existsSync(path)) return true
    const text = readFileSync(path, 'utf8').replace(/\s+/g, ' ')
    return !text.includes(`registerColor('${id}', ${defaults.replace(/\s+/g, ' ')}`)
  })
  if (drifted.length > 0) {
    console.error(
      `\n✗ 转录的颜色默认值已与上游不一致：\n` +
        drifted.map((d) => `    ${d.id}  (${d.source})`).join('\n') +
        `\n\n  去源码里核对 registerColor 的默认值，更新本脚本的 TRANSCRIBED。\n`
    )
    process.exit(1)
  }
}
assertNoDrift()

// ── 打包 ────────────────────────────────────────────────────────────

/** VSCode 源码里 import 写的是 `.js`，磁盘上是 `.ts` */
const tsResolve = {
  name: 'vscode-ts-resolve',
  setup(b) {
    b.onResolve({ filter: /\.js$/ }, (args) => {
      if (!args.importer || !args.path.startsWith('.')) return
      const base = resolve(dirname(args.importer), args.path)
      const ts = base.replace(/\.js$/, '.ts')
      return { path: existsSync(ts) ? ts : base }
    })
  }
}

/**
 * 把 `.css` import 掏空。
 *
 * browser 层的模块（peekView、debugColors）会 `import './x.css'` 让打包器收集样式。
 * 我们只要它们顶层的 registerColor 副作用，样式是噪音。
 */
const stubCss = {
  name: 'stub-css',
  setup(b) {
    b.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: 'stub-css' }))
    b.onLoad({ filter: /.*/, namespace: 'stub-css' }, () => ({ contents: '', loader: 'js' }))
  }
}

const entry = [
  ...ENTRY_MODULES.map((m) => `import '${join(VSCODE, m)}'`),
  `import { registerColor } from '${VSCODE}/src/vs/platform/theme/common/colorUtils.ts'`,
  `import { foreground } from '${VSCODE}/src/vs/platform/theme/common/colors/baseColors.ts'`,
  ...TRANSCRIBED.map((t) => `registerColor('${t.id}', ${t.defaults}, '')`),
  `export { getColorRegistry } from '${VSCODE}/src/vs/platform/theme/common/colorUtils.ts'`,
  `export { getSizeRegistry, sizeValueToCss } from '${VSCODE}/src/vs/platform/theme/common/sizeUtils.ts'`,
  `export { Color } from '${VSCODE}/src/vs/base/common/color.ts'`
].join('\n')

const bundle = await build({
  stdin: { contents: entry, resolveDir: VSCODE, loader: 'ts' },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
  plugins: [tsResolve, stubCss],
  // browser 层模块用了参数装饰器（依赖注入）
  tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
  logLevel: 'silent'
})

const tmp = join(mkdtempSync(join(tmpdir(), 'vscode-tokens-')), 'registry.mjs')
writeFileSync(tmp, bundle.outputFiles[0].text)

const { getColorRegistry, getSizeRegistry, sizeValueToCss, Color } = await import(
  pathToFileURL(tmp).href
)

const colorRegistry = getColorRegistry()
const sizeRegistry = getSizeRegistry()

// ── 主题加载 ────────────────────────────────────────────────────────

/** 主题文件是 JSONC：带 `//` 注释与尾逗号，JSON.parse 吃不下 */
function parseJsonc(text) {
  return JSON.parse(
    text
      // 先整体扫一遍，字符串字面量原样保留，其余位置的注释才剥掉——
      // 否则 "#fff // not a comment" 这类值会被截断
      .replace(/"(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) =>
        m.startsWith('"') ? m : ''
      )
      .replace(/,(\s*[}\]])/g, '$1')
  )
}

/**
 * 跟随 `include` 链合并；子主题的值覆盖父主题。
 *
 * `tokenColors` 是**追加**而不是覆盖：TextMate 规则按数组顺序后来居上，
 * 子主题的规则要排在父主题之后才能生效。
 */
function loadTheme(file) {
  const json = parseJsonc(
    readFileSync(join(VSCODE, 'extensions/theme-defaults/themes', file), 'utf8')
  )
  const parent = json.include
    ? loadTheme(json.include.replace(/^\.\//, ''))
    : {
        colors: {},
        sizes: {},
        tokenColors: [],
        semanticTokenColors: {},
        semanticHighlighting: false
      }
  return {
    colors: { ...parent.colors, ...(json.colors ?? {}) },
    sizes: { ...parent.sizes, ...(json.sizes ?? {}) },
    tokenColors: [...parent.tokenColors, ...(json.tokenColors ?? [])],
    semanticTokenColors: { ...parent.semanticTokenColors, ...(json.semanticTokenColors ?? {}) },
    semanticHighlighting: json.semanticHighlighting ?? parent.semanticHighlighting
  }
}

/**
 * 构造一个够用的 IColorTheme。
 *
 * `resolveDefaultColor` 求值时会回头调 `theme.getColor(otherId)` 解析引用，
 * 所以这里必须是"先查主题覆盖、否则递归求默认值"。带环保护是因为个别颜色
 * 的默认值链存在自引用（`oneOf(self, ...)` 之类），没有环保护会栈溢出。
 */
function makeTheme({ type }, overrides) {
  const cache = new Map()
  const resolving = new Set()
  const theme = {
    type,
    getColor(id) {
      if (cache.has(id)) return cache.get(id)
      if (resolving.has(id)) return undefined
      resolving.add(id)
      const raw = overrides.colors[id]
      const color =
        typeof raw === 'string' ? Color.fromHex(raw) : colorRegistry.resolveDefaultColor(id, theme)
      resolving.delete(id)
      cache.set(id, color)
      return color
    },
    defines(id) {
      return theme.getColor(id) !== undefined
    }
  }
  return theme
}

/** id → CSS 变量名（与 colorUtils/sizeUtils 的 asCssVariableName 一致） */
const cssVar = (id) => `--vscode-${id.replace(/\./g, '-')}`

// ── 求值 ────────────────────────────────────────────────────────────

const colorIds = colorRegistry
  .getColors()
  .map((c) => c.id)
  .sort()
const sizeIds = sizeRegistry
  .getSizes()
  .map((s) => s.id)
  .sort()

const resolved = THEMES.map((t) => {
  const overrides = loadTheme(t.file)
  const theme = makeTheme(t, overrides)
  const vars = new Map()

  for (const id of colorIds) {
    const color = theme.getColor(id)
    if (color) vars.set(cssVar(id), Color.Format.CSS.formatHexA(color, true))
  }
  for (const id of sizeIds) {
    const raw = overrides.sizes[id]
    const value = raw ?? sizeRegistry.resolveDefaultSize(id, theme)
    if (value) vars.set(cssVar(id), typeof raw === 'string' ? raw : sizeValueToCss(value))
  }
  return { ...t, vars, overrides, theme }
})

// ── 输出 ────────────────────────────────────────────────────────────

/**
 * 四个块各自写全量并集，缺失项写 `initial`。
 *
 * 不用"以 dark 为基线、其余覆盖"的写法：某个变量在 dark 有值而在 light 无值时，
 * 覆盖式写法会让它在 light 下残留 dark 的值。写 `initial` 则让 var() 走
 * fallback，与 VSCode "该主题下不输出这个变量" 的行为一致。
 */
const allVars = [...new Set(resolved.flatMap((t) => [...t.vars.keys()]))].sort()

const blocks = resolved.map((t) => {
  const selector = t.attr === 'dark' ? `:root,\n[data-theme='dark']` : `[data-theme='${t.attr}']`
  const body = allVars.map((v) => `  ${v}: ${t.vars.get(v) ?? 'initial'};`).join('\n')
  return `${selector} {\n${body}\n}`
})

const header = `/*
 * 生成物 —— 由 scripts/gen-vscode-tokens.mjs 从 VSCode 源码生成，请勿手改。
 * 重新生成：node scripts/gen-vscode-tokens.mjs [vscode 仓库路径]
 *
 * 取值来自 VSCode 的四个内置默认主题（ThemeSettingDefaults）：
 *   Dark 2026 / Light 2026 / Default High Contrast / Default High Contrast Light
 *
 * 颜色与尺寸的定义、以及默认值中的 transparent/darken/lighten 等变换，
 * 版权归 Microsoft，MIT 许可。
 * https://github.com/microsoft/vscode
 */

`

writeFileSync(OUT, header + blocks.join('\n\n') + '\n')

console.log(`✓ ${OUT}`)
console.log(
  `  颜色 ${colorIds.length} 项 / 尺寸 ${sizeIds.length} 项 / 变量并集 ${allVars.length} 项`
)
for (const t of resolved) {
  console.log(`  ${t.attr.padEnd(9)} 有值 ${String(t.vars.size).padStart(4)} / ${allVars.length}`)
}

// ── 给 shiki / Monaco 用的扁平化主题 ────────────────────────────────

/**
 * 代码块与 diff 用 Monaco 渲染，但分词交给 shiki（@shikijs/monaco）。
 *
 * 原因：Monaco 自带的 Monarch tokenizer 产出的是粗粒度 token（`comment` /
 * `keyword` / `string` / `number` / `identifier` / `delimiter`），而 VSCode 主题
 * 的着色规则是 TextMate scope（`entity.name.function`、`variable.other.constant`
 * 等，Dark 2026 有 91 条）。两者只在少数粗根上重合，直接用 Monarch 会让数字、
 * 类型、函数名、变量、标点全部退化成前景色。shiki 用的是真 TextMate 语法，
 * 能原样吃下这里导出的主题。
 *
 * 导出的是**扁平化**主题：include 链已解析，colors 用注册表求值后的完整结果
 * （所以 hc 主题那 3~11 条覆盖之外的颜色也齐全），tokenColors 按父→子顺序拼接。
 */
const THEME_DIR = resolve('src/renderer/src/chat/theme/vscode-themes')
mkdirSync(THEME_DIR, { recursive: true })

for (const t of resolved) {
  const colors = {}
  for (const id of colorIds) {
    const color = t.theme.getColor(id)
    if (color) colors[id] = Color.Format.CSS.formatHexA(color, true)
  }
  const theme = {
    // shiki 只认 dark / light 两种；hc 归入同明度的那一档
    name: t.attr,
    type: t.type === 'hcDark' ? 'dark' : t.type === 'hcLight' ? 'light' : t.type,
    semanticHighlighting: t.overrides.semanticHighlighting,
    colors,
    semanticTokenColors: t.overrides.semanticTokenColors,
    tokenColors: t.overrides.tokenColors
  }
  writeFileSync(join(THEME_DIR, `${t.attr}.json`), JSON.stringify(theme, null, 2) + '\n')
}

console.log(`✓ ${THEME_DIR}`)
for (const t of resolved) {
  console.log(
    `  ${t.attr.padEnd(9)} tokenColors ${String(t.overrides.tokenColors.length).padStart(3)} 条`
  )
}

// ── 覆盖率自检 ──────────────────────────────────────────────────────

/**
 * 扫描上游对话 CSS 引用的每一个 `--vscode-*`，确认我们这边都有来源。
 *
 * 少一个变量不会报错，只会让某处颜色悄悄回退到 `var()` 的 fallback 或者透明——
 * 这类问题在界面上表现为"某个角落颜色不对"，极难回溯。所以宁可在生成期硬失败。
 */
const CHAT_CSS_GLOBS = [
  'src/vs/workbench/contrib/chat/browser/widget/media/chat.css',
  'src/vs/workbench/contrib/chat/browser/widget/chatContentParts/media',
  'src/vs/sessions/contrib/chat/browser/media/chatView.css',
  'src/vs/sessions/contrib/chat/browser/media/chatWidget.css'
]

/** chatWidget 运行时注入、已在 widget-tokens.css 里固化成别名 */
const WIDGET_INJECTED = new Set([
  '--vscode-chat-list-background',
  '--vscode-interactive-session-foreground',
  '--vscode-interactive-result-editor-background-color'
])

/** 定义在 chat.css 自身的相对字号阶梯与运行时字体，随 CSS 一起移植 */
const DEFINED_IN_CHAT_CSS = (v) =>
  v === '--vscode-chat-font-family' || v.startsWith('--vscode-chat-font-size-body-')

function collectCss(p) {
  const full = join(VSCODE, p)
  if (!existsSync(full)) return []
  if (statSync(full).isDirectory()) {
    return readdirSync(full)
      .filter((f) => f.endsWith('.css'))
      .flatMap((f) => collectCss(join(p, f)))
  }
  return [readFileSync(full, 'utf8')]
}

const referenced = new Set(
  CHAT_CSS_GLOBS.flatMap(collectCss)
    .join('\n')
    .match(/--vscode-[A-Za-z0-9-]+/g) ?? []
)

const missing = [...referenced]
  .filter((v) => !allVars.includes(v) && !WIDGET_INJECTED.has(v) && !DEFINED_IN_CHAT_CSS(v))
  .sort()

if (missing.length > 0) {
  console.error(
    `\n✗ 上游对话 CSS 引用了 ${missing.length} 个无来源的变量：\n` +
      missing.map((v) => `    ${v}`).join('\n') +
      `\n\n  多半是注册模块漏了。把注册它的文件加进本脚本的 ENTRY_MODULES；\n` +
      `  若确认是 widget 运行时注入的，加进 WIDGET_INJECTED 并在 widget-tokens.css 里定义。\n`
  )
  process.exit(1)
}

console.log(`  覆盖自检 ✓ 上游对话 CSS 引用的 ${referenced.size} 个变量全部有来源`)
