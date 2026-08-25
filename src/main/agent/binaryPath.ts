import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** 主程序文件名 */
const ENTRY = process.platform === 'win32' ? 'agent-server.exe' : 'agent-server'

/**
 * 必须与主程序同目录的附属文件。
 *
 * 这两个名字由 agent 运行时内部硬编码查找（code-mode 宿主、文件搜索），
 * 不能重命名——改名后主程序会转而去 /opt/homebrew、/usr/local 等系统路径
 * 兜底查找，行为将取决于用户机器上装了什么，而不是我们分发了什么。
 */
const REQUIRED_SIDECARS = process.platform === 'win32' ? ['rg.exe'] : ['codex-code-mode-host', 'rg']

/**
 * 路径覆盖的环境变量名。
 *
 * 取证：Codex 的 `CV()` 读的就是 `CODEX_CLI_PATH`，且**优先级最高**（在
 * `<resources>/codex` 之前）。这里沿用同一个名字而不是自造一个：我们分发的
 * 就是同一个二进制，用户为本机 codex 设的这个变量对我们同样成立。
 */
const BINARY_PATH_ENV = 'CODEX_CLI_PATH'

export class AgentBinaryError extends Error {
  constructor(
    message: string,
    readonly hint: string
  ) {
    super(message)
    this.name = 'AgentBinaryError'
  }
}

export interface AgentRuntimeLocation {
  /** 实际要执行的主程序 */
  binary: string
  /** 主程序所在目录 —— 附属文件与 PATH 都以它为准 */
  dir: string
  source: 'env' | 'bundled'
}

/**
 * 定位 agent 运行时。
 *
 * 取证：Codex `xV()` 的查找顺序是
 *   1. `CODEX_CLI_PATH`
 *   2. `<resources>/codex`
 *   3. `<resources>/app.asar.unpacked/codex`
 *   4. `<resources>/codex-linux`
 *   5. `<appPath>/extension/bin/codex`（开发树）
 * 本项目只需要 1 与 2/5 两档：3 是 Codex 把二进制放进 asar 时的回退，
 * 我们经 extraResources 投放（`files` 里已排除 `resources/agent`），
 * 二进制永远不进 asar；4 是他们 Linux 包的历史命名。多写就是死代码。
 *
 * 打包后：<resources>/agent/          （electron-builder extraResources 按平台投放）
 * 开发时：<repo>/resources/agent/<platform>-<arch>/
 */
export function resolveAgentRuntime(): AgentRuntimeLocation {
  const override = process.env[BINARY_PATH_ENV]?.trim()
  if (override != null && override.length > 0) {
    // Codex `SV()`：给的是目录就往里找同名可执行文件
    const binary = isDirectory(override) ? join(override, ENTRY) : override
    return { binary, dir: dirname(binary), source: 'env' }
  }
  const dir = app.isPackaged
    ? join(process.resourcesPath, 'agent')
    : join(app.getAppPath(), 'resources', 'agent', `${process.platform}-${process.arch}`)
  return { binary: join(dir, ENTRY), dir, source: 'bundled' }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * 启动前的完整性检查。
 *
 * 附属文件缺失时主程序仍能启动、也能握手，但命令执行和文件搜索会在用户
 * 真正用到时才失败——那时错误信息离根因很远。宁可在启动期拦下。
 */
export async function verifyAgentBinary(): Promise<{ path: string; version: string }> {
  const { binary, dir, source } = resolveAgentRuntime()

  if (!existsSync(binary)) {
    throw new AgentBinaryError(
      `Agent runtime not found at ${binary}`,
      source === 'env'
        ? `${BINARY_PATH_ENV} 指向的路径不存在，清掉该变量可回到随包分发的副本。`
        : app.isPackaged
          ? '安装包缺少 agent 运行时，请重新安装。'
          : '开发环境需先同步运行时：npm run sync:agent -- <发行包目录>'
    )
  }

  const missing = REQUIRED_SIDECARS.filter((name) => !existsSync(join(dir, name)))
  if (missing.length > 0) {
    throw new AgentBinaryError(
      `Agent runtime is incomplete, missing: ${missing.join(', ')}`,
      '附属文件必须与主程序同目录。重新执行 npm run sync:agent 可修复。'
    )
  }

  try {
    const { stdout } = await execFileAsync(binary, ['--version'], { timeout: 15_000 })
    return { path: binary, version: stdout.trim() }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new AgentBinaryError(
      `Agent runtime failed to execute: ${detail}`,
      process.platform === 'darwin'
        ? '可能被 Gatekeeper 拦截或缺少执行权限。'
        : '请确认文件具备执行权限。'
    )
  }
}
