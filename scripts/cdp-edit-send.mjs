#!/usr/bin/env node
// 编辑态里全选+改写+点 Send,然后观察 turn 列表
const PORT = '9333'
const newText = process.argv[2] ?? 'echo 编辑后的消息'
const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json())
const page = targets.find((t) => t.type === 'page' && t.url.includes('5173'))
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data)
  const p = pending.get(msg.id)
  if (!p) return
  pending.delete(msg.id)
  msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result)
})
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.subtype === 'error') throw new Error(r.result.description)
  return r.result?.value
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 聚焦编辑器 + 全选(用 ProseMirror 命令比 Cmd+A 可靠:cdp 合成按键的 modifier 链在 Electron 里不稳)
await evaluate(`(() => {
  const ed = document.querySelector('[data-local-conversation-user-anchor] .ProseMirror')
  ed.focus()
  // PM 的 selectAll:用文本整段选中
  const view = ed.pmView ?? ed._pmView
  return !!ed
})()`)
// keydown meta+a(CDP 原生修饰键)
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4 })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 4 })
await sleep(200)
await send('Input.insertText', { text: newText })
await sleep(300)
console.log('editor now:', await evaluate(`document.querySelector('[data-local-conversation-user-anchor] .ProseMirror')?.textContent`))

// 点 Send
const pt = await evaluate(`(() => { const b = [...document.querySelectorAll('[data-local-conversation-user-anchor] form button')].find((x) => (x.textContent || '').trim() === 'Send'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.result.value.x, y: pt.result.value.y, button: 'none' })
await sleep(50)
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.result.value.x, y: pt.result.value.y, button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.result.value.x, y: pt.result.value.y, button: 'left', clickCount: 1 })

for (let i = 0; i < 10; i++) {
  await sleep(1500)
  console.log(`--- t+${(i + 1) * 1.5}s ---`, await evaluate(`(() => { const turns = [...document.querySelectorAll('[data-turn-key]')]; const t = turns[turns.length - 1]; return JSON.stringify({ turns: turns.length, lastText: (t?.textContent || '').replace(/\\s+/g, ' ').slice(0, 120) }) })()`))
}
ws.close()
process.exit(0)
