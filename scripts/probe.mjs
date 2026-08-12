#!/usr/bin/env node
/**
 * agent 协议探针：绕过 Electron 直接驱动 agent 二进制。
 *
 * 出问题时用它把故障域一分为二——探针能跑通说明二进制与协议没问题，
 * 剩下的就是应用侧的接线问题。
 *
 *   node scripts/probe.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, delimiter, resolve } from 'node:path'

const binary = resolve('resources', 'agent', `${process.platform}-${process.arch}`, 'agent-server')
if (!existsSync(binary)) {
  console.error(`✗ Agent binary not found: ${binary}`)
  process.exit(1)
}

const agentDir = dirname(binary)
const child = spawn(
  binary,
  ['-c', 'features.code_mode_host=true', 'app-server', '--listen', 'stdio://'],
  {
    cwd: agentDir,
    env: { ...process.env, PATH: `${agentDir}${delimiter}${process.env.PATH ?? ''}` },
    stdio: ['pipe', 'pipe', 'pipe']
  }
)

const pending = new Map()
let buffer = ''
let notificationCount = 0

child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  buffer += chunk
  let idx
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      console.warn('  ! unparseable line:', line.slice(0, 120))
      continue
    }
    if (msg.id !== undefined && msg.method === undefined) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      p?.(msg)
    } else if (msg.method) {
      notificationCount++
      if (notificationCount <= 3) console.log(`  · notification: ${msg.method}`)
    }
  }
})
child.stderr.setEncoding('utf8')
child.stderr.on('data', (d) => process.stderr.write(`  [stderr] ${d}`))

function request(id, method, params) {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`timeout: ${method}`)), 30_000)
    pending.set(id, (msg) => {
      clearTimeout(timer)
      msg.error ? rej(new Error(`${method}: ${msg.error.message}`)) : res(msg.result)
    })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
}

const OPT_OUT = ['rawResponse/completed', 'rawResponseItem/completed', 'process/outputDelta']

try {
  console.log('\n① 握手')
  const env = await request('__probe_initialize__', 'initialize', {
    clientInfo: { name: 'workstudio-probe', title: 'WorkStudio Probe', version: '0.0.0' },
    capabilities: {
      experimentalApi: true,
      requestAttestation: false,
      optOutNotificationMethods: OPT_OUT
    }
  })
  console.log(`   ✓ ${env.userAgent}`)
  console.log(`     dataDir=${env.codexHome}  os=${env.platformOs}`)
  notify('initialized', {})

  console.log('\n② 会话列表')
  const list = await request(2, 'thread/list', { limit: 5, useStateDbOnly: true })
  console.log(`   ✓ ${list.data.length} 条（nextCursor=${list.nextCursor ?? 'null'}）`)
  for (const t of list.data.slice(0, 3)) {
    const title = (t.name ?? t.preview ?? '').replace(/\s+/g, ' ').slice(0, 44)
    console.log(`     - ${t.cwd.split('/').pop()?.padEnd(18)} ${title}`)
  }

  console.log('\n③ 模型列表')
  const models = await request(3, 'model/list', {})
  const items = models.data ?? models.models ?? []
  console.log(`   ✓ ${items.length} 个模型`)

  console.log(`\n✓ 协议链路正常（收到 ${notificationCount} 条通知）\n`)
  process.exitCode = 0
} catch (err) {
  console.error(`\n✗ ${err.message}\n`)
  process.exitCode = 1
} finally {
  child.kill()
}
