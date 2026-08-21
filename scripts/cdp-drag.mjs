#!/usr/bin/env node
/**
 * 在 WorkStudio 里做一次真实拖拽,并报告拖拽中的 DOM 形态与最终顺序。
 * 用于验证 dnd-kit 的 DragOverlay 是否与 Codex 同形。
 *
 *   node scripts/cdp-drag.mjs <起始选择器> <dy>
 */
import process from 'node:process'
const PORT = process.env.CDP_PORT ?? '9333'
const [selector, dyArg] = process.argv.slice(2)
const dy = Number(dyArg ?? 40)

const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json())
const page = targets.find((t) => t.type === 'page')
if (!page) { console.error('无 page target'); process.exit(1) }

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data); const p = pending.get(m.id)
  if (!p) return; pending.delete(m.id)
  m.error ? p.rej(new Error(m.error.message)) : p.res(m.result)
})
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params }))
})
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const mouse = (type, x, y, button = 'none') =>
  send('Input.dispatchMouseEvent', { type, x, y, button, clickCount: button === 'none' ? 0 : 1, buttons: button === 'left' && type !== 'mouseReleased' ? 1 : 0 })

const order = () => evaluate(`[...document.querySelectorAll('[data-app-action-sidebar-project-row]')].map(r=>r.getAttribute('data-app-action-sidebar-project-label'))`)
const before = await order()

const box = await evaluate(`(() => { const e=document.querySelector('${selector}'); if(!e) return null; const b=e.getBoundingClientRect(); return {x:Math.round(b.left+b.width/2), y:Math.round(b.top+b.height/2)} })()`)
if (!box) { console.error('未找到起始元素'); process.exit(1) }

await mouse('mouseMoved', box.x, box.y)
await mouse('mousePressed', box.x, box.y, 'left')
for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', box.x, box.y + (dy * i) / 6, 'left'); await sleep(50) }
await sleep(250)

const mid = await evaluate(`(() => {
  const overlays = [...document.querySelectorAll('body > *')].filter(el => /fixed/.test(getComputedStyle(el).position) && el.getBoundingClientRect().height > 10)
    .map(el => ({ cls:(el.getAttribute('class')||'').slice(0,50), wh: Math.round(el.getBoundingClientRect().width)+'×'+Math.round(el.getBoundingClientRect().height), txt:(el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,22), transform: getComputedStyle(el).transform.slice(0,36) }))
  const live = document.querySelector('[aria-live]')
  return { body层浮层: overlays, aria播报: live ? live.textContent.slice(0,60) : null }
})()`)

await mouse('mouseReleased', box.x, box.y + dy, 'left')
await sleep(500)
const after = await order()
console.log(JSON.stringify({ 拖前: before, 拖后: after, 顺序已变: JSON.stringify(before) !== JSON.stringify(after), 拖拽中: mid }, null, 2))
ws.close()
