#!/usr/bin/env node
// 聚焦 composer → insertText → 点 Send 按钮 → 采样
const PORT = process.env.CDP_PORT ?? '9333'
const text = process.argv[2]
const samples = Number(process.argv[3] ?? 25)
const intervalMs = Number(process.argv[4] ?? 1200)

const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json())
const page = targets.find((t) => t.type === 'page' && t.url.includes('5173'))
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.addEventListener('open', res)
  ws.addEventListener('error', rej)
})
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data)
  const p = pending.get(msg.id)
  if (!p) return
  pending.delete(msg.id)
  msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result)
})
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const msgId = ++id
    pending.set(msgId, { res, rej })
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.subtype === 'error') throw new Error(r.result.description)
  return r.result?.value
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const mouse = async (type, x, y, button = 'none', clickCount = 0) =>
  send('Input.dispatchMouseEvent', { type, x, y, button, clickCount, buttons: button === 'left' && type !== 'mouseReleased' ? 1 : 0 })
const clickAt = async (pt) => {
  await mouse('mouseMoved', pt.x, pt.y)
  await sleep(40)
  await mouse('mousePressed', pt.x, pt.y, 'left', 1)
  await mouse('mouseReleased', pt.x, pt.y, 'left', 1)
}

// 点击 composer 输入区(真实点击 = PM 聚焦)
const pt = await evaluate(`(() => { const ed = document.querySelector('.ProseMirror'); const r = ed.getBoundingClientRect(); return { x: r.x + Math.min(80, r.width / 2), y: r.y + r.height / 2 } })()`)
await clickAt(pt)
await sleep(300)
await send('Input.insertText', { text })
await sleep(300)
console.log('typed:', await evaluate(`document.querySelector('.ProseMirror')?.textContent`))

// 点 Send
const sendPt = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Send'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
if (!sendPt) { console.log('no send button'); process.exit(1) }
await clickAt(sendPt)

import fs from 'node:fs'
const probe = fs.readFileSync('/tmp/live-probe.js', 'utf8')
for (let i = 0; i < samples; i++) {
  await sleep(intervalMs)
  console.log(`--- t+${(i + 1) * intervalMs}ms ---`)
  console.log(await evaluate(probe))
}
ws.close()
process.exit(0)
