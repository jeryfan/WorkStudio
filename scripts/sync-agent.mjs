#!/usr/bin/env node
/**
 * 从一份本地 agent 发行包同步运行时文件到 resources/agent/<platform>-<arch>/。
 *
 * 发行包不是单个可执行文件，而是一组同目录文件：
 *   entrypoint            主程序（本项目重命名为 agent-server）
 *   codex-code-mode-host  code-mode 宿主，运行时按此固定名在同目录查找
 *   rg                    文件搜索依赖，会被加入子进程 PATH
 * 附属文件名由运行时硬编码，不可重命名；缺失时主程序会回退到系统路径查找，
 * 导致行为取决于用户机器而非我们分发的内容。
 *
 * 用法：
 *   node scripts/sync-agent.mjs <发行包目录> [--platform darwin --arch arm64]
 *
 * 发行包目录支持两种布局：
 *   A. 带 manifest：<dir>/bin/<entry> + <dir>/codex-path/rg
 *   B. 扁平：<dir>/ 下直接放三个文件
 */
import { existsSync, mkdirSync, copyFileSync, chmodSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'

const TARGET_ENTRY = 'agent-server'
const SIDECARS = ['codex-code-mode-host', 'rg']

function fail(msg) {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

const args = process.argv.slice(2)
const src = args.find((a) => !a.startsWith('--'))
if (!src) {
  fail(
    'Missing source directory.\n' +
      '  node scripts/sync-agent.mjs <发行包目录>\n' +
      '  例：node scripts/sync-agent.mjs /opt/homebrew/Caskroom/codex/0.147.0'
  )
}

function flag(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const platform = flag('platform', process.platform)
const arch = flag('arch', process.arch)

const srcDir = resolve(src)
if (!existsSync(srcDir)) fail(`Source directory not found: ${srcDir}`)

/** 解析布局，返回 { entry, sidecars: Map<name, absPath> } */
function resolveLayout(dir) {
  const manifestPath = join(dir, 'codex-package.json')
  const found = new Map()

  let entry = null
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    entry = join(dir, manifest.entrypoint ?? 'bin/codex')
    const searchDirs = [
      join(dir, 'bin'),
      manifest.pathDir ? join(dir, manifest.pathDir) : null,
      manifest.resourcesDir ? join(dir, manifest.resourcesDir) : null
    ].filter(Boolean)
    for (const name of SIDECARS) {
      for (const d of searchDirs) {
        const p = join(d, name)
        if (existsSync(p)) {
          found.set(name, p)
          break
        }
      }
    }
  } else {
    // 扁平布局：入口名未知，取目录下最大的可执行文件
    const candidates = ['codex', TARGET_ENTRY].map((n) => join(dir, n)).filter(existsSync)
    entry = candidates[0] ?? null
    for (const name of SIDECARS) {
      const p = join(dir, name)
      if (existsSync(p)) found.set(name, p)
    }
  }

  if (!entry || !existsSync(entry)) {
    fail(
      `Could not locate the agent entrypoint under ${dir}.\n` +
        `  期望 <dir>/codex-package.json 指向的 entrypoint，或 <dir>/codex。`
    )
  }
  return { entry, sidecars: found }
}

const { entry, sidecars } = resolveLayout(srcDir)

const missing = SIDECARS.filter((n) => !sidecars.has(n))
if (missing.length) {
  fail(
    `Missing required sidecar file(s) in ${srcDir}: ${missing.join(', ')}\n` +
      `  这些文件必须与主程序同目录分发，否则命令执行与文件搜索会在运行期失败。`
  )
}

const outDir = resolve('resources', 'agent', `${platform}-${arch}`)
mkdirSync(outDir, { recursive: true })

function place(from, toName) {
  const to = join(outDir, toName)
  copyFileSync(from, to)
  chmodSync(to, 0o755)
  const mb = (statSync(to).size / 1024 / 1024).toFixed(1)
  console.log(`  ${toName.padEnd(22)} ${mb.padStart(7)} MB   ← ${basename(from)}`)
}

console.log(`\n同步 agent 运行时 → ${outDir}`)
place(entry, TARGET_ENTRY)
for (const name of SIDECARS) place(sidecars.get(name), name)
console.log('\n✓ 完成。校验：')
console.log(`  ${join(outDir, TARGET_ENTRY)} --version\n`)
