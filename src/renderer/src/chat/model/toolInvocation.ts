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
export interface TerminalToolData {
  kind: 'terminal'
  command: string
  /** 展示用命令；与 `command` 不同时说明经过了沙箱/包装改写 */
  commandForDisplay: string
  cwd: string | null
  output: string | null
  exitCode: number | null
}

/** 通用工具的入参/出参（MCP、动态工具） */
export interface InputOutputToolData {
  kind: 'inputOutput'
  /** 已格式化的入参 JSON */
  input: string
  output: string | null
  /** 出参的语言 id，用于代码块着色；纯文本为 null */
  outputLang: string | null
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
 * 检索类工具（webSearch、代码搜索）。
 *
 * 上游对"带结果的工具"会渲染成一个可折叠的结果列表（`ChatResultListSubPart`），
 * 只有确实没结果时才是光秃秃一行标题。这里跟它对齐。
 *
 * `results` 在协议里是 `Array<JsonValue>`，注释明确说是**不透明 JSON**
 * （"so new result fields and result types can pass through without a Codex
 * release"）。所以 adapter 只做尽力而为的抽取：认得出 url/title 就用，
 * 认不出就把整条 JSON 当标题——总比把结果丢掉好。
 */
export interface SearchToolData {
  kind: 'search'
  query: string
  results: { title: string; url: string | null }[]
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
