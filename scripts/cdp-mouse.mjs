#!/usr/bin/env node
/**
 * 在 WorkStudio 渲染进程里派发**真实**鼠标/键盘事件,然后取一段 JS 的结果。
 *
 * 为什么不用 element.dispatchEvent:合成事件过不了带延时/指针捕获的交互逻辑
 * (悬浮卡片的延时打开、resize 的 setPointerCapture 都不响应)。CDP 的
 * Input.dispatchMouseEvent 走的是浏览器输入管线,和真人操作等价。
 *
 *   node scripts/cdp-mouse.mjs <脚本.json>
 *
 * 脚本格式:{ steps: [...], probe: "<返回值的 JS 表达式>" }
 *   步骤: {move:[x,y]} {click:[x,y]} {key:"Escape"} {wait:500}
 *         {evalFind:"<返回 {x,y} 的 JS>"} —— 动态定位后移动过去
 */
import fs from 'node:fs'
import process from 'node:process'

const PORT = process.env.CDP_PORT ?? '9333'
const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))

const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json())
// 同 cdp-eval:多 page target 时用 CDP_URL_FILTER 锁定(如 Codex 用 8214)
const filter = process.env.CDP_URL_FILTER
const pages = targets.filter((t) => t.type === 'page')
const page = filter ? pages.find((t) => t.url.includes(filter)) : pages[0]
if (!page) {
  console.error('没有 page target')
  process.exit(1)
}

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

let cursor = { x: 0, y: 0 }
const mouse = async (type, x, y, button = 'none', clickCount = 0) =>
  send('Input.dispatchMouseEvent', { type, x, y, button, clickCount, buttons: button === 'left' && type !== 'mouseReleased' ? 1 : 0 })

for (const step of plan.steps) {
  if (step.wait) { await sleep(step.wait); continue }
  if (step.key) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: step.key, code: step.key })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: step.key, code: step.key })
    continue
  }
  if (step.evalFind) {
    const pt = await evaluate(step.evalFind)
    if (!pt) { console.error('evalFind 未返回坐标:', step.evalFind.slice(0, 60)); continue }
    cursor = pt
    await mouse('mouseMoved', pt.x, pt.y)
    continue
  }
  if (step.clickFind) {
    // 定位并直接点击(省去手工抄坐标);未找到则报错并跳过
    const pt = await evaluate(step.clickFind)
    if (!pt) { console.error('clickFind 未返回坐标:', step.clickFind.slice(0, 60)); continue }
    await mouse('mouseMoved', pt.x, pt.y)
    await sleep(40)
    await mouse('mousePressed', pt.x, pt.y, 'left', 1)
    await mouse('mouseReleased', pt.x, pt.y, 'left', 1)
    cursor = pt
    continue
  }
  if (step.move) {
    const [x, y] = step.move
    // 分几步移动,让 mouseenter/leave 链正常触发
    for (let i = 1; i <= 4; i++) {
      await mouse('mouseMoved', cursor.x + ((x - cursor.x) * i) / 4, cursor.y + ((y - cursor.y) * i) / 4)
      await sleep(20)
    }
    cursor = { x, y }
    continue
  }
  if (step.click) {
    const [x, y] = step.click
    await mouse('mouseMoved', x, y)
    await sleep(40)
    await mouse('mousePressed', x, y, 'left', 1)
    await mouse('mouseReleased', x, y, 'left', 1)
    cursor = { x, y }
  }
}

console.log(JSON.stringify(await evaluate(plan.probe), null, 2))
ws.close()
