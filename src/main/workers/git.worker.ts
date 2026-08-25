import { execFile } from 'node:child_process'
import { parentPort } from 'node:worker_threads'
import { promisify } from 'node:util'
import {
  isWorkerRequestCancelMessage,
  isWorkerRequestMessage,
  type WorkerRequest,
  type WorkerResult
} from '@shared/host/worker'

/**
 * git worker —— Codex 的 git worker 在本项目的对应物。
 *
 * **这替换掉的是什么**：本项目原先让渲染层把 git 命令送进 app-server 的
 * `command/exec`（agent 沙箱）。那条路有两个真问题，不是风格问题：
 *   1. 写操作（`checkout`、`checkout -b`）在 `workspace-write` 策略下会失败 ——
 *      沙箱不允许写 `.git`（实测报 "cannot lock ref: Operation not permitted"），
 *      只能升到 `dangerFullAccess`，等于为了切分支把整机写权限打开；
 *   2. 沙箱的写操作会触发审批请求，而首页没有会话能承载审批 —— 调用永远挂着。
 * Codex 从不走那条路：git 归主进程的 git worker。
 *
 * 为什么用 worker 线程而不是直接在主进程 `execFile`：`git status` 在大仓上是
 * 几百毫秒级的，主进程被占住就是窗口卡住。worker 里跑，主进程只转发。
 */

const execFileAsync = promisify(execFile)

/** git 子进程的上限：卡住的 git（比如等凭据输入）不能拖死 worker */
const GIT_TIMEOUT_MS = 20_000
/** 输出上限：`branch --list` 在超大仓上可能很长，但不该无界 */
const MAX_BUFFER_BYTES = 8 * 1024 * 1024

/** 已取消的请求 id：结果算出来也不回（Codex `worker-request-cancel`） */
const cancelled = new Set<string>()

interface GitParams {
  root: string
}

async function git(root: string, args: string[]): Promise<string> {
  /*
   * `-C <root>` 而不是 `cwd`：worker 的 cwd 是应用的 cwd，用 `-C` 让"在哪个仓
   * 上操作"完全由参数决定，不依赖进程状态。
   *
   * `GIT_TERMINAL_PROMPT=0` 是必须的：没有它，需要凭据的操作会挂在等输入上，
   * 而 worker 里没有终端可输入 —— 表现为分支下拉永远转圈。
   */
  const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER_BYTES,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  })
  return stdout
}

function nonEmptyLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export interface BranchInfo {
  name: string
  current: boolean
  /** 仅当前分支有值：未提交文件数 */
  uncommittedFiles: number | null
}

const handlers: Record<string, (params: unknown) => Promise<unknown>> = {
  /** 当前分支名；detached HEAD 时是空串（`--show-current` 的行为） */
  currentBranch: async (params) => {
    const { root } = params as GitParams
    return (await git(root, ['branch', '--show-current'])).trim()
  },

  listBranches: async (params) => {
    const { root } = params as GitParams
    const [currentOut, listOut, statusOut] = await Promise.all([
      git(root, ['branch', '--show-current']),
      git(root, ['branch', '--list', '--format=%(refname:short)']),
      git(root, ['status', '--porcelain'])
    ])
    const current = currentOut.trim()
    const uncommittedFiles = nonEmptyLines(statusOut).length
    return nonEmptyLines(listOut).map((name): BranchInfo => ({
      name,
      current: name === current,
      uncommittedFiles: name === current ? uncommittedFiles : null
    }))
  },

  checkout: async (params) => {
    const { root, name } = params as GitParams & { name: string }
    await git(root, ['checkout', name])
    return null
  },

  createAndCheckout: async (params) => {
    const { root, name } = params as GitParams & { name: string }
    await git(root, ['checkout', '-b', name])
    return null
  },

  /** 未提交文件数（分支 pill 的 "Uncommitted: N files"） */
  uncommittedFileCount: async (params) => {
    const { root } = params as GitParams
    return nonEmptyLines(await git(root, ['status', '--porcelain'])).length
  }
}

async function run(request: WorkerRequest): Promise<WorkerResult> {
  const handler = handlers[request.method]
  if (handler == null) {
    return {
      type: 'error',
      error: { message: `git worker method not implemented: ${request.method}` }
    }
  }
  try {
    return { type: 'ok', value: await handler(request.params) }
  } catch (error) {
    /*
     * git 失败时 stderr 才是有用的那句（"not a git repository"、
     * "did not match any file(s) known to git"）。只回 error.message 的话
     * 用户看到的是 "Command failed with exit code 128"。
     */
    const stderr = (error as { stderr?: string } | null)?.stderr?.trim()
    const message =
      stderr != null && stderr.length > 0
        ? stderr
        : error instanceof Error
          ? error.message
          : String(error)
    return { type: 'error', error: { message } }
  }
}

if (parentPort == null) {
  throw new Error('git worker must run in a worker thread')
}

parentPort.on('message', (message: unknown) => {
  if (isWorkerRequestCancelMessage(message)) {
    cancelled.add(message.id)
    return
  }
  if (!isWorkerRequestMessage(message)) return
  const { request } = message
  void run(request).then((result) => {
    if (cancelled.delete(request.id)) return
    parentPort?.postMessage({
      type: 'worker-response',
      workerId: 'git',
      response: { id: request.id, method: request.method, result }
    })
  })
})
