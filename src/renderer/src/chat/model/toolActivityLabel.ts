/**
 * 组表头 **active 态**的活动文案 —— Codex 的 `og` 文案表
 * (`localConversation.toolActivity.active.*`)加上取文案的 `$h` / `tg` / `ag`
 * 三个函数(`subagent-activity-chip-group`)。
 *
 * ## 为什么它不能与行摘要共用一套文案
 *
 * 同一条命令,Codex 在两个位置说两种话:
 *
 * | 位置 | 源 | 例 |
 * |---|---|---|
 * | 活动行的行摘要 | `toolSummaryForCmd.*` | `Searched for foo in src/renderer` |
 * | 组表头(active) | `localConversation.toolActivity.active.*` | `Searching files in renderer folder` |
 *
 * 差三处:时态、参数形态(完整路径 vs **目录名**)、以及有查询词时表头**只说
 * 目录**(`searchFolder` 分支在 `ng` 里先判 `path`,`query` 根本没进句子)。
 * 所以这是两张表,不是一张表加个时态开关 —— 之前 WS 拿行摘要
 * (`invocationMessage`)切第一个空格当 action/detail 用,三处全错。
 *
 * ## 两段结构
 *
 * `og` 的 defaultMessage 里带 `<action>` / `<detail>` 两个标签,由 `qO` 传进去的
 * `YO` / `JO` 渲染成:
 *
 * ```
 * <span class="whitespace-nowrap">Reading</span> <span class="min-w-0 truncate">app.tsx</span>
 * ```
 *
 * action 不换行、detail 可截断 —— 长文件名截在文件名上,动词永远看得见。
 */
import type { ParsedCommand, TerminalToolData } from './toolInvocation'

/** `og` 的一条文案:两段(`<action>` + 可选 `<detail>`) */
export interface ActiveToolActivityLabel {
  action: string
  /** `<detail>` 段;`commandStopped` / `commandRan` / `commandRunning` 只有 action */
  detail: string | null
}

/** Codex `Ii`/`ys` —— 路径取末段(先剥掉尾部斜杠) */
function baseName(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  const index = trimmed.lastIndexOf('/')
  return index === -1 ? trimmed : trimmed.slice(index + 1)
}

/**
 * Codex `tg` —— 一条 exec 条目的 active 文案。
 *
 * 落不了地的三个分支(数据缺失,不是没做):
 * - `edit-files`(`rg`):可视化命令的 `activeCreating` / `activeUpdating`,
 *   协议没有 visualization 通道
 * - `readSkill` / `readInternalKnowledge`:要 `Up()` 判断读的是不是技能定义文件,
 *   协议不给技能路径信息
 * - `STEPS_PROSE` 档的查询词改写(`Vh`):WS 没有 `conversationDetailMode` 设置
 */
export function activeExecLabel(
  parsed: ParsedCommand,
  { command, interrupted, finished }: { command: string; interrupted: boolean; finished: boolean }
): ActiveToolActivityLabel {
  switch (parsed.type) {
    case 'read':
      // `og.read`:`<action>Reading</action> <detail>{target}</detail>`
      // target = displayLabel ?? Ii(path ?? name) —— 协议不给 displayLabel
      return { action: 'Reading', detail: baseName(parsed.path || parsed.name) }
    case 'search': {
      // `ng`:**先判 path**。有目录就只说目录,查询词不进句子
      if (parsed.path) {
        return { action: 'Searching', detail: `files in ${baseName(parsed.path)} folder` }
      }
      const query = parsed.query?.trim()
      if (query) return { action: 'Searching', detail: `for ${query}` }
      return { action: 'Searching', detail: 'files' }
    }
    case 'listFiles':
      return parsed.path == null
        ? { action: 'Listing', detail: 'files' }
        : { action: 'Listing', detail: `files in ${baseName(parsed.path)} folder` }
    case 'unknown':
      return activeGenericCommandLabel({ command, interrupted, finished })
  }
}

/**
 * Codex `ag` —— 非分类命令(format/lint/noop/test/unknown)的 active 文案。
 *
 * 三态 × 有无命令文字 = 六句。注意**中断态也在这张表里**:
 * `Stopped {command}` 是 active 文案的一档,不是错误提示。
 */
function activeGenericCommandLabel({
  command,
  interrupted,
  finished
}: {
  command: string
  interrupted: boolean
  finished: boolean
}): ActiveToolActivityLabel {
  const trimmed = command.trim()
  if (trimmed.length === 0) {
    // `commandStopped` / `commandRan` / `commandRunning` —— 只有 action 段
    return {
      action: interrupted ? 'Stopped command' : finished ? 'Ran command' : 'Running command',
      detail: null
    }
  }
  return {
    action: interrupted ? 'Stopped' : finished ? 'Ran' : 'Running',
    detail: trimmed
  }
}

/**
 * Codex `lr` —— exec 是不是「探索类」。
 *
 * 这条判据在 Codex 里被四处复用:组表头选 active 条目(`Xr`)、轮次的探索段
 * 切分(`Mr`)、组摘要的 exploration 段、以及未完成时整行不渲染。
 */
export function isExplorationCommand(data: TerminalToolData): boolean {
  switch (data.parsedCmd.type) {
    case 'read':
    case 'search':
    case 'listFiles':
      return true
    case 'unknown':
      return false
  }
}

/**
 * Codex `Yt` —— 命令是不是「访问外网」。
 *
 * `Fg` 用它给 exec 行选地球图标:`curl https://…` 在会话里的语义是"上网查",
 * 画个终端图标等于把它藏在一堆本地命令里。
 *
 * 判据逐条照抄:必须以 `curl` 起头、不带那三类排除模式、且命令里出现的
 * http(s) URL 至少有一个是**非本机**主机(`localhost` / `127.` 不算)。
 */
export function isWebCommand(command: string): boolean {
  if (!/^\s*curl(?:\s|$)/u.test(command)) return false
  if (CURL_EXCLUSIONS.some((pattern) => pattern.test(command))) return false
  const urls = command.match(/\bhttps?:\/\/[^\s'"<>]+/giu)
  return urls != null && urls.some(isRemoteUrl)
}

/**
 * `Yt` 里的 `nn` / `rn` / `an` 三条排除模式(逐字照抄)。
 *
 * 三个都是「这条 curl 在**写**,不是在读网页」:改了 HTTP 方法、带请求体、
 * 或用了 `-d/-F/-T`。它们的产物不是网页正文,给地球图标会误导。
 */
const CURL_EXCLUSIONS = [
  /(?:^|\s)(?:-X\s*|--request(?:=|\s+))(?:POST|PUT|PATCH|DELETE)\b/iu,
  /(?:^|\s)(?:--data(?:-[^\s=]+)?|--json|--form|--upload-file)(?:=|\s|$)/u,
  /(?:^|\s)-(?:d|F|T)(?:=|\s|$)/u
]

function isRemoteUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host !== 'localhost' && !host.startsWith('127.')
  } catch {
    return false
  }
}
