#!/usr/bin/env node
// 通过 CDP 截屏: node cdp-screenshot.mjs <port> <url-match> <outfile>
const [port, urlMatch, outfile] = process.argv.slice(2)
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())
const page = targets.find((t) => t.type === 'page' && t.url.includes(urlMatch))
if (!page) process.exit(1)
const ws = new WebSocket(page.webSocketDebuggerUrl)
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
await send('Page.enable')
const shot = await send('Page.captureScreenshot', { format: 'png' })
const { writeFileSync } = await import('node:fs')
writeFileSync(outfile, Buffer.from(shot.data, 'base64'))
console.log('saved', outfile)
process.exit(0)
