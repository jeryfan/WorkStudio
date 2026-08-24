#!/usr/bin/env node
// 收集 10s 内的 console/异常,期间在页面里手动触发一次发送路径
const PORT = '9333'
const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json())
const page = targets.find((t) => t.type === 'page' && t.url.includes('5173'))
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); return }
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
    console.log('[console.' + msg.params.type + ']', msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300))
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    console.log('[exception]', JSON.stringify(msg.params.exceptionDetails).slice(0, 500))
  }
})
await send('Runtime.enable')
// 触发一次:输入 + 点 Send
await send('Runtime.evaluate', { expression: `(() => { const ed = document.querySelector('.ProseMirror'); ed.focus(); })()` })
await send('Input.insertText', { text: 'hi' })
await new Promise((r) => setTimeout(r, 300))
const pt = await send('Runtime.evaluate', { expression: `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Send'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`, returnByValue: true })
const { x, y } = pt.result.value
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
await new Promise((r) => setTimeout(r, 9000))
console.log('done')
ws.close()
process.exit(0)
