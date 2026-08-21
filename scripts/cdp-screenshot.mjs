#!/usr/bin/env node
/**
 * 直接截 WorkStudio 渲染进程的画面。
 *
 * 不用 screencapture: 那是截屏幕,靠窗口管理器把目标窗口提到前台 —— 机器上
 * 另有 Electron 应用时会截错(实测把 WorkBuddy 截了回来)。CDP 的
 * Page.captureScreenshot 截的是这个页面本身,不受其它窗口影响。
 *
 *   node scripts/cdp-screenshot.mjs out.png
 */
import fs from 'node:fs'
import process from 'node:process'

const PORT = process.env.CDP_PORT ?? '9333'
const out = process.argv[2] ?? 'shot.png'

const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json())
const page = targets.find((t) => t.type === 'page')
if (!page) {
  console.error('没有 page target —— 应用没在 dev 模式下运行?')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.addEventListener('open', res)
  ws.addEventListener('error', rej)
})

const data = await new Promise((resolve, reject) => {
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id !== 1) return
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result.data)
  })
  ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }))
})

fs.writeFileSync(out, Buffer.from(data, 'base64'))
console.log(`已保存 ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`)
ws.close()
