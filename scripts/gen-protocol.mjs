#!/usr/bin/env node
/**
 * 从 agent 二进制生成协议 TypeScript 类型。
 *
 * 类型必须与实际运行的二进制严格对应，因此由二进制自己导出而不是手写。
 * 升级 agent 版本后重跑本脚本，`git diff` 会直接暴露协议变更。
 *
 *   npm run protocol:gen
 */
import { existsSync, rmSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const OUT_DIR = resolve('src', 'shared', 'protocol', 'generated')
const binary = resolve('resources', 'agent', `${process.platform}-${process.arch}`, 'agent-server')

if (!existsSync(binary)) {
  console.error(
    `\n✗ Agent binary not found: ${binary}\n` +
      `  先同步运行时：node scripts/sync-agent.mjs <发行包目录>\n`
  )
  process.exit(1)
}

// 全量重生成：残留的旧类型文件会让"协议已变更"的编译错误被掩盖
if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })

console.log(`\n生成协议类型 ← ${binary}`)
try {
  execFileSync(binary, ['app-server', 'generate-ts', '--out', OUT_DIR], { stdio: 'inherit' })
} catch (err) {
  console.error(`\n✗ 生成失败：${err.message}\n`)
  process.exit(1)
}

function countTs(dir) {
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countTs(join(dir, e.name))
    else if (e.name.endsWith('.ts')) n++
  }
  return n
}

const version = execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim()
console.log(`\n✓ ${countTs(OUT_DIR)} 个类型文件  (${version})`)
console.log(
  `  若 src/shared/protocol/notifications.ts 编译报错，说明协议新增了通知，\n` +
    `  需要在策略表里显式表态订阅或退订。\n`
)
