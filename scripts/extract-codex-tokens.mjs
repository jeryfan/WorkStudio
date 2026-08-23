#!/usr/bin/env node
/**
 * 从 Codex webview 静态产物提取设计 token,生成 WorkStudio 的样式地基。
 *
 * 为什么是脚本而不是手抄:Codex 升级后重跑一次即可,手抄的近似值会随时间漂移
 * ——这个项目上一轮就是这么改乱的。
 *
 * 用法: node scripts/extract-codex-tokens.mjs [codexWebviewAssetsDir]
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ASSETS =
  process.argv[2] ??
  '/Users/fanjunjie/Documents/repositories/github/codex-web/scratch/asar/webview/assets'
const OUT = path.resolve('src/renderer/src/assets/codex')
const TW_THEME = path.resolve('node_modules/tailwindcss/theme.css')

/** 顶层花括号切块: 返回 [{prelude, body}] */
function blocks(text) {
  const out = []
  let i = 0
  while (i < text.length) {
    const j = text.indexOf('{', i)
    if (j < 0) break
    const prelude = text.slice(i, j).trim()
    let depth = 1
    let k = j + 1
    while (k < text.length && depth > 0) {
      if (text[k] === '{') depth++
      else if (text[k] === '}') depth--
      k++
    }
    out.push({ prelude, body: text.slice(j + 1, k - 1) })
    i = k
  }
  return out
}

/**
 * 只取本层直接声明,不含嵌套块。
 *
 * 不能用正则剥嵌套块: `[^{}]*\{...\}` 开头的 `[^{}]*` 会把嵌套块之前的所有声明
 * 一起吞掉(实测 19KB 的 @theme 剥完只剩 924 字符)。必须扫描式处理。
 */
function ownDecls(body) {
  const src = body.replace(/\/\*[\s\S]*?\*\//g, '')
  let buf = ''
  let i = 0
  while (i < src.length) {
    if (src[i] === '{') {
      // buf 尾部是这个嵌套块的 prelude(选择器/at-rule),丢弃到上一个语句边界
      const cut = Math.max(buf.lastIndexOf(';'), buf.lastIndexOf('}'))
      buf = buf.slice(0, cut + 1)
      let depth = 1
      i++
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++
        else if (src[i] === '}') depth--
        i++
      }
      continue
    }
    buf += src[i]
    i++
  }
  const out = new Map()
  for (const m of buf.matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]*)/g)) {
    const name = m[1]
    const value = m[2].trim()
    // LightningCSS 用空值自定义属性(--lightningcss-light/-dark)来 polyfill
    // light-dark()。浏览器接受空值,但 Tailwind 的解析器会报
    // "Invalid custom property, expected a value" 直接中断构建。
    // 这类是上游构建管线的产物,不是设计 token,一律丢弃。
    if (!value) continue
    if (name.startsWith('--lightningcss-')) continue
    out.set(name, value)
  }
  return out
}

/** 递归收集匹配 selector 的所有声明,后出现的覆盖先出现的(CSS 层叠) */
function collect(text, matchPrelude) {
  const acc = new Map()
  const walk = (nodes) => {
    for (const { prelude, body } of nodes) {
      if (matchPrelude(prelude)) {
        for (const [k, v] of ownDecls(body)) acc.set(k, v)
      }
      if (body.includes('{')) walk(blocks(body))
    }
  }
  walk(blocks(text))
  return acc
}

/**
 * 选择器的"顶层形态" —— 反复剥掉成对括号,只留下真正参与后代匹配的部分。
 * `:is([a],[b]) body` → ` body`,`:is([a],[b])` → ``。
 * 判断作用域只能看这个,直接对原串做子串匹配会把 `… body` 误判成根作用域。
 */
function topLevel(sel) {
  let s = sel
  let prev
  do {
    prev = s
    s = s.replace(/\([^()]*\)/g, '')
  } while (s !== prev)
  return s
}

const WT = /data-codex-window-type/

/** `:is([data-codex-window-type=…])` 这类挂在 <html> 上的根规则 */
const isWindowTypeRoot = (p) => WT.test(p) && !/[\s>+~]/.test(topLevel(p).trim())

/** `… body` —— 挂在 <body> 上的规则,与根规则**不是**同一层,不能合并 */
const isWindowTypeBody = (p) => WT.test(p) && topLevel(p).trim().split(/[\s>+~]+/).pop() === 'body'

/**
 * 逐规则收集(不跨选择器合并)。collect() 把所有命中的声明并成一个 Map,
 * 那是给"同一个选择器在多处重复定义"用的;选择器不同的规则必须分开保留,
 * 否则 `.electron-opaque body` 的条件声明会变成无条件生效。
 */
function collectRules(text, matchPrelude) {
  const out = []
  const walk = (nodes) => {
    for (const { prelude, body } of nodes) {
      if (matchPrelude(prelude)) out.push({ prelude: prelude.trim(), decls: ownDecls(body) })
      if (body.includes('{')) walk(blocks(body))
    }
  }
  walk(blocks(text))
  return out
}

const read = (f) => fs.readFileSync(path.join(ASSETS, f), 'utf8')
const cssFiles = fs
  .readdirSync(ASSETS)
  .filter((f) => f.endsWith('.css'))
  .sort((a, b) => fs.statSync(path.join(ASSETS, b)).size - fs.statSync(path.join(ASSETS, a)).size)

const appCss = read('app-DuLjgNkx.css')
const initialCss = read('app-initial-AYgnwUwc.css')

// ---------- 1) Tailwind 默认 theme,用于求差集 ----------
const twDefaults = collect(fs.readFileSync(TW_THEME, 'utf8'), (p) =>
  /^@theme\b/.test(p) || /^:root(\s*,\s*:host)?$/.test(p)
)

// ---------- 2) Codex 的 @theme 基础层 ----------
const themeAll = new Map()
for (const css of [appCss, initialCss]) {
  for (const [k, v] of collect(css, (p) => /^:root(\s*,\s*:host)?$/.test(p) || p === ':host')) {
    themeAll.set(k, v)
  }
}
// 差集: 与 Tailwind 默认值相同的丢掉,只留 Codex 定制/覆盖。
// 必须规范化再比: 压缩器把 `0.237` 写成 `.237`、去掉了空格和引号差异,
// 直接字符串比会把整个默认调色板误判成"定制"。
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([,()])\s*/g, '$1')
    .replace(/(^|[^\w.])0+\.(\d)/g, '$1.$2')
    .trim()

const themeCustom = new Map()
for (const [k, v] of themeAll) {
  const d = twDefaults.get(k)
  if (d === undefined || norm(d) !== norm(v)) themeCustom.set(k, v)
}

// ---------- 3) 语义主题层 (.electron-light / .electron-dark) ----------
const light = new Map()
const dark = new Map()
const appTheme = new Map()
const windowBody = []
for (const css of [appCss, initialCss]) {
  // 必须**精确**匹配裸选择器。用 /\.electron-light\b/ 做子串匹配会把
  //   .electron-light .[.electron-light_&]:[--color-token-text-link-foreground:var(--blue-400)]
  // 这种"任意属性 utility"也吸进来 —— 它在 Codex 里只对显式挂了该类的元素生效,
  // 并进全局 .electron-light 块后就变成无条件覆盖,把 :root 的
  // var(--vscode-textLink-foreground)(#339cff)压成 var(--blue-400)(#0285ff)。
  // 实测:会话行状态圆点、链接色整体偏蓝。hljs 的 :is(.light,.electron-light) 也同理,
  // 那一层由 highlight.css 单独负责。
  for (const [k, v] of collect(css, (p) => p.trim() === '.electron-light')) light.set(k, v)
  for (const [k, v] of collect(css, (p) => p.trim() === '.electron-dark')) dark.set(k, v)
  // --vscode-* 层的选择器:Codex 里有两处等价定义 —— @layer utilities 内的
  // .app-theme(698 项)和无 layer 的 :is([data-codex-window-type=…])(703 项)。
  // 运行时生效的是后者(无 layer 优先级更高,且项数更全),而且它靠 <html> 上的
  // data-codex-window-type 属性自动命中,不需要额外挂类。两处都收,合并后按
  // window-type 选择器输出。
  for (const [k, v] of collect(css, (p) => /^\.app-theme$/.test(p.trim()))) appTheme.set(k, v)
  // 只收**根作用域**的那份。以前这里用 /data-codex-window-type=electron/ 做子串匹配,
  // 把 `… body`、`.electron-opaque body`、`:not([data-codex-window-chrome=…]) body`
  // 全都吸进了同一个根块 —— 实测后果:
  //   1. `.electron-opaque` 的条件声明 --color-background-elevated-primary:…-opaque
  //      变成无条件生效,弹起面板/Composer 表面丢掉 0.96 透明度,backdrop-blur 失效;
  //   2. body 作用域的 16 个覆盖被 :root 反压,--padding-row-y 从 5px 退回 4px、
  //      --cursor-interaction 从 default 退回 pointer、--thread-content-max-width 丢失。
  for (const [k, v] of collect(css, isWindowTypeRoot)) appTheme.set(k, v)
  for (const r of collectRules(css, isWindowTypeBody)) windowBody.push(r)
}

// ---------- 4) 命名语义 utility 类 ----------
// 这些是壳层实际用到的、非 Tailwind 生成的语义类
const NAMED = [
  'app-shell-left-panel',
  'sidebar-item',
  'sidebar-icon-button',
  'sidebar-hover-icon-button-tint',
  'sidebar-hover-icon-tint',
  'sidebar-resize-handle-line',
  'hide-scrollbar',
  'text-fade-truncate',
  'horizontal-scroll-fade-mask',
  'vertical-scroll-fade-mask',
  'heading-xl',
  'icon-2xs',
  'icon-xs',
  'icon-sm',
  'home-banners',
  'cursor-interaction',
  'no-drag',
  'draggable',
  'startup-loader',
  // Codex 自定义的 shadow 标度 —— Tailwind 生成但不在 @theme 里(它写的是
  // --tw-shadow 而不是 --shadow-*),所以只能按类名收。首页建议卡在用。
  'shadow-md-strong',
  'shadow-md-stronger',
  'shadow-hairline',
  // 悬浮卡片(Tooltip variant="rich")的阴影:0.5px 描边 + --shadow-xl 两层叠加
  'shadow-xl-spread',
  // ProseMirror 基础层 —— Codex 里是**裸 .ProseMirror** 选择器(不带模块哈希),
  // 提供 white-space:break-spaces / word-wrap / font-variant-ligatures,
  // 以及占位符 `.ProseMirror .placeholder:after { content: attr(data-placeholder) }`。
  // 少了它 ProseMirror 会在控制台告警 "expects the CSS white-space property to be set",
  // 而且占位符完全不显示。注意是 **:after** 不是 :before。
  'ProseMirror'
]
const namedRules = []
for (const f of cssFiles) {
  const text = read(f)
  const walk = (nodes, wrap) => {
    for (const { prelude, body } of nodes) {
      const isAt = prelude.startsWith('@')
      if (!isAt) {
        // prelude 可能是逗号分隔的多个选择器
        const hit = NAMED.some((n) =>
          new RegExp(`\\.${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(prelude)
        )
        if (hit && !body.includes('{')) {
          namedRules.push({ wrap, prelude, body: body.trim(), file: f })
        }
      }
      if (body.includes('{')) walk(blocks(body), isAt ? [...wrap, prelude] : wrap)
    }
  }
  walk(blocks(text), [])
}

// ---------- 5) 自定义 @utility ----------
// Tailwind v4 只为已知命名空间(--color-/--spacing-/--radius-…)自动生成 utility。
// Codex 另有一批 @utility 挂在自定义命名空间上(--padding-row-x / --height-toolbar /
// --transition-duration-basic …),编译后落在 @layer utilities 里。这里按"引用了这些
// 命名空间"自动发现,避免手工枚举漏项。
const CUSTOM_NS = /var\(--(padding-(row|panel|toolbar)|height-toolbar|transition-duration|spacing-token-button)/
const CUSTOM_NAME = /^\.(icon-(2xs|xs|sm|md|lg)|heading-[a-z0-9]+|h-token-button-composer(-sm)?|size-token-button-composer)$/

const utilities = new Map()
for (const f of cssFiles) {
  const text = read(f)
  const walk = (nodes) => {
    for (const { prelude, body } of nodes) {
      if (body.includes('{')) {
        walk(blocks(body))
        continue
      }
      // 单一类选择器、无嵌套
      if (!/^\.[A-Za-z][\w-]*$/.test(prelude)) continue
      if (!CUSTOM_NS.test(body) && !CUSTOM_NAME.test(prelude)) continue
      const name = prelude.slice(1)
      if (!utilities.has(name)) utilities.set(name, body.trim().replace(/;$/, ''))
    }
  }
  walk(blocks(text))
}

// ---------- 5b) 命名类与 utility 的伪类/伪元素变体 ----------
// 只取基础规则会漏掉交互态。实测漏了 .scrollbar-on-hover:hover
// (滚动条平时透明、hover 才显现)和 ::-webkit-scrollbar-thumb 那几条,
// 结果是滚动条行为和 Codex 不一致 —— 这类差异肉眼很难归因,必须成套取。
const variantNames = [...NAMED, ...utilities.keys()]
const variantRules = []
for (const f of cssFiles) {
  const text = read(f)
  const walk = (nodes, wrap) => {
    for (const { prelude, body } of nodes) {
      const isAt = prelude.startsWith('@')
      if (!isAt && !body.includes('{')) {
        // 带伪类/伪元素的形态: .name:hover / .name::-webkit-scrollbar-thumb
        const hit = variantNames.some((n) =>
          new RegExp(`\\.${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(:|::)`).test(prelude)
        )
        if (hit) variantRules.push({ wrap, prelude, body: body.trim() })
      }
      if (body.includes('{')) walk(blocks(body), isAt ? [...wrap, prelude] : wrap)
    }
  }
  walk(blocks(text), [])
}

// ---------- 6) 语法高亮 (.hljs-*) ----------
// Codex 的代码高亮不靠 TextMate 主题 JSON,而是 .hljs-* 类 + 自己的 token 上色。
// WorkStudio 原本喂给 shiki/Monaco 的是 VS Code 主题 JSON —— 那是另一套配色,
// 代码块会和外壳割裂。这里把 Codex 的高亮规则一并取出。
const hljsRules = []
for (const f of cssFiles) {
  const text = read(f)
  const walk = (nodes, wrap) => {
    for (const { prelude, body } of nodes) {
      const isAt = prelude.startsWith('@')
      if (!isAt && /\.hljs(?![\w-])|\.hljs-[\w-]+/.test(prelude) && !body.includes('{')) {
        hljsRules.push({ wrap, prelude, body: body.trim() })
      }
      if (body.includes('{')) walk(blocks(body), isAt ? [...wrap, prelude] : wrap)
    }
  }
  walk(blocks(text), [])
}

// ---------- 7) CSS Modules 组件类 + @keyframes ----------
// 哈希类名里保留了原始组件名(_cadencedShimmer_1a2b3_4),按组件名挑需要的。
// WorkStudio 之前手写了一版 shimmer 近似实现,这里取真身替换。
// 全量取 CSS Modules 类(形如 _ComponentName_hash_lineno)。
// 早先只挑了 shimmer 一类,结果漏掉了 _MainContentSurface_ 这些外壳组件 ——
// 主内容区那道 0.5px hairline 就在其中,表现是"侧栏看不出边界"。
// 组件迁移要逐个对照 Codex 的实现,这层必须完整。
const MODULE_PICK = /^_[A-Za-z][A-Za-z0-9]*_[a-z0-9]{4,8}_[0-9]+$/
const moduleRules = []
const keyframes = new Map()
for (const f of cssFiles) {
  const text = read(f)
  const walk = (nodes, wrap) => {
    for (const { prelude, body } of nodes) {
      const isAt = prelude.startsWith('@')
      if (/^@keyframes\s/.test(prelude)) {
        keyframes.set(prelude.trim(), body.trim())
        continue
      }
      if (!isAt && !body.includes('{')) {
        const classes = prelude.match(/\._[A-Za-z][\w-]*/g) ?? []
        if (classes.some((c) => MODULE_PICK.test(c.slice(1)))) {
          moduleRules.push({ wrap, prelude, body: body.trim() })
        }
      }
      if (body.includes('{')) walk(blocks(body), isAt ? [...wrap, prelude] : wrap)
    }
  }
  walk(blocks(text), [])
}

/**
 * 把规则包回它原本的 at-rule 链里(由内向外)。
 *
 * 不能用分隔符把链拼成一个 prelude —— `@layer components >> @supports (...)`
 * 不是合法 CSS。层叠顺序要和 Codex 一致,就必须真正嵌套。
 */
function nest(wrap, inner) {
  let out = inner
  for (let i = wrap.length - 1; i >= 0; i--) {
    out = `${wrap[i]} {\n${out.replace(/^(?=.)/gm, '  ')}\n}`
  }
  return out
}

// ---------- 输出 ----------
fs.mkdirSync(OUT, { recursive: true })
const banner = (title, note) =>
  `/* ${'='.repeat(74)}\n   ${title}\n   由 scripts/extract-codex-tokens.mjs 从 Codex webview 产物自动生成 —— 请勿手改\n${note ? `   ${note}\n` : ''}   ${'='.repeat(74)} */\n\n`

const fmt = (map) =>
  [...map]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')

// theme.css —— @theme,产出 Tailwind utility 词汇
fs.writeFileSync(
  path.join(OUT, 'theme.css'),
  banner('Codex 基础标度 / 调色板', `与 Tailwind v4 默认值相同的已剔除,仅保留 Codex 定制项`) +
    `@theme {\n${fmt(themeCustom)}\n}\n`
)

// semantic.css —— 明暗两套语义 token,选择器保持 Codex 原样
//
// 不改名、不改选择器: Codex 升级后重跑提取器应该是直接替换,而不是
// 替换 + 修补映射层。差异吸收在 ThemeProvider 里(它给 <html> 挂 electron-light /
// electron-dark),那是 WorkStudio 自己的代码,是唯一该做适配的地方。
fs.writeFileSync(
  path.join(OUT, 'semantic.css'),
  banner('Codex 语义主题层', '明/暗各一套 —— 原语 → 语义,依赖链的第 2 层') +
    `.electron-light {\n${fmt(light)}\n}\n\n.electron-dark {\n${fmt(dark)}\n}\n`
)

// app-theme.css —— .app-theme: 698 个 --vscode-*,全部从语义层合成
//
// 这一层是 Codex 给内嵌的 VS Code 系组件(Monaco 等)铺的同源颜色面。
// WorkStudio 也用 Monaco + shiki,所以这层必须保留 —— 但它是 Codex 合成的,
// 不是从 VS Code 源码推导的。方向搞反就会同名不同源。
// 选择器与 Codex 运行时一致:靠 <html data-codex-window-type> 命中。
// 挂在 .app-theme 上是错的 —— 那个类没有任何元素会带,整层 --vscode-* 会全空,
// 表现是文字回落成纯黑、边框变透明。
const WINDOW_TYPE_SELECTOR = [
  ":is([data-codex-window-type='browser']",
  "[data-codex-window-type='chrome-extension']",
  "[data-codex-window-type='electron'])"
].join(',\n')
/*
 * 剔除 @theme 已经拥有的键。
 *
 * Codex 里同一个 token 常有两处定义,例如 --padding-row-y:
 *     :is([data-codex-window-type=…])  calc(--spacing * 1.25)   5px
 *     :root                            calc(--spacing * 1)      4px  ← 源码在后,胜出
 * 两者特异性相同,靠源码顺序决胜,Codex 的有效值是 :root 那份。
 *
 * 但搬到这里就变了:@theme 会被 Tailwind 提进 theme 层,而本文件无层级,
 * **无层级恒压 layer**,不管 import 顺序都是 1.25 赢 —— 行高会从 29 变成 31,
 * 整个应用的行都高 2px。所以凡是 @theme 已有的键一律不重复声明,
 * 这一层只负责它真正该负责的 --vscode-* 合成。
 */
const appThemeOnly = new Map([...appTheme].filter(([k]) => !themeCustom.has(k)))

/*
 * Tailwind 的**按元素内部状态变量**不是设计 token,不能进这一层。
 *
 * --tw-ring-shadow / --tw-translate-* / --tw-leading / --tw-font-weight / --tw-brightness
 * 这些在 Codex 里是 utility 自己在命中元素上设的(`.ring-0.5` 设 ring-shadow,
 * `-ms-1` 设 translate-x),:root 上恒为中性值。搬进这一层就变成全局默认:
 * 任何用到 ring / shadow / translate / leading 的元素都会白白叠上 0.5px 描边
 * 和 -4px/+2px 位移。与 @theme 键必须剔除是同一族问题 —— 都是"作用域搞错"。
 */
const TW_INTERNAL = /^--tw-/
for (const k of [...appThemeOnly.keys()]) if (TW_INTERNAL.test(k)) appThemeOnly.delete(k)

/*
 * body 作用域的规则单独输出,选择器逐字保留。
 *
 * 这一层 Codex 用来覆盖根上的默认值,例如 --padding-row-y 从 *1 提到 *1.25
 * (行高 29 → 31)、--cursor-interaction 从 pointer 改成 default(桌面端按钮
 * 是箭头不是手型)。合并进根块会让覆盖方向反转,实测差异见
 * docs/codex-alignment-audit.md B2。
 */
const bodyRules = windowBody
  .map(({ prelude, decls }) => {
    const kept = new Map([...decls].filter(([k]) => !TW_INTERNAL.test(k)))
    return kept.size ? `${prelude} {\n${fmt(kept)}\n}` : ''
  })
  .filter(Boolean)
  .join('\n\n')

fs.writeFileSync(
  path.join(OUT, 'app-theme.css'),
  banner('Codex --vscode-* 合成层', '语义 → --vscode-*,依赖链的第 3 层') +
    `${WINDOW_TYPE_SELECTOR} {\n${fmt(appThemeOnly)}\n}\n` +
    (bodyRules ? `\n/* body 作用域覆盖 —— 选择器逐字保留,不可并入上面的根块 */\n${bodyRules}\n` : '')
)

// utilities.css —— 命名语义类 + 平台 variant
const grouped = new Map()
for (const r of namedRules) {
  // 保留 @layer:命名类原本在 @layer utilities 里,剥掉会让它们压过所有
  // Tailwind utility(顶层规则优先级高于 layer 内规则),utility 就失去覆盖能力。
  const key = r.wrap.join(' >> ')
  if (!grouped.has(key)) grouped.set(key, [])
  grouped.get(key).push(r)
}
let util = banner('Codex 命名语义类 + 平台 variant', '壳层用到的非 Tailwind 生成类')
// 平台 variant —— 照 Codex 编译产物的选择器逆推,不自创。
// 注意 electron: 实际匹配 browser / chrome-extension / electron 三者,
// 语义是"独立应用窗口"(区别于内嵌 webview),不是"仅 Electron"。
util += `/* 平台 variant —— 选择器形态与 Codex 编译产物一致 */\n`
util += `@custom-variant electron (&:where(:is([data-codex-window-type='browser'],[data-codex-window-type='chrome-extension'],[data-codex-window-type='electron']) &));\n`
util += `@custom-variant browser (&:where([data-codex-window-type='browser'] &));\n`
util += `@custom-variant extension (&:where([data-codex-window-type='extension'] &));\n\n`
for (const [, rules] of grouped) {
  const seen = new Set()
  const inner = rules
    .filter((r) => {
      const k = r.prelude + '|' + r.body
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .map((r) => `${r.prelude} {\n  ${r.body.replace(/;\s*/g, ';\n  ').trim()}\n}`)
    .join('\n\n')
  util += nest(rules[0].wrap, inner) + '\n\n'
}
// 伪类/伪元素变体 —— 交互态,放在 @layer utilities 里保持层叠顺序
if (variantRules.length) {
  util += `/* ${'-'.repeat(70)}\n   交互态变体(:hover / :focus-visible / ::-webkit-scrollbar-*)\n   ${'-'.repeat(70)} */\n\n`
  const seenV = new Set()
  for (const r of variantRules) {
    const k = r.wrap.join('>') + '|' + r.prelude + '|' + r.body
    if (seenV.has(k)) continue
    seenV.add(k)
    const inner = `${r.prelude} {\n  ${r.body.replace(/;\s*/g, ';\n  ').trim()}\n}`
    util += nest(r.wrap.length ? r.wrap : ['@layer utilities'], inner) + '\n\n'
  }
}

util += `/* ${'-'.repeat(70)}\n   自定义 @utility —— 挂在非标准命名空间上,Tailwind 不会自动生成\n   ${'-'.repeat(70)} */\n\n`
for (const [name, body] of [...utilities].sort(([a], [b]) => a.localeCompare(b))) {
  const decls = body
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => `  ${d};`)
    .join('\n')
  util += `@utility ${name} {\n${decls}\n}\n\n`
}

fs.writeFileSync(path.join(OUT, 'utilities.css'), util)

// components.css —— CSS Modules 组件类 + 它们用到的 @keyframes
{
  /**
   * 哈希类名改写成稳定名: _MainContentSurface_1e9gb_32 → codex-MainContentSurface
   *
   * 哈希是 Codex 的构建产物,每次重新构建都可能变。JSX 里硬编码带哈希的类名,
   * Codex 一升级样式就静默失效(类名对不上,不报错)。改写成稳定名后,重跑提取器
   * 只改内容不改名字 —— 升级时 git diff 直接就是"哪些组件样式变了"。
   *
   * 但**不能无条件改写**: 有几个 base 名在不同模块里重复出现(Icon / Root /
   * content / root / Overlay / Placeholder / surface),哈希不同、样式无关。
   * 一律改写会把它们合并成一个类,拿到多份规则的并集 —— 静默的样式污染。
   * 所以只改写 base 名唯一的,重名的保留哈希并在下面报出来由人来定。
   */
  const hashesOf = new Map()
  for (const r of moduleRules) {
    for (const m of r.prelude.matchAll(/\._([A-Za-z][A-Za-z0-9]*)_([a-z0-9]{4,8})_[0-9]+/g)) {
      if (!hashesOf.has(m[1])) hashesOf.set(m[1], new Set())
      hashesOf.get(m[1]).add(m[2])
    }
  }
  const ambiguous = [...hashesOf].filter(([, hs]) => hs.size > 1).map(([n]) => n)
  const stable = (sel) =>
    sel.replace(/\._([A-Za-z][A-Za-z0-9]*)_([a-z0-9]{4,8})_([0-9]+)/g, (whole, name) =>
      ambiguous.includes(name) ? whole : `.codex-${name}`
    )

  let out = banner('Codex 组件级样式', '哈希类名已改写为稳定名 codex-<ComponentName>')
  const used = new Set()
  const seen = new Set()
  for (const r of moduleRules) {
    // 去重键必须带上 wrap: 同一条选择器在 @media/@supports 里外都可能出现,
    // 只按 prelude+body 去重会把其中一份丢掉
    const k = r.wrap.join('>') + '|' + r.prelude + '|' + r.body
    if (seen.has(k)) continue
    seen.add(k)
    for (const m of r.body.matchAll(/animation(?:-name)?\s*:\s*([^;]+)/g)) {
      for (const w of m[1].split(/[\s,]+/)) used.add(w)
    }
    // 必须包回原来的 at-rule 链。之前直接拼 prelude,把 @media (forced-colors:active)
    // 这类包装拍平了 —— 强制对比度下才该生效的 `box-shadow:none` 变成无条件生效,
    // 主内容区那道 hairline 就被压掉了。
    const inner = `${stable(r.prelude)} {\n  ${r.body.replace(/;\s*/g, ';\n  ').trim()}\n}`
    out += nest(r.wrap, inner) + '\n\n'
  }
  // 动画名可能来自命名类(如 vertical-scroll-fade-mask 引用 edge-fade),
  // 不只来自 CSS Modules 规则 —— 只扫后者会漏掉滚动淡出的 keyframes
  for (const r of [...namedRules, ...variantRules, ...utilities.entries()].map((x) =>
    Array.isArray(x) ? { body: x[1] } : x
  )) {
    for (const m of (r.body ?? '').matchAll(/animation(?:-name)?\s*:\s*([^;]+)/g)) {
      for (const w of m[1].split(/[\s,]+/)) used.add(w)
    }
  }
  for (const [name, body] of keyframes) {
    const id = name.replace(/^@keyframes\s+/, '').trim()
    if (!used.has(id)) continue
    out += `${name} {\n${body.replace(/^/gm, '  ')}\n}\n\n`
  }
  fs.writeFileSync(path.join(OUT, 'components.css'), out)

  /*
   * 重名类保留了哈希(见上),但哈希是 Codex 的构建产物,升级后会变。
   * 在 JSX 里硬编码 "_content_19mhu_28" 这种字符串,Codex 一升级就静默失效。
   * 所以额外产出一份映射:JSX 引常量,哈希变了只需重跑提取器,改动集中在这一个文件。
   */
  const hashed = new Set()
  for (const r of moduleRules) {
    for (const m of r.prelude.matchAll(/\._([A-Za-z][A-Za-z0-9]*)_([a-z0-9]{4,8})_([0-9]+)/g)) {
      if (ambiguous.includes(m[1])) hashed.add(`${m[1]}|${m[2]}|${m[0].slice(1)}`)
    }
  }
  const byName = new Map()
  for (const entry of [...hashed].sort()) {
    const [name, hash, cls] = entry.split('|')
    const key = `${name}_${hash}`
    byName.set(key, cls)
  }
  const ts =
    `/* eslint-disable */\n` +
    `// 由 scripts/extract-codex-tokens.mjs 生成 —— 请勿手改。\n` +
    `//\n` +
    `// 这里只收录**重名**的 CSS Modules 类(base 名在多个模块里重复出现,\n` +
    `// 无法安全改写成稳定名,只能保留哈希)。键名形如 <组件名>_<哈希>。\n` +
    `// 其余类已改写为 codex-<ComponentName>,可以直接写字符串。\n\n` +
    `export const CODEX_CLASS = {\n` +
    [...byName].map(([k, v]) => `  ${k}: '${v}',`).join('\n') +
    `\n} as const\n`
  fs.writeFileSync(path.join(OUT, 'class-map.ts'), ts)
  console.log(`重名类映射                   ${byName.size} 项 → codex/class-map.ts`)
  if (ambiguous.length) {
    console.log(
      `  重名未改写(保留哈希,避免样式合并): ${ambiguous.sort().join(', ')}`
    )
  }
  console.log(`CSS Modules 组件规则         ${seen.size} 条 + ${[...keyframes.keys()].filter((n) => used.has(n.replace(/^@keyframes\s+/, '').trim())).length} 个 keyframes`)
}

// highlight.css —— .hljs-* 语法高亮
{
  const seen = new Set()
  const byScope = new Map()
  for (const r of hljsRules) {
    // 保留 @layer:命名类原本在 @layer utilities 里,剥掉会让它们压过所有
  // Tailwind utility(顶层规则优先级高于 layer 内规则),utility 就失去覆盖能力。
  const key = r.wrap.join(' >> ')
    const dedupe = key + '|' + r.prelude + '|' + r.body
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    if (!byScope.has(key)) byScope.set(key, [])
    byScope.get(key).push(r)
  }
  let out = banner('Codex 语法高亮', '.hljs-* —— 配色出自 Codex token,与外壳同源')
  for (const [, rules] of byScope) {
    const inner = rules
      .map((r) => `${r.prelude} {\n  ${r.body.replace(/;\s*/g, ';\n  ').trim()}\n}`)
      .join('\n\n')
    out += nest(rules[0].wrap, inner) + '\n\n'
  }
  fs.writeFileSync(path.join(OUT, 'highlight.css'), out)
}

// ---------- 报告 ----------
const bucket = (map, re) => [...map.keys()].filter((k) => re.test(k)).length
console.log(`Codex :root 全量 token       ${themeAll.size}`)
console.log(`  剔除 Tailwind 默认后保留   ${themeCustom.size}`)
console.log(`    --color-*                ${bucket(themeCustom, /^--color-/)}`)
console.log(`    --text-* / --font-*      ${bucket(themeCustom, /^--(text|font|leading|tracking)-/)}`)
console.log(`    --spacing-* / --height-* ${bucket(themeCustom, /^--(spacing|height|width|container)-/)}`)
console.log(`    --radius-*               ${bucket(themeCustom, /^--radius-/)}`)
console.log(`    --ease-* / --duration-*  ${bucket(themeCustom, /^--(ease|duration|animate)-/)}`)
console.log(`    --shadow-* / --blur-*    ${bucket(themeCustom, /^--(shadow|blur|inset-shadow|drop-shadow)-/)}`)
console.log(`语义层 .electron-light        ${light.size}`)
console.log(`--vscode-* 合成层           ${appTheme.size} 项,剔除 @theme 重复后 ${[...appTheme].filter(([k]) => !themeCustom.has(k)).length} 项`)
console.log(`语义层 .electron-dark         ${dark.size}`)
console.log(`命名语义类规则               ${namedRules.length} 条 → ${grouped.size} 个作用域`)
console.log(`自定义 @utility              ${utilities.size} 个`)
console.log(`.hljs-* 高亮规则             ${hljsRules.length} 条`)
console.log(`\n产出目录: ${OUT}`)
