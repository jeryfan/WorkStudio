#!/usr/bin/env node
/**
 * 在运行中的 WorkStudio 渲染进程里执行一段 JS,取回结果。
 *
 * 样式对齐必须拿计算样式和上游逐项比数值 —— 截图只能看出"差不少",
 * 看不出差在哪个 token。dev 下主进程会开 CDP 端口(见 src/main/index.ts)。
 *
 *   node scripts/cdp-eval.mjs <js 文件路径>   # 表达式需返回 JSON 可序列化的值
 */
import fs from 'node:fs'
import process from 'node:process'

const PORT = process.env.CDP_PORT ?? '9333'
const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json())
const page = targets.find((t) => t.type === 'page')
if (!page) {
  console.error('没有 page target —— 应用没在 dev 模式下运行?')
  process.exit(1)
}

const expression = fs.readFileSync(process.argv[2], 'utf8')
const ws = new WebSocket(page.webSocketDebuggerUrl)

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})

const result = await new Promise((resolve, reject) => {
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id !== 1) return
    if (msg.error) return reject(new Error(msg.error.message))
    const r = msg.result?.result
    if (r?.subtype === 'error') return reject(new Error(r.description))
    resolve(r?.value)
  })
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true }
    })
  )
})

console.log(JSON.stringify(result, null, 2))
ws.close()
