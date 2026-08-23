#!/usr/bin/env node
/**
 * 从 Codex 的 `app-initial` 产物里提取**会话活动行**用到的图标,生成 React 组件。
 *
 * 与 `extract-chat-icons.mjs` 的区别:那个从 prototype HTML 里抠内联 `<svg>`,
 * 这里的源是打包后的 JS —— Codex 的图标是
 * `X = (e) => jsx('svg', {width:20, height:20, viewBox:'0 0 20 20', ..., ...e,
 *  children: jsx('path', {d:'…', fill:'currentColor'})})`
 * 这种 JSX 调用形态,所以要解析对象字面量而不是标签文本。
 *
 * 为什么不手抄:这些 path 有的两千多个字符,手抄错一位不会报错,只是形状微妙地歪掉
 * —— 那种差异在界面上根本归因不了。脚本生成 + 人工核对形状。
 *
 * 图标与条目类型的对应关系来自 `subagent-activity-chip-group-DtZM0hSI.js` 里的
 * `Fg(item)`(见 docs/codex-alignment-audit.md 的映射表)。
 *
 *   node scripts/extract-activity-icons.mjs
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE = path.join(root, 'reverse/src/assets/app-initial-Biw83Aiz.js')
const CHUNKS = path.join(root, 'reverse/webview-dump/assets')
const outDir = path.join(root, 'src/renderer/src/components/icons/activity')

/**
 * 要提的图标。`exportName` 是 app-initial 的**导出名**(不是局部名):
 * 局部名每次打包都会变,导出名跟着 import 语句走,稳定得多。
 */
const ICONS = [
  {
    name: 'ActivityTerminalIcon',
    exportName: 'SK',
    doc: '命令执行(exec)—— 圆角方框里一个提示符与一条下划线。Codex `Fg` 的 exec 兜底分支'
  },
  {
    name: 'ActivityPatchIcon',
    exportName: 'AP',
    doc: '文件改动(patch)—— 一支笔。注意与 composer 的 EditIcon **不是**同一个(那个 21 宽,这个 20 宽)'
  },
  {
    name: 'ActivityListFilesIcon',
    exportName: '_G',
    doc: '列目录(exec + parsedCmd.type === "list_files")—— 一个文件夹'
  },
  {
    name: 'ActivityInterruptedIcon',
    exportName: 'Vyt',
    doc: '被中断(exec + executionStatus === "interrupted")—— 一个圆角实心方块(停止)'
  },
  {
    name: 'ActivitySystemErrorIcon',
    exportName: 'Vet',
    doc: '系统错误(system-error)—— 圆圈里一个感叹号'
  },
  {
    name: 'CirclePendingIcon',
    exportName: 'um',
    doc: '计划步骤:未开始 —— 空心圆'
  },
  {
    name: 'CircleCheckIcon',
    exportName: 'h8',
    doc: '计划步骤:已完成 —— 圆圈里一个勾'
  },
  {
    name: 'CircleXIcon',
    exportName: 'AA',
    doc: '失败/取消 —— 圆圈里一个叉'
  }
]

/** 从 lazy chunk 里提的(这些不在 app-initial 的导出面上) */
const CHUNK_ICONS = [
  {
    name: 'ActivityReadFileIcon',
    file: 'book-open-kevPl-ms.js',
    doc: '读文件(exec + parsedCmd.type === "read")—— 一本翻开的书'
  }
]

/** 在共享 chunk 里就地定义、没有导出名的:按局部变量名从该 chunk 提 */
const LOCAL_ICONS = [
  {
    name: 'ActivityCompactionIcon',
    file: 'subagent-activity-chip-group-DtZM0hSI.js',
    local: 'fg',
    doc: '上下文压缩(context-compaction)—— 两条带端点的横线向中间收'
  },
  {
    name: 'ActivityStreamErrorIcon',
    file: 'subagent-activity-chip-group-DtZM0hSI.js',
    local: 'vg',
    doc: '流中断(stream-error)—— wifi 弧线。Codex 用连接图标而不是错误图标表达断流'
  }
]

const bundle = fs.readFileSync(BUNDLE, 'utf8')

/** 导出名 → 局部名。取**最后**一处映射:前面可能撞上无关的 `x as y` */
function localFor(src, exportName) {
  const re = new RegExp(`\\b([A-Za-z_$][\\w$]*)\\s+as\\s+${esc(exportName)}(?=[,\\s}\\n])`, 'g')
  let last = null
  for (const m of src.matchAll(re)) last = m[1]
  if (!last) throw new Error(`no export mapping for ${exportName}`)
  return last
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 取 `local = (e) => jsx('svg', {...})` 里那个 **jsx 调用**的实参区。
 *
 * 不能简单地"取箭头后第一个配平括号":产物里是 `(0, ns.jsx)(\`svg\`, {...})`,
 * 第一个括号是 `(0, ns.jsx)` 这个 sequence-expression,它立刻就配平了。
 * 要跳到 `.jsx(` / `.jsxs(` 的那个左括号再开始数。
 */
function arrowBody(src, local) {
  const m = new RegExp(`\\b${esc(local)}\\s*=\\s*\\(?e\\)?\\s*=>`).exec(src)
  if (!m) throw new Error(`definition not found: ${local}`)
  const call = /\.jsxs?\)?\s*\(/.exec(src.slice(m.index))
  if (!call) throw new Error(`jsx call not found after ${local}`)
  let i = m.index + call.index + call[0].length - 1
  let depth = 0
  for (let j = i; j < src.length; j++) {
    const c = src[j]
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return src.slice(i, j + 1)
    } else if (c === '`' || c === '"' || c === "'") {
      // 跳过字符串:path 的 d 里有括号(arc 命令)会把配平算错
      const quote = c
      j++
      while (j < src.length && src[j] !== quote) {
        if (src[j] === '\\') j++
        j++
      }
    }
  }
  throw new Error(`unbalanced call for ${local}`)
}

/** `svg` 的属性 —— 只取形状相关的那几个,className/aria 由组件自己给 */
function svgAttrs(body) {
  const pick = (k, re) => {
    const m = re.exec(body)
    return m ? [k, m[1]] : null
  }
  return [
    pick('width', /width:\s*(\d+)/),
    pick('height', /height:\s*(\d+)/),
    pick('viewBox', /viewBox:\s*`([^`]+)`/),
    pick('fill', /\bfill:\s*`([^`]+)`,\s*\n?\s*xmlns/),
    // 少数图标带 `data-rtl-flip`(RTL 语言下镜像),它属于图标本身,不能丢
    /"data-rtl-flip"/.test(body) ? ['data-rtl-flip', ''] : null
  ].filter(Boolean)
}

/** 逐个 `jsx('path', {...})` 抽出属性 */
function paths(body) {
  const out = []
  const re = /jsx\)\(`path`,\s*\{/g
  while (re.exec(body) != null) {
    // 找到这个对象字面量的收尾
    let depth = 1
    let i = re.lastIndex
    for (; i < body.length; i++) {
      const c = body[i]
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) break
      } else if (c === '`') {
        i++
        while (i < body.length && body[i] !== '`') i++
      }
    }
    const obj = body.slice(re.lastIndex, i)
    const attrs = []
    const d = /\bd:\s*`([^`]+)`/.exec(obj)
    const fill = /\bfill:\s*`([^`]+)`/.exec(obj)
    const fr = /fillRule:\s*`([^`]+)`/.exec(obj)
    const cr = /clipRule:\s*`([^`]+)`/.exec(obj)
    if (fr) attrs.push(['fillRule', fr[1]])
    if (cr) attrs.push(['clipRule', cr[1]])
    if (d) attrs.push(['d', d[1]])
    if (fill) attrs.push(['fill', fill[1]])
    if (!d) throw new Error('path without d')
    out.push(attrs)
    re.lastIndex = i
  }
  if (out.length === 0) throw new Error('no paths found')
  return out
}

function component({ name, doc }, body) {
  const attrs = svgAttrs(body)
    .map(([k, v]) => `      ${k}="${v}"`)
    .join('\n')
  const children = paths(body)
    .map((attrList) => {
      const inner = attrList.map(([k, v]) => `        ${k}="${v}"`).join('\n')
      return `      <path\n${inner}\n      />`
    })
    .join('\n')
  return `import type { IconProps } from '../types'

/** ${doc} */
export function ${name}({ className, 'aria-hidden': ariaHidden }: IconProps): React.JSX.Element {
  return (
    <svg
${attrs}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden={ariaHidden}
    >
${children}
    </svg>
  )
}
`
}

fs.mkdirSync(outDir, { recursive: true })
const written = []

for (const icon of ICONS) {
  const body = arrowBody(bundle, localFor(bundle, icon.exportName))
  fs.writeFileSync(path.join(outDir, `${icon.name}.tsx`), component(icon, body))
  written.push(icon.name)
}

for (const icon of CHUNK_ICONS) {
  const src = fs.readFileSync(path.join(CHUNKS, icon.file), 'utf8')
  // 这些 chunk 只导出一个图标,直接找唯一的 `= e=>(0,x.jsx)(`svg`` 形态
  const m = /([A-Za-z_$][\w$]*)\s*=\s*\(?e\)?\s*=>\s*\(0,\s*[\w$]+\.jsxs?\)\(`svg`/.exec(src)
  if (!m) throw new Error(`svg arrow not found in ${icon.file}`)
  const body = arrowBody(src, m[1])
  fs.writeFileSync(path.join(outDir, `${icon.name}.tsx`), component(icon, body))
  written.push(icon.name)
}

for (const icon of LOCAL_ICONS) {
  const src = fs.readFileSync(path.join(CHUNKS, icon.file), 'utf8')
  const body = arrowBody(src, icon.local)
  fs.writeFileSync(path.join(outDir, `${icon.name}.tsx`), component(icon, body))
  written.push(icon.name)
}

// 生成的代码要过项目的 prettier —— 否则每次重跑都在 lint 里留一屏 warning,
// 真问题会被淹掉。
try {
  const files = fs
    .readdirSync(outDir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => path.join(outDir, f))
  execFileSync('npx', ['prettier', '--write', ...files], { cwd: root, stdio: 'ignore' })
} catch {
  console.warn('prettier 没跑成功,生成的文件可能不符合格式规范')
}

const index = `/**
 * 会话活动行的图标 —— 由 scripts/extract-activity-icons.mjs 从 Codex 产物生成。
 * 不要手改:改了下次重跑会被覆盖。要换图标请改脚本里的映射表。
 *
 * 用法固定是 \`<XxxIcon aria-hidden className="icon-xs shrink-0 text-token-conversation-body" />\`
 * —— Codex 里这个类名串写死在 \`Fg\` 的常量 \`Lg\` 上,所有活动行图标共用。
 */
${written
  .slice()
  .sort()
  .map((n) => `export { ${n} } from './${n}'`)
  .join('\n')}
`
fs.writeFileSync(path.join(outDir, 'index.ts'), index)
console.log(`活动行图标 ${written.length} 个 → ${path.relative(root, outDir)}`)
for (const n of written.slice().sort()) console.log(`  ${n}`)
