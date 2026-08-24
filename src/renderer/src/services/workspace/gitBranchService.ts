import { rpc } from '../../rpc/client'
import { M } from '@shared/protocol/methods'
import type { CommandExecResponse } from '@shared/protocol/generated/v2/CommandExecResponse'

/**
 * Git 分支数据 —— composer utility bar 分支 pill / 分支下拉的数据源。
 * Codex 的分支信息由 agent 侧的 git 查询得来;WS 走协议 `command/exec`
 * (沙箱内执行 git,不建会话/轮次)。
 */

export interface BranchInfo {
  name: string
  current: boolean
  /** 仅当前分支有值:未提交文件数(Codex 的 "Uncommitted: N files") */
  uncommittedFiles: number | null
}

async function git(root: string, args: string[], write = false): Promise<string> {
  const res = await rpc.request<CommandExecResponse>(M.execStart, {
    command: ['git', '-C', root, ...args],
    /*
     * 写操作(checkout/-b)必须显式给沙箱策略:默认策略下写操作会触发审批请求,
     * 而首页没有会话可承载审批(调用永远挂着);workspace-write 又不允许写 .git
     * (实测:git checkout -b 报 "cannot lock ref: Operation not permitted")。
     * dangerFullAccess = 用户显式点击的分支切换,与 Codex 的 git 工具语义一致。
     */
    ...(write ? { sandboxPolicy: { type: 'dangerFullAccess' as const } } : {})
  })
  if (res.exitCode !== 0) {
    throw new Error(res.stderr.trim() || `git ${args.join(' ')} exited ${res.exitCode}`)
  }
  return res.stdout
}

/** 当前分支名(detached HEAD 时为空串) */
export async function currentBranch(root: string): Promise<string> {
  return (await git(root, ['branch', '--show-current'])).trim()
}

/** 分支列表 + 当前分支的未提交文件数 */
export async function listBranches(root: string): Promise<BranchInfo[]> {
  const [currentOut, listOut, statusOut] = await Promise.all([
    git(root, ['branch', '--show-current']),
    git(root, ['branch', '--list', '--format=%(refname:short)']),
    git(root, ['status', '--porcelain'])
  ])
  const current = currentOut.trim()
  const uncommitted = statusOut.trim().length === 0 ? 0 : statusOut.trim().split('\n').length
  return listOut
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      current: name === current,
      uncommittedFiles: name === current ? uncommitted : null
    }))
}

export async function checkoutBranch(root: string, name: string): Promise<void> {
  await git(root, ['checkout', name], true)
}

export async function createAndCheckoutBranch(root: string, name: string): Promise<void> {
  await git(root, ['checkout', '-b', name], true)
}
