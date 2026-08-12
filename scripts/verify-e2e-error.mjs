// 临时脚本：在本应用里触发同一个 401，抓重连行与错误卡片的实际渲染
const targets = await (await fetch('http://127.0.0.1:9333/json')).json()
const page = targets.find((t) => t.type === 'page')
if (!page) throw new Error('no page target — 应用是否带 --remote-debugging-port=9333 启动？')

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
await new Promise((r) => ws.addEventListener('open', r))
const evaluate = (fn) =>
  new Promise((resolve) => {
    const n = ++id
    pending.set(n, (m) => {
      if (m.result?.exceptionDetails)
        resolve({ __err: m.result.exceptionDetails.exception?.description })
      else resolve(m.result?.result?.value)
    })
    ws.send(
      JSON.stringify({
        id: n,
        method: 'Runtime.evaluate',
        params: { expression: `(${fn.toString()})()`, awaitPromise: true, returnByValue: true }
      })
    )
  })

// 打开一个会话并发消息
console.log('[1] 打开会话并发送')
console.log(
  JSON.stringify(
    await evaluate(async () => {
      const rows = [...document.querySelectorAll('button, [role=button]')]
      const chat = rows.find((b) => /^(hello|hi|你好|介绍|讲个)/.test(b.textContent.trim()))
      if (chat) chat.click()
      await new Promise((r) => setTimeout(r, 2500))
      const ta = document.querySelector('textarea')
      if (!ta) return { error: 'no textarea' }
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
      setter.call(ta, '你好')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 150))
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      return { sent: true }
    })
  )
)

// 轮询直到出现重连行或错误卡片
console.log('[2] 等待重连 / 错误态…')
let seen = { reconnect: null, error: null }
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 2000))
  const snap = await evaluate(() => {
    const txt = document.body.innerText
    const reconnect =
      /Reconnecting\s*\d+\/\d+|Server is busy, reconnecting\s*\d+\/\d+/.exec(txt)?.[0] ?? null
    const box = [...document.querySelectorAll('div')].find(
      (d) => /rounded-\[20px\]/.test(d.className || '') && d.querySelector('svg')
    )
    const style = (el) => {
      if (!el) return null
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return {
        radius: cs.borderRadius,
        bg: cs.backgroundColor,
        pad: cs.padding,
        gap: cs.gap,
        font: cs.fontSize + '/' + cs.lineHeight,
        shadow: cs.boxShadow.slice(0, 90),
        size: Math.round(r.width) + 'x' + Math.round(r.height)
      }
    }
    return {
      reconnect,
      errorText: box ? box.innerText.slice(0, 120) : null,
      errorStyle: style(box)
    }
  })
  if (snap.reconnect && !seen.reconnect) {
    seen.reconnect = snap.reconnect
    console.log('  ✓ 重连行：', snap.reconnect)
  }
  if (snap.errorText && !seen.error) {
    seen.error = snap
    console.log('  ✓ 错误卡片出现')
  }
  if (seen.error) break
}

console.log('\n=== 结果 ===')
console.log('重连行:', seen.reconnect ?? '(未捕获)')
if (seen.error) {
  console.log('错误文本:', seen.error.errorText)
  console.log('错误卡片样式:', JSON.stringify(seen.error.errorStyle, null, 2))
}

// 与上游实测值对比
const EXPECT = { radius: '20px', pad: '8px 8px 8px 12px', gap: '12px', font: '13px' }
let failed = 0
const check = (n, c, got) => {
  if (c) console.log(`  ✓ ${n}`)
  else {
    failed++
    console.log(`  ✗ ${n} — got ${got}`)
  }
}
console.log('\n=== 与上游实测值对比 ===')
if (seen.error) {
  const s = seen.error.errorStyle
  check('圆角 20px', s.radius === EXPECT.radius, s.radius)
  check('内边距 8/8/8/12', s.pad === EXPECT.pad, s.pad)
  check('图标与文字间距 12px', s.gap === EXPECT.gap, s.gap)
  check('字号 13px', s.font.startsWith(EXPECT.font), s.font)
  check('白底', s.bg === 'rgb(255, 255, 255)', s.bg)
  check('hairline 描边 + 微阴影', /0\.5px/.test(s.shadow) || /0px 1px 2px/.test(s.shadow), s.shadow)
} else {
  failed++
  console.log('  ✗ 未捕获到错误卡片')
}
check('重连行带 N/5 进度', !!seen.reconnect && /\d+\/\d+/.test(seen.reconnect), seen.reconnect)

ws.close()
console.log(failed === 0 ? '\n全部匹配\n' : `\n${failed} 项不匹配\n`)
process.exit(failed === 0 ? 0 : 1)
