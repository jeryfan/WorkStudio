import { app } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * 随包分发的 Node 运行时 —— Codex `Contents/Resources/cua_node/` 的对应物。
 *
 * 取证（三个解析函数逐字照搬）：
 *   nodePath        `eF({executableName:'node'})`  → `<runtimeRoot>/bin/node`
 *   nodeReplPath    `WP()`                          → `<runtimeRoot>/bin/node_repl`
 *   nodeModuleDirs  `KP()` → `dirname(dirname(nodePath))/lib/node_modules`（存在才返回）
 * Codex 还允许 `CODEX_BROWSER_USE_NODE_PATH` / `CODEX_NODE_REPL_PATH` 覆盖，
 * 且优先级高于随包副本 —— 这里沿用同样的两个变量名，理由与 `CODEX_CLI_PATH`
 * 相同：我们分发的是同一套东西，用户为本机 codex 设的值对我们同样成立。
 *
 * **为什么要自带 Node**：Codex 的 bundled 插件（浏览器插件、各家 MCP server）
 * 是 JS，跑在这份 Node 上。依赖用户机器上的 Node 意味着"能不能用"取决于他装了
 * 什么版本 —— 而 24.x 与 20.x 在插件里的行为并不一样。
 *
 * **node_repl 不在这里，且不能补**：Codex 的 `bin/node_repl` 是 OpenAI 自己编的
 * Rust 二进制（自述 "Run the node_repl MCP stdio server"），既没开源也不在 codex
 * 发行包里。它提供的是一个**沙箱化的 Node kernel**，并往插件进程里注入
 * `globalThis.nodeRepl.nativePipe.createConnection` —— 也就是 bundled 浏览器插件
 * 唯一能连上我们 native pipe 的那条特权桥（谁能连由
 * `NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S` 把关）。
 * 结论（重要，不是遗漏）：只要没有 node_repl 或它的等价实现，
 * `src/main/browser/nativePipeServer.ts` 就是一个**没有客户端的服务端** ——
 * 线协议对齐是真的，但 agent 那侧目前没有东西会来连。
 */

const NODE_BIN = process.platform === 'win32' ? 'node.exe' : 'node'
const NODE_REPL_BIN = process.platform === 'win32' ? 'node_repl.exe' : 'node_repl'

/** Codex 的两个覆盖变量 */
const NODE_PATH_ENV = 'CODEX_BROWSER_USE_NODE_PATH'
const NODE_REPL_PATH_ENV = 'CODEX_NODE_REPL_PATH'

export interface NodeRuntimePaths {
  /** 找不到时为 null —— 调用方必须判空，不能假设一定有 */
  nodePath: string | null
  nodePathSource: 'env' | 'bundled' | 'missing'
  nodeReplPath: string | null
  nodeReplPathSource: 'env' | 'bundled' | 'missing'
  /** 传给插件运行时的 `--node-modules-dir`（Codex `nodeModuleDirs`） */
  nodeModuleDirs: string[]
}

/**
 * 运行时根目录。
 *
 * 打包后：<resources>/node-runtime/         （extraResources 按平台投放）
 * 开发时：<repo>/resources/node-runtime/<platform>-<arch>/
 * 与 agent 二进制同一套约定（见 binaryPath.ts）。
 */
export function resolveNodeRuntimeRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'node-runtime')
    : join(app.getAppPath(), 'resources', 'node-runtime', `${process.platform}-${process.arch}`)
}

function fromEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value != null && value.length > 0 && existsSync(value) ? value : null
}

function bundled(binary: string): string | null {
  const candidate = join(resolveNodeRuntimeRoot(), 'bin', binary)
  return existsSync(candidate) ? candidate : null
}

export function resolveNodeRuntime(): NodeRuntimePaths {
  const envNode = fromEnv(NODE_PATH_ENV)
  const bundledNode = envNode == null ? bundled(NODE_BIN) : null
  const nodePath = envNode ?? bundledNode

  const envRepl = fromEnv(NODE_REPL_PATH_ENV)
  const bundledRepl = envRepl == null ? bundled(NODE_REPL_BIN) : null
  const nodeReplPath = envRepl ?? bundledRepl

  return {
    nodePath,
    nodePathSource: envNode != null ? 'env' : bundledNode != null ? 'bundled' : 'missing',
    nodeReplPath,
    nodeReplPathSource: envRepl != null ? 'env' : bundledRepl != null ? 'bundled' : 'missing',
    nodeModuleDirs: resolveNodeModuleDirs(nodePath)
  }
}

/** Codex `KP`：从 nodePath 往上两级找 `lib/node_modules`（win32 是 `bin/node_modules`） */
function resolveNodeModuleDirs(nodePath: string | null): string[] {
  if (nodePath == null) return []
  const root = dirname(dirname(nodePath))
  const dir = join(root, process.platform === 'win32' ? 'bin' : 'lib', 'node_modules')
  return existsSync(dir) ? [dir] : []
}
