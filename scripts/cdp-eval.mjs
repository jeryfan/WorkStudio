#!/usr/bin/env node
// 通过 CDP 在指定调试端口的页面里执行表达式,打印结果。
// 用法: node cdp-eval.mjs <port> <url-match> <expression>
// 用法: node cdp-eval.mjs <port> <url-match> <expression>
// 依赖: 无(Node 22+ 内置 WebSocket)
const [port, urlMatch, expr] = process.argv.slice(2)
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())
const page = targets.find((t) => t.type === 'page' && t.url.includes(urlMatch))
if (!page) {
  console.error('no page matching', urlMatch, targets.map((t) => `${t.type} ${t.url}`).join(' | '))
  process.exit(1)
}
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
let id = 0
const pending = new Map()
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const mid = ++id
    pending.set(mid, { resolve, reject })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString())
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
})
await new Promise((r) => ws.addEventListener('open', r))
const result = await send('Runtime.evaluate', {
  expression: expr,
  returnByValue: true,
  awaitPromise: true
})
if (result.exceptionDetails) {
  console.error('EXCEPTION:', JSON.stringify(result.exceptionDetails).slice(0, 2000))
} else {
  console.log(typeof result.result.value === 'string' ? result.result.value : JSON.stringify(result.result.value, null, 1))
}
ws.close()
process.exit(0)
