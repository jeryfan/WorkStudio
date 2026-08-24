#!/usr/bin/env node
/**
 * 从 Codex bundle 提取 `MV` 文件类型图标(app-initial 的 NV 映射,27 种),
 * 生成 React TSX 组件到 src/renderer/src/components/icons/fileTypes/。
 *
 * bundle 里每个图标是 `(VAR = (e) => (0, XX.jsx)('svg', {…, …e, children: …}))`
 * 形式。本脚本:
 *   1. 定位变量定义,括号配对切出完整箭头函数表达式
 *   2. 把 `(0, XX.jsx/jsxs)` 替换成桩函数后 eval,得到可序列化的元素树
 *   3. 序列化成 TSX(props 展开 `{...props}` 等价 Codex 的 `...e`)
 *
 * 生成后需人工过目一遍 diff。组件名为推断名(bundle 压缩名无原义),
 * NV 的 key 才是 Codex 语义权威。
 */
import fs from 'node:fs'
import path from 'node:path'

const BUNDLE = 'reverse/src/assets/app-initial-Biw83Aiz.js'
const OUT_DIR = 'src/renderer/src/components/icons/fileTypes'

/** NV key → bundle 变量名(yaml 复用 file) */
const NV = {
  artifactDocument: 'SZi',
  code: 'bZi',
  document: 'FZi',
  file: 'mL',
  css: 'zZi',
  cplusplus: '_Zi',
  folder: 'EV',
  html: 'GZi',
  java: 'YZi',
  javascript: 'QZi',
  image: 'OV',
  yaml: 'mL',
  json: 'tQi',
  notebook: 'iQi',
  pdf: 'TZi',
  php: 'sQi',
  python: 'uQi',
  react: 'pQi',
  rust: 'gQi',
  shell: 'MZi',
  skill: 'bQi',
  spreadsheet: 'kZi',
  build: 'HZi',
  presentation: 'DZi',
  hashes: 'mZi',
  terminal: 'qB',
  typescript: 'CQi',
  toml: 'AV'
}

const src = fs.readFileSync(BUNDLE, 'utf8')

/** 从 startIdx(指向 `(` 即赋值表达式开头)做括号配对,返回表达式文本(不含外层括号) */
function extractBalanced(startIdx) {
  let depth = 0
  let i = startIdx
  let inStr = null // ' " `
  for (; i < src.length; i++) {
    const c = src[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === inStr) inStr = null
      continue
    }
    if (c === '`' || c === `'` || c === '"') {
      inStr = c
      continue
    }
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return src.slice(startIdx + 1, i)
    }
  }
  throw new Error('unbalanced')
}

/** 把 `(0, XXX.jsx)(a, b)` / `(0, XXX.jsxs)(a, b)` 替换成 JSX(a,b)/JSXS(a,b) */
function stubJsxCalls(expr) {
  return expr.replace(/\(0,\s*[A-Za-z$_][\w$]*\.(jsx|jsxs)\)\(/g, (_, kind) => (kind === 'jsx' ? 'JSX(' : 'JSXS('))
}

function makeElement(tag, props) {
  const { children, ...rest } = props ?? {}
  return { tag, props: rest, children: children ?? null }
}

function evalIconFn(callExpr) {
  const JSX = (tag, props) => makeElement(tag, props)
  const JSXS = (tag, props) => makeElement(tag, props)
  // callExpr 是调用的参数表(含外层括号);拼回箭头函数,e 是展开进来的 props
  // eslint-disable-next-line no-eval
  const fn = eval(`((e) => JSX${callExpr})`)
  return fn
}

/** svg 属性名 → React 属性名 */
const ATTR_RENAME = {
  class: 'className',
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'fill-rule': 'fillRule',
  'clip-rule': 'clipRule',
  'xlink:href': 'xlinkHref',
  'xmlns:xlink': 'xmlnsXlink',
  'stop-color': 'stopColor',
  'gradient-units': 'gradientUnits',
  'clip-path': 'clipPath'
}

function serializeNode(node, indent) {
  const pad = '  '.repeat(indent)
  if (node == null || node === false) return null
  if (typeof node === 'string') return pad + JSON.stringify(node)
  const { tag, props, children } = node
  const attrs = []
  for (const [k, v] of Object.entries(props)) {
    const name = ATTR_RENAME[k] ?? k
    if (typeof v === 'string') attrs.push(`${name}=${JSON.stringify(v)}`)
    else attrs.push(`${name}={${JSON.stringify(v)}}`)
  }
  const attrStr = attrs.length ? ' ' + attrs.join(' ') : ''
  const kids = (Array.isArray(children) ? children : children == null ? [] : [children])
    .map((c) => serializeNode(c, indent + 1))
    .filter(Boolean)
  if (kids.length === 0) return `${pad}<${tag}${attrStr} />`
  return `${pad}<${tag}${attrStr}>\n${kids.join('\n')}\n${pad}</${tag}>`
}

const HEADER = `/**
 * Codex 文件类型图标(bundle NV 映射,键名权威;组件名为推断名)。
 * 由 scripts/extract-file-type-icons.mjs 从 app-initial bundle 提取,请勿手改路径数据。
 */
`

function pascal(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .split(/[\s]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}

const seen = new Map() // 变量名 → 组件名(去重:yaml=file 等)
const indexLines = []
const mapEntries = []

for (const [key, varName] of Object.entries(NV)) {
  if (!seen.has(varName)) {
    // 定位定义:`(VAR = (e) =>`
    const re = new RegExp(`\\(${varName.replace(/\$/g, '\\$')} = \\(e\\) =>`)
    const m = re.exec(src)
    if (!m) throw new Error(`未找到 ${varName} 定义`)
    // m.index 指向 `(`;赋值表达式的整体是 `(VAR = (e) => <body>)`,body 从箭头后开始
    const arrowIdx = src.indexOf('=>', m.index)
    // body 形如 `(0, X.jsx)('svg', {...})`:定位 `.jsx)(` 的最后一对 `)(`,
    // 从调用参数的 `(` 开始配对才是完整表达式
    const callMatch = /\.(?:jsx|jsxs)\)\(/.exec(src.slice(arrowIdx, arrowIdx + 80))
    if (!callMatch) throw new Error(`${varName} 未找到 jsx 调用`)
    const bodyStart = arrowIdx + callMatch.index + callMatch[0].length - 1 // 指向参数表的 `(`
    const bodyExpr = (() => {
      let depth = 0
      let inStr = null
      for (let i = bodyStart; i < src.length; i++) {
        const c = src[i]
        if (inStr) {
          if (c === '\\') i++
          else if (c === inStr) inStr = null
          continue
        }
        if (c === '`' || c === `'` || c === '"') {
          inStr = c
          continue
        }
        if (c === '(') depth++
        else if (c === ')') {
          depth--
          if (depth === 0) return src.slice(bodyStart, i + 1)
        }
      }
      throw new Error('body unbalanced')
    })()
    const fn = evalIconFn(stubJsxCalls(bodyExpr))
    const el = fn({}) // 传入空 props(...e 展开为空)
    const svg = serializeNode(el, 1)
    const componentName = `${pascal(key)}FileIcon`
    seen.set(varName, componentName)
    const file = `${HEADER}export function ${componentName}(props: React.SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
${svg.replace(/^ {2}/gm, '    ').replace('>' , ' {...props}>', 1)}
  )
}
`
    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(path.join(OUT_DIR, `${componentName}.tsx`), file)
    indexLines.push(`export { ${componentName} } from './${componentName}'`)
  }
  mapEntries.push(`  ${JSON.stringify(key)}: ${seen.get(varName)}`)
}

const mapFile = `${HEADER}import type { ComponentType, SVGProps } from 'react'
${[...new Set([...seen.values()])].map((n) => `import { ${n} } from './${n}'`).join('\n')}

type FileTypeIconComponent = ComponentType<SVGProps<SVGSVGElement>>

/** Codex \`NV\`:图标 key → 组件 */
export const FILE_TYPE_ICONS: Record<string, FileTypeIconComponent> = {
${mapEntries.join(',\n')}
}
`
fs.writeFileSync(path.join(OUT_DIR, 'fileTypeIcons.ts'), mapFile)
fs.writeFileSync(path.join(OUT_DIR, 'index.ts'), indexLines.join('\n') + '\n')
console.log(`提取完成:${seen.size} 个组件`)
