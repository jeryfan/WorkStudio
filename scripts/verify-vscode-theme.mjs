#!/usr/bin/env node
/**
 * 校验生成的 VSCode 主题能被 shiki 正确消费。
 *
 * 这一步不是形式主义：tokens.css 出错会当场看出来（颜色不对），但主题 JSON
 * 出错的表现是"代码块高亮悄悄退化成一片前景色"——因为 shiki 找不到匹配的
 * TextMate 规则时不会报错，只会返回默认色。所以这里断言几个有代表性的
 * token 必须各自拿到**不同**的颜色。
 *
 *   node scripts/verify-vscode-theme.mjs
 */
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const THEMES = ['dark', 'light', 'hc-dark', 'hc-light']
const DIR = resolve('src/renderer/src/chat/theme/vscode-themes')

const SAMPLE = `const answer = 42
function greet(name: string): void {
  // comment
}`

/** 这些 token 各自代表一类 TextMate scope，颜色必须互不相同 */
const PROBES = ['const', 'answer', '42', 'greet', 'string', '// comment']

let failed = 0

for (const name of THEMES) {
  const path = resolve(DIR, `${name}.json`)
  if (!existsSync(path)) {
    console.error(`✗ ${name}: 主题文件不存在 —— 先跑 npm run tokens:gen`)
    failed++
    continue
  }

  const theme = JSON.parse(readFileSync(path, 'utf8'))
  // 先记下来：createHighlighterCore 会就地规范化主题对象，往 tokenColors 里
  // 追加一条兜底规则，加载后再读长度会多 1
  const ruleCount = theme.tokenColors.length
  const hl = await createHighlighterCore({
    themes: [theme],
    langs: [import('@shikijs/langs/typescript')],
    engine: createJavaScriptRegexEngine()
  })

  const result = hl.codeToTokens(SAMPLE, { lang: 'typescript', theme: name })
  const flat = result.tokens.flat()
  const colorOf = (text) => flat.find((t) => t.content.trim() === text)?.color

  const found = PROBES.map((p) => [p, colorOf(p)])
  const missing = found.filter(([, c]) => !c)
  const distinct = new Set(found.map(([, c]) => c).filter(Boolean))

  if (missing.length > 0) {
    console.error(`✗ ${name}: 取不到 token ${missing.map(([p]) => p).join(', ')}`)
    failed++
    continue
  }

  // 高对比度主题会刻意把多类 token 合并成同色，门槛放低但不能只剩一色
  const min = name.startsWith('hc-') ? 2 : 5
  if (distinct.size < min) {
    console.error(
      `✗ ${name}: ${PROBES.length} 个探针只解出 ${distinct.size} 种颜色（要求 ≥ ${min}）—— ` +
        `多半是 tokenColors 没合并进来，高亮已退化`
    )
    failed++
    continue
  }

  console.log(
    `✓ ${name.padEnd(9)} tokenColors ${String(ruleCount).padStart(3)} 条 / ` +
      `探针 ${distinct.size} 种颜色 / bg ${result.bg}`
  )
}

if (failed > 0) {
  console.error(`\n${failed} 个主题未通过。`)
  process.exit(1)
}
console.log('\n全部通过。')
