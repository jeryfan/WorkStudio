#!/usr/bin/env node
/**
 * 把一份 Node 运行时同步到 resources/node-runtime/<platform>-<arch>/。
 *
 * 为什么要自带 Node（取证）：Codex 的 `Contents/Resources/cua_node/` 就是这件事，
 * 它的 `manifest.json` 把来源写得很清楚：
 *
 *   { "node_version": "24.19.0",
 *     "node_archive_path": "v24.19.0/node-v24.19.0-darwin-arm64.tar.gz",
 *     "node_path": "bin/node",
 *     "node_modules": "lib/node_modules",
 *     "node_repl_path": "bin/node_repl" }
 *
 * 也就是说 `cua_node/bin/node` 是**从 nodejs.org 下载的原版 Node**（目录里的
 * LICENSE 就是 Node.js 自己的），我们照同一条路做即可，不需要也不应该去拷
 * ChatGPT.app 里的那份。
 *
 * `bin/node_repl` 不在这里：那是 OpenAI 自己编的 Rust 二进制（`node_repl --help`
 * 自述 "Run the node_repl MCP stdio server"），既没有开源也不在 codex 发行包里，
 * 不能随本项目分发。缺它的后果见 src/main/agent/nodeRuntime.ts 的说明。
 *
 * 用法：
 *   node scripts/sync-node-runtime.mjs [--version 24.19.0] [--platform darwin --arch arm64]
 *   node scripts/sync-node-runtime.mjs --from <已解开的 node 目录>
 */
import { existsSync, mkdirSync, rmSync, writeFileSync, statSync, cpSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

/** 与 Codex `cua_node/manifest.json` 记录的版本一致；改这里就换整个运行时 */
const DEFAULT_NODE_VERSION = '24.19.0'
const MIRROR = process.env.NODEJS_MIRROR ?? 'https://nodejs.org/dist'

const args = process.argv.slice(2)
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
function fail(message) {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

const version = flag('version', DEFAULT_NODE_VERSION)
const platform = flag('platform', process.platform)
const arch = flag('arch', process.arch)
const from = flag('from', null)

/** nodejs.org 的 dist 命名（win 是 zip，其余是 tar.gz） */
const nodePlatform = platform === 'win32' ? 'win' : platform
const archiveExt = platform === 'win32' ? 'zip' : 'tar.gz'
const archiveName = `node-v${version}-${nodePlatform}-${arch}.${archiveExt}`
const archivePath = `v${version}/${archiveName}`

const outDir = resolve('resources', 'node-runtime', `${platform}-${arch}`)
const binName = platform === 'win32' ? 'node.exe' : 'node'

/**
 * 解出来的目录布局刻意与 Codex 一致（`bin/node` + `lib/node_modules`）：
 * 主进程那边的解析逻辑是照它写的（`dirname(dirname(nodePath))/lib/node_modules`），
 * 换个布局就得两边一起改。
 */
function place(sourceRoot) {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(join(outDir, 'bin'), { recursive: true })

  const sourceBin =
    platform === 'win32' ? join(sourceRoot, binName) : join(sourceRoot, 'bin', binName)
  if (!existsSync(sourceBin)) fail(`Node executable not found in the archive: ${sourceBin}`)
  cpSync(sourceBin, join(outDir, 'bin', binName))

  // npm/npx 与 lib/node_modules 一起带上：没有它们 `node -e` 能跑，但装不了东西
  const sourceModules =
    platform === 'win32'
      ? join(sourceRoot, 'node_modules')
      : join(sourceRoot, 'lib', 'node_modules')
  if (existsSync(sourceModules)) {
    const target = platform === 'win32' ? join(outDir, 'bin') : join(outDir, 'lib')
    mkdirSync(target, { recursive: true })
    cpSync(sourceModules, join(target, 'node_modules'), { recursive: true })
  }

  const licence = join(sourceRoot, 'LICENSE')
  if (existsSync(licence)) cpSync(licence, join(outDir, 'LICENSE'))

  writeFileSync(
    join(outDir, 'manifest.json'),
    `${JSON.stringify(
      {
        platform,
        arch,
        target: `${platform}-${arch}`,
        node_version: version,
        node_archive_path: archivePath,
        node_path: `bin/${binName}`,
        node_modules: platform === 'win32' ? 'bin/node_modules' : 'lib/node_modules'
      },
      null,
      2
    )}\n`
  )
}

if (from != null) {
  const sourceRoot = resolve(from)
  if (!existsSync(sourceRoot)) fail(`Source directory not found: ${sourceRoot}`)
  place(sourceRoot)
} else {
  const url = `${MIRROR}/${archivePath}`
  const work = join(tmpdir(), `ws-node-runtime-${Date.now()}`)
  mkdirSync(work, { recursive: true })
  const download = join(work, archiveName)
  console.log(`\n下载 ${url}`)
  try {
    execFileSync('curl', ['-fsSL', '-o', download, url], {
      stdio: ['ignore', 'inherit', 'inherit']
    })
  } catch {
    fail(`Download failed: ${url}\n  网络不通时可以先手工解开，再用 --from <目录>。`)
  }
  if (platform === 'win32') {
    execFileSync('unzip', ['-q', download, '-d', work], { stdio: 'inherit' })
  } else {
    execFileSync('tar', ['-xzf', download, '-C', work], { stdio: 'inherit' })
  }
  place(join(work, `node-v${version}-${nodePlatform}-${arch}`))
  rmSync(work, { recursive: true, force: true })
}

const placed = join(outDir, 'bin', binName)
const mb = (statSync(placed).size / 1024 / 1024).toFixed(1)
console.log(`\n✓ Node ${version} → ${outDir}`)
console.log(`  bin/${binName}  ${mb} MB`)
console.log(`  校验：${placed} --version\n`)
