import { requestWorker } from '../../host/workerBus'

/**
 * Git 分支数据 —— composer utility bar 分支 pill / 分支下拉的数据源。
 *
 * **取证结论（这里改过一次路线）**：Codex 的 git 不走 app-server 的
 * `command/exec`，而是走主进程的 **git worker**（`requestGitWorker`）。
 * 本项目原先走 `command/exec`，那条路有两个真问题：
 *   1. `checkout` / `checkout -b` 在 `workspace-write` 沙箱下写不了 `.git`
 *      （实测 "cannot lock ref: Operation not permitted"），只能升到
 *      `dangerFullAccess` —— 为了切分支把整机写权限打开；
 *   2. 沙箱写操作会触发审批，而首页没有会话承载审批，调用永远挂着。
 * 换到 worker 之后两个问题都不存在：git 在主进程的 worker 线程里直接跑，
 * 既没有沙箱也没有审批流。
 */

export interface BranchInfo {
  name: string
  current: boolean
  /** 仅当前分支有值：未提交文件数（Codex 的 "Uncommitted: N files"） */
  uncommittedFiles: number | null
}

/** 当前分支名（detached HEAD 时为空串） */
export function currentBranch(root: string): Promise<string> {
  return requestWorker<string>('git', 'currentBranch', { root })
}

/** 分支列表 + 当前分支的未提交文件数 */
export function listBranches(root: string): Promise<BranchInfo[]> {
  return requestWorker<BranchInfo[]>('git', 'listBranches', { root })
}

export async function checkoutBranch(root: string, name: string): Promise<void> {
  await requestWorker('git', 'checkout', { root, name })
}

export async function createAndCheckoutBranch(root: string, name: string): Promise<void> {
  await requestWorker('git', 'createAndCheckout', { root, name })
}
