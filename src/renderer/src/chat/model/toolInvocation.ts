/**
 * 工具调用的统一模型。
 *
 * 上游把所有工具收敛成一个 `IChatToolInvocation` + 一台状态机，用
 * `toolSpecificData` 区分终端 / 输入输出 / 待办 / 子代理等呈现形态。本项目的协议
 * 相反，是**五种并列的条目类型**（commandExecution / mcpToolCall /
 * dynamicToolCall / fileChange / webSearch），各带各的 status 枚举。
 *
 * 归一化放在 adapter 层，这里只定义归一化之后的形状。方向是"多→一"，
 * 收敛比发散安全：新增一种工具条目只需要在 adapter 加一个分支，渲染层不动。
 *
 * 形状参照 `chat/common/chatService/chatService.ts` 的 IChatToolInvocation 与
 * IChatToolInvocationSerialized，去掉了本项目没有数据源的部分：
 *   WaitingForPostApproval    协议没有"执行后再确认"这一步
 *   WaitingForAuthentication  MCP OAuth 流程未接
 *   IObservable               上游用可观察量做局部重渲染，React 里是 state
 */
import type { McpContentBlock } from './mcpContent'

/** 工具调用所处的阶段 */
export type ToolState =
  /** 模型还在流式产出入参，命令/参数尚不完整 */
  | { type: 'streaming'; partialInput?: string }
  /** 等用户批准。`requestKey` 用于回传决定，`reason` 是服务端给的解释 */
  | { type: 'waitingForConfirmation'; requestKey: string; reason: string | null }
  /** 已批准（或无需批准），正在执行 */
  | { type: 'executing'; progress: string | null }
  /** 正常结束。`success` 为 false 表示工具自己报了错，不是被取消 */
  | { type: 'completed'; success: boolean; durationMs: number | null }
  /** 被用户拒绝或轮次被中断 */
  | { type: 'cancelled'; reason: 'denied' | 'interrupted' }

/**
 * 终端命令。
 *
 * `output` 是聚合后的 stdout+stderr。上游把原始命令与展示用命令分开
 * （`commandLine.original` / `forDisplay`），因为沙箱包装会把用户写的
 * `npm test` 变成一长串 `sandbox-exec -p ... npm test`——展示那一串毫无意义。
 * 本项目的协议目前只给一个 `command` 字段，所以两者暂时同值，但形状先留出来。
 */
/**
 * 命令被解析成了什么 —— 对应 Codex `exec` 条目上的 `parsedCmd`。
 *
 * 之前这里只留了一个 `commandKind` 枚举(把 `parsedCmd.type` 抽出来选图标),
 * 参数被 adapter 提前拼进了 `invocationMessage`。那样做不了 Codex 的两张文案表:
 *
 * - 组表头的活动文案(`og`,`localConversation.toolActivity.active.*`)要的是
 *   `<action>Searching</action> <detail>files in {folder} folder</detail>` ——
 *   两段分开、`folder` 是**目录名**(`Ii(path)`)
 * - 行摘要(`toolSummaryForCmd.*`)要的是 `<verb>Searched</verb> for {query} in {path}`
 *   —— 同一条命令、不同措辞、**完整路径**
 *
 * 从拼好的一句话里反推不出这两种形态,所以按 Codex 的形状把参数原样带下来。
 * `type` 沿用协议 `CommandAction` 的键(`listFiles`,Codex 的 parsed_cmd 里写作
 * `list_files`,一一对应)。
 */
export type ParsedCommand =
  | { type: 'read'; name: string; path: string }
  | { type: 'listFiles'; path: string | null }
  | { type: 'search'; query: string | null; path: string | null }
  | { type: 'unknown' }

export interface TerminalToolData {
  kind: 'terminal'
  parsedCmd: ParsedCommand
  command: string
  /** 展示用命令；与 `command` 不同时说明经过了沙箱/包装改写 */
  commandForDisplay: string
  cwd: string | null
  output: string | null
  exitCode: number | null
}

/**
 * 通用工具的入参/出参（MCP、动态工具）。
 *
 * 形状照 Codex 的 `ew`（`subagent-activity-chip-group` 里的 MCP 活动行）：
 * 展开体里**只有结果，没有入参**。入参走「原始输出」对话框——
 * 折叠一行的目的是"这次调用干了什么"，请求体是排查时才要的东西，
 * 常驻占掉半屏会把真正的结果挤下去。
 *
 * 结果分三条互斥的通道，判据是**结果长什么样**而不是工具声明了什么：
 *
 * | 字段 | 何时有值 | 排版 |
 * |---|---|---|
 * | `error` | 工具自己报错 | 危险色提示块 |
 * | `structuredJson` | 结果是一整段 JSON（`extractStructuredJson`） | 代码块（等宽 + 高亮） |
 * | `blocks` | 其余 | 逐块散文（`McpContentBlockPart`） |
 *
 * 三者都空 → "Tool returned no content"。
 */
export interface InputOutputToolData {
  kind: 'inputOutput'
  /**
   * 这条调用来自 MCP 还是动态工具 —— 组聚合(Codex `fr`)按它分流:
   * MCP 进 `mcp-sources` 段(按服务器聚合),动态工具逐工具一段。
   * MCP 额外带服务器名与连接器信息,供组摘要命名与 logo 解析。
   */
  source:
    | { kind: 'mcp'; server: string; connectorId: string | null; appName: string | null }
    | { kind: 'dynamic' }
  /** 解析后的 MCP 内容块。动态工具的文本被包成单个 text 块 */
  blocks: McpContentBlock[]
  /** 结果整体是一段 JSON 时的缩进串；否则 null */
  structuredJson: string | null
  /** 工具自己报的错误文案 */
  error: string | null
  /** 「原始输出」对话框里的完整 JSON —— 含入参，这是入参唯一的去处 */
  rawJson: string
}

/**
 * 文件改动。
 *
 * 协议每个文件给的是**补丁文本**（`FileUpdateChange.diff`），不是改动前后的全文。
 * 上游 VSCode 那边是把编辑应用到真实的文件模型上再交给 DiffEditor，我们没有这个
 * 条件——只有补丁。所以渲染层要自己从补丁里还原两侧，还原不了就退回按 diff
 * 语法高亮原样显示（见 FileEditToolPart）。
 */
export interface FileEditToolData {
  kind: 'fileEdit'
  changes: {
    path: string
    operation: 'add' | 'delete' | 'update'
    /** 改名后的新路径；未改名为 null */
    movedTo: string | null
    /** 协议给的补丁文本 */
    diff: string
  }[]
}

/**
 * 检索类工具（webSearch）。
 *
 * Codex 的 `nO` 只渲染一行双段摘要（不渲染结果列表、没有展开体），
 * 所以这里只保留摘要要用的字段；协议的 `results`（不透明 JSON）
 * 不再进渲染模型。
 */
export interface SearchToolData {
  kind: 'search'
  query: string
  /** 检索动作 —— 协议与 Codex 同款(search/openPage/findInPage/other) */
  action: import('@shared/protocol/generated/v2/WebSearchAction').WebSearchAction | null
}

export type ToolSpecificData =
  TerminalToolData | InputOutputToolData | FileEditToolData | SearchToolData

export interface ToolInvocation {
  /** 稳定标识，直接用协议条目的 id，同时作为 React key */
  id: string
  /** 工具标识，用于选图标与兜底文案 */
  toolId: string
  /** 进行中的说明，如 "Running `npm test`" */
  invocationMessage: string
  /** 完成后的说明，如 "Ran `npm test`"。缺省时沿用 invocationMessage */
  pastTenseMessage: string | null
  state: ToolState
  data: ToolSpecificData
}
