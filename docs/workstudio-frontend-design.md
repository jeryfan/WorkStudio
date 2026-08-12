# WorkStudio 前端改造与核心功能设计

> 目标：以标准 JSON-RPC 2.0 为进程间协议，打通"渲染层 UI ↔ 主进程 ↔ 本地 Agent Server"三层。
> 本文只使用本项目术语：Project（项目）、Task（任务/会话）、Turn（轮次）、Entry（条目）。
>
> **本版依据同目录《逆向分析》文档的实测结论修订**，与初版的差异集中在：
> 多根路径、Task 恢复语义、状态模型、大 payload 流式传输、首屏同步快照、
> 无项目归属（projectless）任务。逐条差异见 §11。

---

## 1. 现状盘点：差距对照

| 层 | 已有 | 缺失 / 需调整 |
|---|---|---|
| 协议层 | 无 | 没有 JSON-RPC 编解码、没有连接握手、没有事件订阅机制；现有 IPC 是零散的 `ipcMain.handle` 通道（file/shell），无法承载双向流式会话 |
| 主进程 | `fileIpc.ts` 目录列举/读文件；窗口创建 | 没有 Agent Server 子进程管理；没有项目注册表（`rootOf()` 写死 `process.cwd()`）；没有事件转发通道 |
| 服务契约层 | `WorkspaceService` / `FileService` 接口抽象，方向正确 | `getWorkspaceData()` 一次性取全量是原型写法；无任务 CRUD、无分页、无订阅；无会话服务接口 |
| 数据模型 | `Project` / `TaskItem` | Project 缺根路径（项目与磁盘的唯一纽带）；Task 缺状态、时间戳、git 信息、归档标记；无 Turn/Entry 模型 |
| 会话视图 | 无 | **最大的空白**：没有 Task 会话页、没有 Entry 流渲染器、没有流式文本渲染 |
| Composer | 静态 UI 还原度高 | 无受控状态、无提交逻辑；模型名/effort 硬编码；权限 pill 无行为；无运行中/停止态 |
| 侧栏任务行 | 展示 + 菜单图标齐备 | 菜单无真实操作（pin/archive/rename/delete 未接线）；无运行状态指示 |
| 面板系统 | `PanelContext` tab/停靠/最大化，扩展性好 | tab kind 只有 file/browser，需预留 terminal/diff；文件树依赖写死的项目根 |
| 审批交互 | 无 | 没有承载"服务端反向请求"的 UI 表面（命令审批、文件变更审批） |

---

## 2. 目标分层架构

```
┌─ Renderer (React) ─────────────────────────────────────────┐
│  Views: HomeView / SessionView                              │
│  Components: Sidebar / Composer / Panel / ApprovalCard      │
│  State: WorkspaceContext / SessionContext / PanelContext    │
│  Services(接口): WorkspaceService / TaskService /           │
│                  ModelService / FileService                 │
└──────────────▲───────────────────────────▲─────────────────┘
               │ request(method, params)    │ onEvent / onServerRequest
┌─ Preload ────┴───────────────────────────┴─────────────────┐
│  rpc: request / notify / onEvent / onServerRequest/ respond │
│  bootstrap: 首屏同步快照（见 §7）                             │
└──────────────▲───────────────────────────▲─────────────────┘
               │ 单一 IPC 通道承载            │
┌─ Main ───────┴───────────────────────────┴─────────────────┐
│  RpcRouter:  本地方法 vs 转发 Agent Server 的统一路由         │
│  AgentServerHost: spawn/重启/健康检查/握手重放               │
│  ProjectRegistry: 项目列表持久化（rootPaths 映射）           │
│  ChunkedSender:  大 payload 分块流式下发 + ACK 背压          │
└──────────────▲───────────────────────────▲─────────────────┘
               │ stdin (JSONL)              │ stdout (JSONL)
┌─ Agent Server 进程（后端，独立实现） ───────────────────────┐
│  标准 JSON-RPC 2.0 over stdio                                │
│  会话引擎 / 工具执行 / 沙箱 / 持久化                          │
└─────────────────────────────────────────────────────────────┘
```

两条边界都用**同一种协议语义**（JSON-RPC 2.0 请求/响应/通知 + 服务端反向请求）：
Renderer↔Main 走 Electron IPC 承载，Main↔Agent Server 走 stdio JSONL 承载。
对 Renderer 来说只有一套 `request/notify/onEvent/respond` 心智模型。

**路由的关键设计**：Renderer 不关心某个方法由谁实现。
`project/*` 在 Main 本地处理，`task/*` `turn/*` 转发给 Agent Server，
`fs/*` 当前在 Main 本地实现（见 §8）。三者对调用方完全同构，
将来任何一组的实现位置变化（例如 fs 改由远端 Agent 提供）**不需要动 UI**。

---

## 3. 协议设计（标准 JSON-RPC 2.0）

### 3.1 消息格式

```jsonc
// 请求（Renderer → Server）
{ "jsonrpc": "2.0", "id": 10, "method": "task/start", "params": { "cwd": "/abs/proj" } }
// 响应
{ "jsonrpc": "2.0", "id": 10, "result": { "task": { "id": "task_abc" } } }
{ "jsonrpc": "2.0", "id": 10, "error": { "code": -32601, "message": "Method not found" } }
// 通知（Server → Renderer，无 id）
{ "jsonrpc": "2.0", "method": "entry/delta", "params": { "taskId": "task_abc", "entryId": "e_1", "text": "..." } }
// 反向请求（Server → Renderer，带 id，需要应答）
{ "jsonrpc": "2.0", "id": 77, "method": "approval/request", "params": { "kind": "commandRun", "command": "rm -rf build" } }
// Renderer 应答
{ "jsonrpc": "2.0", "id": 77, "result": { "decision": "allow" } }
```

错误码沿用规范保留段（-32700/-32600/-32601/-32602/-32603），业务错误用 -32000 段。

**id 空间隔离**：客户端发起与服务端发起的请求各自维护 id 序列，
实现上用两张表（`pendingOutbound` / `pendingInbound`），不要共用计数器。

### 3.2 握手

连接建立后第一个请求必须是 `initialize`（携带 `clientInfo: { name, title, version }`），
成功后再发 `initialized` 通知；握手前的其他请求一律拒绝。Main 进程在重启
Agent Server 后负责自动重放握手。

`initialize` 的响应应带回运行环境信息（数据目录、平台、Server 版本），
Renderer 据此做能力分支，不要靠 `process.platform` 各自判断。

### 3.3 方法命名空间

| 命名空间 | 方法 | 说明 |
|---|---|---|
| 项目（Main 本地） | `project/list` `project/create` `project/remove` `project/rename` `project/reorder` `project/select` | 项目是**纯客户端概念**，Agent Server 只认路径（见 §4.1） |
| 会话 | `task/start` `task/resume` `task/read` `task/list` `task/fork` `task/archive` `task/unarchive` `task/delete` `task/rename` `task/setPinned` `task/unsubscribe` | `list` 支持双向 cursor 分页 + `cwd`/`archived`/`pinned`/`searchTerm` 过滤 |
| 轮次 | `turn/start` `turn/steer` `turn/interrupt` | `start` 带 input 数组（text/image/localImage/mention）+ 每轮覆盖项（model/effort/sandbox） |
| 条目(通知) | `entry/started` `entry/delta` `entry/completed` | UI 流式渲染的三段生命周期 |
| 轮次(通知) | `turn/started` `turn/completed` `turn/diffUpdated` `turn/planUpdated` | completed 带最终 status（completed/interrupted/failed） |
| 任务(通知) | `task/started` `task/statusChanged` `task/renamed` `task/archived` `task/deleted` `task/closed` `task/tokenUsageUpdated` | statusChanged 驱动侧栏状态点 |
| 审批(反向请求) | `approval/request` | kind: commandRun / fileChange / permission；应答 decision |
| 工具(反向请求) | `tool/requestInput` `tool/call` | Agent 向用户提问 / 调用**由客户端实现**的工具（截图、浏览器控制等） |
| 模型 | `model/list` | 含 displayName、effort 选项、isDefault、inputModalities |
| 文件 | `fs/readDir` `fs/readFile` `fs/writeFile` `fs/watch` `fs/unwatch` + `fs/changed`(通知) | 见 §8 的实现位置权衡 |
| 配置 | `config/read` `config/write` | 应用设置持久化 |

`tool/call` 值得单列：它让 Agent 能调用**渲染层实现的能力**，
是在不改后端的前提下扩展 Agent 的唯一口子，协议早期就要留出。

### 3.4 任务运行时状态机

```
             task/start|resume         turn/start           turn/completed
notLoaded ──────────────────▶ idle ──────────────▶ active ──────────────▶ idle
                                ▲                    │
                                │      activeFlags: ['awaitingApproval'] 等
                                │      （挂起不是独立状态，是 active 的标志位）
                                │                    ▼
                                └──────────── 应答后清除标志，继续 active

  unsubscribe 后无订阅无活动超过宽限期 → closed（卸载，回到 notLoaded）
  不可恢复错误 → systemError
```

```ts
type TaskStatus =
  | { type: 'notLoaded' }
  | { type: 'idle' }
  | { type: 'active'; activeFlags: TaskActiveFlag[] }   // 'awaitingApproval' | 'compacting' | ...
  | { type: 'systemError' }
```

**用「active + 标志位」而不是把 `waitingApproval` 做成平级状态。**
挂起原因会不断增加（等审批、等用户输入、上下文压缩中、工具启动中），
平级枚举每加一种都要改所有 switch；标志位数组只加常量，UI 未知标志忽略即可。

Renderer 只消费 `task/statusChanged` 维护侧栏状态，不自己推导。

### 3.5 恢复语义（重要，初版此处有误）

`task/resume` 是**一个动作完成三件事**：加载历史 turns、订阅实时事件、
若该任务正在运行则重新加入（而不是新建）。因此：

```ts
// ✅ 正确：一次调用
const { task } = await rpc.request('task/resume', { taskId })
// task.turns 已含历史，之后 entry/* 通知继续流式补充

// ❌ 错误：先 read 再 resume
await rpc.request('task/read', { taskId })     // 拿历史
await rpc.request('task/resume', { taskId })   // 再订阅 —— 两次之间的事件会丢
```

`task/read` 的定位是**只读预览**（悬停预览、搜索结果展开），不订阅、不加载运行时。

"重新加入正在运行的任务"是必须支持的语义：用户切走再切回、
甚至关窗再开窗，正在跑的 Turn 应当继续，而不是断流。

### 3.6 列表分页

`task/list` 返回：

```ts
{
  data: TaskSummary[]
  nextCursor: string | null        // 继续向后翻
  backwardsCursor: string | null   // 反转 sortDirection 时用
}
```

双向游标是为"新消息插到列表顶部"准备的 —— 只有 `nextCursor` 时，
无法在不重拉整个列表的情况下补齐顶部新增项。

**空会话不入列表**：没有任何用户消息的 Task（用户点了新建但没发言）
不应出现在侧栏。服务端按 `preview <> ''` 过滤，客户端不要自己造空行。

---

## 4. 数据模型调整（`services/workspace/types.ts` 等）

### 4.1 Project —— 多根，且是纯客户端概念

```ts
// 项目：一组磁盘根路径的命名集合。Agent Server 不认识"项目"，只认路径。
export interface Project {
  id: string
  name: string
  rootPaths: string[]       // ★ 数组，不是单个字符串。见下方说明
  gitRemoteUrl?: string     // 去重/识别同一仓库用
  createdAt: number
  updatedAt: number
  defaultExpanded?: boolean // 纯 UI 态
}
```

**为什么一开始就要用数组**：一个项目挂多个目录（主仓 + 依赖库 + 文档站）
是很快就会遇到的需求，而 Turn 的上下文里本来就要携带一组工作根路径。
`string` → `string[]` 是破坏性变更，会波及注册表持久化格式、
`task/list` 过滤参数、文件树根、Composer 的项目 pill。**现在改是一行，以后改是一片。**

项目归属的判定用**精确相等**，不是前缀包含：

```ts
function findProject(projects: Project[], cwd: string): Project | null {
  return projects.find(p => p.rootPaths.some(r => path.relative(r, cwd) === '')) ?? null
}
```

对应地 `task/list` 传数组做精确匹配：

```ts
rpc.request('task/list', { cwd: project.rootPaths, archived: false, limit: 50 })
```

**两种 project id 并存**：

- 用户在 UI 里显式创建 → 随机 UUID
- 由已有任务的路径反推出来的 → `local-<稳定哈希(归一化根路径集合)>`

后者是必需的：用户可能先用命令行在某目录跑了任务，再打开 App。
没有派生 id，这些任务就会全部落到"无归属"里，体验上像是丢了。
哈希算法自定，只要**同一组路径永远得到同一个 id** 即可。

### 4.2 Task —— 从"展示行"升级为"会话摘要"

```ts
// 侧栏一行 = 一个会话的摘要。注意重命名：TaskItem → TaskSummary
export interface TaskSummary {
  id: string
  sessionId: string         // fork 链的根 id，fork 出的子任务继承
  forkedFromId: string | null
  projectId: string | null  // null = 无项目归属（见 §4.3）
  cwd: string               // ★ 真实事实来源，projectId 由它推导
  title: string | null      // 用户重命名过才有
  preview: string           // 首条用户消息，标题为空时展示它
  status: TaskStatus
  pinned: boolean
  archived: boolean
  unread?: boolean          // 客户端本地态
  createdAt: number
  updatedAt: number
  recencyAt: number         // ★ 排序用，与 updatedAt 分离
  gitBranch?: string
  gitSha?: string
}
```

三点说明：

- `timeAgo` 从模型里删掉，渲染时由 `updatedAt` 计算。存文案会在跨天、
  跨时区、窗口长时间不刷新时立刻穿帮。
- `recencyAt` 与 `updatedAt` 分开：后台自动动作（元数据回填、归档整理）
  会动 `updatedAt`，但不该让任务在侧栏跳到顶部。排序只认 `recencyAt`。
- `cwd` 是事实，`projectId` 是派生。任何时候两者冲突以 `cwd` 为准重算。

### 4.3 侧栏三分区是互斥划分

Pinned / Projects / Recents 不是三个重叠视图，而是对会话集合的一次**划分**——
同一个会话只出现在其中一处。判定顺序：

```ts
function sectionOf(chat: ChatSummary, shownProjectIds: Set<string>): SectionId {
  if (chat.pinned) return 'pinned'                       // 置顶优先，不再进其他分区
  if (chat.projectId && shownProjectIds.has(chat.projectId)) return 'projects'
  return 'recents'                                        // 无归属，或所属项目未作为分区显示
}
```

两条容易漏的规则：

- **置顶会话不在 Recents 重复出现**。先判 pinned 再判项目。
- **所属项目未显示时会话落到 Recents**，而不是凭空消失。项目被折叠、被过滤掉、
  或因分页未加载时，它的会话仍然可达。

`projectId: null` 的会话来自三处：命令行/外部工具在未注册目录起的会话、
用户删除了项目、路径匹配不上任何注册根。客户端侧维护：

```ts
interface WorkspaceState {
  projects: Record<string, Project>
  projectOrder: string[]                       // 侧栏顺序，用户可拖拽
  selection: { type: 'project'; projectId: string } | { type: 'unassigned' }
  chatAssignments: Record<string, {            // chatId → 归属，覆盖自动推导
    projectId: string | null
    cwd: string
  }>
  pinnedChatIds: string[]
}
```

空态：Pinned 无内容时**整个分区隐藏**；Projects 空时显示 `No projects`；
Recents 空时显示 `No chats`。

### 4.4 Entry —— 会话内的渲染单元

初版把它叫 `Item`，与侧栏的 `TaskItem` 撞名（一个是会话摘要，
一个是会话内条目），阅读时极易混淆。**统一改为 `Entry`**，
同时 `TaskItem` → `TaskSummary`。

```ts
export type Entry =
  | { type: 'userMessage';  id: string; clientId: string | null; content: UserInput[] }
  | { type: 'agentMessage'; id: string; text: string }
  | { type: 'reasoning';    id: string; summary: string[]; content: string[] }
  | { type: 'plan';         id: string; text: string }
  | { type: 'commandRun';   id: string; command: string; cwd: string
                            status: 'running' | 'completed' | 'failed'
                            actions: CommandAction[]      // 服务端已解析好的结构化动作
                            output: string | null; exitCode: number | null; durationMs: number | null }
  | { type: 'fileChange';   id: string; changes: FileChange[]; status: PatchStatus }
  | { type: 'toolCall';     id: string; tool: string; args: unknown
                            status: 'running' | 'completed' | 'failed'
                            result: unknown | null; durationMs: number | null }
  | { type: 'webSearch';    id: string; query: string }
  | { type: 'contextCompaction'; id: string }
  | { type: 'reviewBoundary';    id: string; phase: 'entered' | 'exited'; label: string }
```

**渲染器必须对未知 type 有兜底**（渲染成一个中性的折叠卡片而不是崩溃）。
Entry 类型只会越加越多，后端先行、前端后跟是常态。

`commandRun.actions` 让服务端把 shell 命令解析成结构化动作下发，
前端不要自己解析 shell 语法去猜"这条命令要干什么"——管道、
子 shell、引号转义足够让任何前端实现出错。

### 4.5 UserInput —— Composer 的输入模型

```ts
export type UserInput =
  | { type: 'text'; text: string; spans: TextSpan[] }   // spans 保留富文本标记
  | { type: 'image'; url: string }
  | { type: 'localImage'; path: string }
  | { type: 'mention'; name: string; path: string }     // @文件
  | { type: 'skill'; name: string; path: string }       // /技能
```

`spans` 是关键：`@文件`、`/技能` 在输入框里是可视 chip，
持久化后重新加载会话时必须还原成 chip 而不是退化成裸文本。
把标记范围与纯文本分开存，是唯一能做到往返无损的结构。

---

## 5. 前端各文件调整清单

### 5.1 `services/` — 拆分与新增

- `workspace/types.ts`：按 §4 改模型；`WorkspaceService` 瘦身为项目域接口：
  `listProjects / createProject / removeProject / renameProject / reorderProjects`。
- 新增 `services/task/types.ts` + `taskService`：
  `listTasks(cwd[], cursor) / readTask / resumeTask / startTask / startTurn /
  steerTurn / interruptTurn / setPinned / archive / rename / delete / subscribe(events)`。
- `services/index.ts` 单例处切换实现：`MockWorkspaceService` →
  `RpcWorkspaceService`。UI 层零改动，现有抽象保留价值。
- **清理**：`mockWorkspaceService.ts` 里的 mock 项目名与任务标题含外部产品名，
  接入真实数据前替换为中性占位内容。

### 5.2 `state/` — 新增 SessionContext，改造 WorkspaceContext

- 新增 `SessionContext.tsx`：
  - 状态：`activeTaskId`、`entriesByTask: Map<taskId, Entry[]>`、
    `turnStateByTask`、审批队列 `pendingApprovals`。
  - 订阅 `entry/*` `turn/*` `task/statusChanged` 做增量更新；
    `entry/delta` 高频事件**按 taskId 分片**，只重渲染对应会话视图，
    不经过 WorkspaceContext（避免 delta 触发整树渲染）。
  - 切换任务：`task/resume` 一次调用（§3.5）；切走 `task/unsubscribe`。
- `WorkspaceContext`：`load()` 保留用于首屏，但列表变更改由通知驱动
  （`task/started/archived/renamed/deleted` → 局部更新），不再整体 refresh。
- `PanelContext`：`PanelTabKind` 扩展 `'terminal' | 'diff'`；`payload` 增加
  `taskId` 关联（diff tab 跟随任务变更集）。

### 5.3 新增会话视图（当前完全缺失）

```
components/session/
├── SessionView.tsx        # 任务页容器：Entry 流 + 底部 Composer
├── EntryStream.tsx        # 虚拟列表渲染 Entry[]
├── entries/
│   ├── UserMessageCard.tsx
│   ├── AgentMessageCard.tsx   # markdown + 流式追加
│   ├── ReasoningCard.tsx      # 可折叠
│   ├── CommandRunCard.tsx     # 命令 + 退出码 + 可展开输出
│   ├── FileChangeCard.tsx     # diff 摘要 + "在面板打开" → openTab('right', diff)
│   ├── ToolCallCard.tsx
│   └── UnknownEntryCard.tsx   # ★ 未知 type 兜底，不可省
├── ApprovalCard.tsx       # approval/request 反向请求的应答 UI
└── entryRegistry.ts       # entry.type → 组件映射，新增类型不动主流程
```

`ContentArea` 需要一个最小路由：`activeTaskId === null → HomeView`，否则
`SessionView`（可放在 SessionContext 派生，不必引路由库）。

### 5.4 `Composer.tsx` — 从静态到受控

- textarea 受控；提交逻辑：
  - 无 activeTask → `task/start { cwd: currentProject.rootPaths[0], input }`
    后接 `turn/start`；
  - 任务 idle → `turn/start`；任务 active → `turn/steer`（追加输入）。
- 发送按钮三态：空输入禁用 / 可发送 / 运行中变停止（`turn/interrupt`）。
- 模型与 effort：挂载时 `model/list` 拉取，选择结果存入 SessionContext
  （随 `turn/start` 下发），删除硬编码的 "5.6 Sol / Extra High"。
- 权限 pill（"Full access"）：绑定 sandbox/approval 策略枚举，随 turn 下发。
- 项目/Branch pill：项目来自 WorkspaceContext；branch 待 git 信息服务就绪后接。

**发送后不要自己往 Entry 流里插用户消息。** 服务端会把用户消息作为
`entry/started(userMessage)` 回显，前端乐观插入会得到两条。
需要即时反馈就走这条路：

```ts
const clientId = crypto.randomUUID()
addOptimisticEntry({ type: 'userMessage', id: clientId, clientId, content })
await rpc.request('turn/start', { taskId, clientMessageId: clientId, input })

// 收到回显时按 clientId 替换而不是追加
function onEntryStarted(entry: Entry) {
  if (entry.type === 'userMessage' && entry.clientId) {
    replaceEntryById(entry.clientId, entry)   // 用真实 id 替换乐观条目
  } else {
    appendEntry(entry)
  }
}
```

### 5.5 `Sidebar / TaskRow` — 接真实操作

- 组件与类型重命名：`TaskRow` 的 props 由 `TaskItem` 改为 `TaskSummary`。
- 状态点：`status.type === 'active'` 转圈、含 `awaitingApproval` 标志时黄点、
  `systemError` 红点；未读蓝点保留为本地态。
- 右键/省略号菜单接线：`task/setPinned` `task/rename` `task/archive`
  `task/delete`（删除需确认弹窗）。
- 时间列：`recencyAt` → 相对时间工具函数（不是 `updatedAt`，见 §4.2）。
- 列表分页：滚动到底加载下一页 cursor。
- 底部新增「未归类」分组（§4.3）。

### 5.6 `main/` 与 `preload/` — 协议承载层

```
src/shared/rpc/
├── messages.ts     # JsonRpcRequest/Response/Notification 类型与守卫
├── peer.ts         # 编解码 + id 配对 + 事件分发（main 与 renderer 共用）
└── chunked.ts      # 分块流式消息编解码（见 §6）

src/main/agent/
├── AgentServerHost.ts   # spawn 子进程、stdio JSONL 读写、崩溃重启+重放握手
├── RpcRouter.ts         # 本地方法 vs 转发的统一路由；
│                        # server notification → 广播；
│                        # server 反向请求 → 转发 renderer 并回写应答
└── ipc.ts               # 注册单一 RPC 通道 + ACK 通道

src/main/workspace/
├── ProjectRegistry.ts   # 项目列表持久化（userData/workspace.json）
└── bootstrap.ts         # 首屏同步快照（见 §7）

src/main/fileIpc.ts      # rootOf() 改为查 ProjectRegistry；逐步并入 fs/*
```

`src/shared/` 需要同时被两侧 tsconfig 收录，并加 vite alias：

```jsonc
// tsconfig.node.json
"include": ["electron.vite.config.*", "src/main/**/*", "src/preload/**/*", "src/shared/**/*"]
// tsconfig.web.json
"include": [..., "src/shared/**/*"]
"paths": { "@renderer/*": ["src/renderer/src/*"], "@shared/*": ["src/shared/*"] }
```

```ts
// electron.vite.config.ts —— 三端都要加
const shared = { '@shared': resolve('src/shared') }
export default defineConfig({
  main:     { resolve: { alias: shared } },
  preload:  { resolve: { alias: shared } },
  renderer: { resolve: { alias: { '@renderer': resolve('src/renderer/src'), ...shared } },
              plugins: [react(), tailwindcss()] }
})
```

preload 暴露一个入口：

```ts
window.rpc = {
  request<T>(method: string, params?: unknown): Promise<T>
  notify(method: string, params?: unknown): void
  onEvent(handler: (method: string, params: unknown) => void): () => void
  onServerRequest(handler: (id: number, method: string, params: unknown) => void): () => void
  respond(id: number, result: unknown): void
  respondError(id: number, code: number, message: string): void
}
```

过渡期内 file/shell 的旧通道保留，待 `fs/*` 就绪后统一切换、删除旧通道。

---

## 6. 大 payload 的流式传输与背压（新增，优先级高）

Electron IPC 走 structured clone。一次 `task/resume` 返回的历史可能是
几千个 Entry、几 MB 的命令输出，**主进程序列化 + 渲染进程反序列化会同时卡帧**，
表现为"点开一个长会话，整个窗口白屏一两秒"。

解法：对超过阈值的响应，主进程不整体下发，而是**词法化成 token 流分块推送**，
渲染进程增量重建并可边收边渲染。

```ts
// src/shared/rpc/chunked.ts
export const CHUNK_MARKER = 'workstudio/chunked-payload-v1'

export type PayloadToken =
  | { type: 'object-start' } | { type: 'array-start' } | { type: 'container-end' }
  | { type: 'key';    value: string }
  | { type: 'value';  value: string | number | boolean | null }
  | { type: 'string-start'; target: 'key' | 'value' }
  | { type: 'string-chunk'; value: string }     // 超长字符串再切片
  | { type: 'string-end' }

export interface ChunkedFrame {
  marker: typeof CHUNK_MARKER
  transferId: string
  sequence: number
  kind: 'start' | 'chunk' | 'end'
  tokens?: PayloadToken[]
}
```

配一条 ACK 通道做背压：渲染进程每消费完 N 帧回一次
`ack(transferId, sequence)`，主进程据此控制在途帧数（例如上限 8 帧），
避免渲染进程来不及消费时消息在事件循环里无限堆积。

**为什么要把长字符串也切片**：单条命令的 `aggregatedOutput` 可能就有几 MB
（例如一次全量构建日志）。只切对象层级而不切字符串，最大的那块照样一次性过。

启用阈值建议：响应体估算 > 256 KB 才走分块，小响应直接走普通路径，
不要为了统一而给所有调用加开销。

---

## 7. 首屏同步快照（新增）

侧栏的项目/任务列表如果等异步 IPC 返回再渲染，第一帧必然是空列表，
用户看到的是"闪一下才出内容"。主题同理——异步读取主题会先白屏再变暗。

在 preload 阶段用**同步** IPC 取一份快照：

```ts
// preload
const bootstrap = ipcRenderer.sendSync('workstudio:bootstrap')
// { projects, projectOrder, selected, recentTasks, theme, windowState }

// 主题在 preload 阶段就落到 html 上，杜绝闪白
document.documentElement.classList.add(bootstrap.theme === 'dark' ? 'theme-dark' : 'theme-light')

contextBridge.exposeInMainWorld('bootstrap', { get: () => bootstrap })
```

Renderer 的 `WorkspaceContext` 用它作为 `useState` 初值，
挂载后再异步拉全量做校正：

```ts
const [data, setData] = useState<WorkspaceData>(() => window.bootstrap.get())
```

同步 IPC 会阻塞一次进程往返，只用于**首屏必需且数据量小**的场景
（项目列表 + 最近任务 + 主题），其余一律异步。快照数据由主进程从
`ProjectRegistry` 内存态直接给出，不要在这条路径上读磁盘或查 Agent Server。

---

## 8. `fs/*` 放主进程还是放协议

两种都可行，权衡如下：

| | 放主进程（Node fs 直接读） | 放协议（转发 Agent Server） |
|---|---|---|
| 本地性能 | 快，无序列化往返 | 多一跳 |
| 实现成本 | 低，现有 `fileIpc.ts` 可复用 | 需后端实现全套 fs 方法 |
| 远端/容器场景 | ✗ 完全不可用 | ✓ 天然支持 |
| 与 Agent 视图一致性 | 可能不一致（沙箱边界看不到） | ✓ 一致 |
| 文件变更推送 | 需自建 watcher，与 Agent 写入有竞态 | ✓ 同一条事件流 |

**建议**：现阶段（纯本地）保留在主进程，但**接口形状按协议定义**
（`fs/readDir` `fs/readFile` `fs/watch`），由 `RpcRouter` 路由到本地 handler。
这样将来要支持远端时，只改路由表一行，UI 与服务层完全不动。

现有 `fileIpc.ts` 的 `rootOf()` 写死 `process.cwd()`，
接 `ProjectRegistry` 后改为按 `projectId` 查 `rootPaths`，
并保留现有的路径逃逸校验（`safeResolve`）——那段逻辑是对的，别丢。

---

## 9. 渲染性能与状态管理注意点

- `entry/delta` 每轮可能上百条：SessionContext 内部对同一 entry 的 delta 做
  微批（`requestAnimationFrame` 合帧）后再 setState。
- Context 足够覆盖当前规模；若合帧后仍引起会话页外重渲染，
  再引入外部 store（`useSyncExternalStore`），接口不变。
- Entry 流用稳定 `entryId` 作 key；历史回填与实时流在 `SessionContext` 内
  按 `(turnIndex, entryIndex)` 排序合并，避免闪烁。
- 长会话必须虚拟列表。命令输出卡片折叠态只渲染前若干行，
  展开时才挂载完整内容——几 MB 的输出全量进 DOM 会直接卡死。

---

## 10. 实施顺序（可独立验证的里程碑）

| 里程碑 | 内容 | 验证方式 |
|---|---|---|
| M1 协议骨架 | `shared/rpc` + AgentServerHost + RpcRouter + preload rpc + 一个最小 echo 后端进程 | 渲染页调 `rpc.request('initialize')` 打通；通知/反向请求回路通畅 |
| M2 项目注册表 | ProjectRegistry（多根）+ CreateProjectDialog 选目录 + bootstrap 快照 + fileIpc 接 rootPaths | 新建项目指向真实目录，文件树浏览该目录，首屏无闪烁 |
| M3 任务列表 | taskService.listTasks（cwd 数组过滤 + 分页）+ TaskRow 状态/菜单接线 + 未归类分组 | 任务增删改、状态点随通知变化 |
| M4 会话主流程 | SessionView + Entry 渲染器 + Composer 提交/停止 + delta 流式渲染 + 乐观条目去重 | 完整跑通一轮问答，无重复用户消息 |
| M5 审批 | ApprovalCard + 反向请求应答链路 | 命令审批允许/拒绝生效 |
| M6 大 payload | chunked 传输 + ACK 背压 | 打开含 5k+ Entry 的会话不卡顿 |
| M7 完善 | model/list、设置页、归档页、diff/terminal tab | — |

M1-M2 不依赖真实 Agent 能力（echo/桩后端即可），UI 与协议可以先全部定型。

---

## 11. 相对初版的修订清单

| # | 初版 | 本版 | 原因 |
|---|---|---|---|
| 1 | `Project.rootPath: string` | `rootPaths: string[]` | 多根是既定需求，后改是破坏性变更（§4.1） |
| 2 | 项目 id 仅由注册表分配 | 增加路径派生 id | 否则外部工具起的任务全部无归属（§4.1） |
| 3 | 无"无归属任务"概念 | 新增 `unassigned` 分组与持久化 | 删项目/改路径后任务会像丢失（§4.3） |
| 4 | 先 `task/read` 再 `task/resume` | 单独 `task/resume` | 两次调用之间的事件会丢；resume 本身即含历史+订阅+重连（§3.5） |
| 5 | `waitingApproval` 作为平级状态 | `active` + `activeFlags[]` | 挂起原因会持续增加，平级枚举扩展成本高（§3.4） |
| 6 | 条目命名 `Item` | `Entry`，同时 `TaskItem`→`TaskSummary` | 与侧栏 `TaskItem` 撞名（§4.4） |
| 7 | 仅 cursor | `nextCursor` + `backwardsCursor` | 顶部新增项无法增量补齐（§3.6） |
| 8 | Composer 直接提交 | 增加 `clientMessageId` 去重 | 服务端会回显用户消息，否则出现两条（§5.4） |
| 9 | 排序依据 `updatedAt` | `recencyAt` | 后台元数据回填会让任务无故跳顶（§4.2） |
| 10 | 未提及 | 新增 §6 分块流式 + 背压 | 长会话打开时白屏是必现问题 |
| 11 | 未提及 | 新增 §7 首屏同步快照 | 消除侧栏与主题闪烁 |
| 12 | `fs/*` "逐步吸收" | 明确权衡与建议（§8） | 本地场景下走协议是净损失，但接口形状要预留 |
| 13 | 5 种条目卡片 | 10+ 种 + 未知类型兜底 | 后端先行时前端不能崩 |
| 14 | 未提及 | `tool/call` 反向请求 | 扩展 Agent 能力的唯一口子，需早定 |
