// 临时脚本：验证重连行可展开、复制按钮变对号、Worked for 的出现条件
const targets = await (await fetch('http://127.0.0.1:9333/json')).json()
const page = targets.find((t) => t.type === 'page')
if (!page) throw new Error('应用需带 --remote-debugging-port=9333 启动')
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
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id
    pending.set(n, res)
    ws.send(JSON.stringify({ id: n, method, params }))
  })

const ev = (fn) =>
  new Promise((res) => {
    const n = ++id
    pending.set(n, (m) => res(m.result?.result?.value))
    ws.send(
      JSON.stringify({
        id: n,
        method: 'Runtime.evaluate',
        params: { expression: `(${fn.toString()})()`, awaitPromise: true, returnByValue: true }
      })
    )
  })

// 剪贴板 API 要求文档有焦点，而被自动化驱动的窗口通常在后台。
// 不模拟焦点的话复制会被浏览器拒绝，测出来的是环境限制而不是代码行为。
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Browser.grantPermissions', {
  permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite']
})

let failed = 0
const check = (n, c, got) => {
  if (c) console.log(`  ✓ ${n}`)
  else {
    failed++
    console.log(`  ✗ ${n}${got !== undefined ? ' — got ' + JSON.stringify(got) : ''}`)
  }
}

console.log('[1] 发消息触发重连 / 失败')
await ev(async () => {
  const rows = [...document.querySelectorAll('button, [role=button]')]
  const chat = rows.find((b) => /^(hello|hi|你好|测试)/.test(b.textContent.trim()))
  if (chat) chat.click()
  await new Promise((r) => setTimeout(r, 2500))
  const ta = document.querySelector('textarea')
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(ta, '测试')
  ta.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 150))
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  return true
})

for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 2000))
  const ok = await ev(() => /Reconnecting\s*\d+\/\d+/.test(document.body.innerText))
  if (ok) break
}

console.log('\n[2] 重连行可展开')
const expand = await ev(async () => {
  const rows = [...document.querySelectorAll('div')]
  const row = rows.find(
    (d) =>
      /^(Reconnecting|Server is busy)/.test(d.innerText.trim()) &&
      d.querySelector('button[aria-expanded]')
  )
  if (!row) return { error: 'no reconnect row' }
  const btn = row.querySelector('button[aria-expanded]')
  const before = {
    aria: btn.getAttribute('aria-expanded'),
    h: Math.round(row.getBoundingClientRect().height),
    text: row.innerText.trim()
  }
  btn.click()
  await new Promise((r) => setTimeout(r, 500))
  return {
    before,
    after: {
      aria: btn.getAttribute('aria-expanded'),
      h: Math.round(row.getBoundingClientRect().height),
      text: row.innerText.slice(0, 160)
    }
  }
})
console.log('   ', JSON.stringify(expand))
check('收起时 aria-expanded=false', expand.before?.aria === 'false', expand.before?.aria)
check('展开后 aria-expanded=true', expand.after?.aria === 'true', expand.after?.aria)
check('展开后高度变大（详情露出）', (expand.after?.h ?? 0) > (expand.before?.h ?? 0), expand)
check(
  '详情含错误原文',
  /401|stream|disconnect|Unauthorized/i.test(expand.after?.text ?? ''),
  expand.after?.text
)

console.log('\n[3] 复制按钮点击后变对号')
const copy = await ev(async () => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    /copy/i.test(b.getAttribute('aria-label') || '')
  )
  if (!btn) return { error: 'no copy button' }
  const path = () => btn.querySelector('svg path')?.getAttribute('d')?.slice(0, 24) ?? null
  const before = { label: btn.getAttribute('aria-label'), d: path() }
  btn.click()
  await new Promise((r) => setTimeout(r, 300))
  const after = { label: btn.getAttribute('aria-label'), d: path() }
  await new Promise((r) => setTimeout(r, 1400))
  return { before, after, later: { label: btn.getAttribute('aria-label'), d: path() } }
})
console.log('   ', JSON.stringify(copy))
check('点击前 label=Copy…', /^Copy/.test(copy.before?.label ?? ''), copy.before?.label)
check('点击后 label=Copied', copy.after?.label === 'Copied', copy.after?.label)
check('图标换成对号（path 变化）', copy.before?.d !== copy.after?.d, copy)
check(
  '对号路径与上游一致',
  (copy.after?.d ?? '').startsWith('M12.8961 3.64101C13.129'),
  copy.after?.d
)
check('约 1.7s 后复原', /^Copy/.test(copy.later?.label ?? ''), copy.later?.label)

console.log('\n[4] Worked for 的出现条件')
const worked = await ev(() => {
  const txt = document.body.innerText
  return {
    hasWorkedFor: /Worked for/.test(txt),
    hasFailedCard: /stream disconnected|401|Unauthorized/i.test(txt)
  }
})
console.log('   ', JSON.stringify(worked))
check('失败的轮次不显示 Worked for', !worked.hasWorkedFor, worked)

ws.close()
console.log(failed === 0 ? '\n全部通过\n' : `\n${failed} 项失败\n`)
process.exit(failed === 0 ? 0 : 1)
