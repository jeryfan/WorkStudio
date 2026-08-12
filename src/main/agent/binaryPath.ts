import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
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

export class AgentBinaryError extends Error {
  constructor(
    message: string,
    readonly hint: string
  ) {
    super(message)
    this.name = 'AgentBinaryError'
  }
}

/**
 * 定位随包分发的 agent 运行时。
 *
 * 打包后：<resources>/agent/          （electron-builder extraResources 按平台投放）
 * 开发时：<repo>/resources/agent/<platform>-<arch>/
 */
export function resolveAgentDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'agent')
    : join(app.getAppPath(), 'resources', 'agent', `${process.platform}-${process.arch}`)
}

export function resolveAgentBinary(): string {
  return join(resolveAgentDir(), ENTRY)
}

/**
 * 启动前的完整性检查。
 *
 * 附属文件缺失时主程序仍能启动、也能握手，但命令执行和文件搜索会在用户
 * 真正用到时才失败——那时错误信息离根因很远。宁可在启动期拦下。
 */
export async function verifyAgentBinary(): Promise<{ path: string; version: string }> {
  const dir = resolveAgentDir()
  const binary = join(dir, ENTRY)

  if (!existsSync(binary)) {
    throw new AgentBinaryError(
      `Agent runtime not found at ${binary}`,
      app.isPackaged
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
