# Codex 桌面应用逆向分析（实测验证版）

> 本文所有结论均来自**本机实测**，而非记忆或公开文档转述。
> 取证对象：
> - `/Applications/ChatGPT.app`（Electron，内含 `app.asar` + `Resources/codex` 二进制）
> - `/opt/homebrew/bin/codex` v0.147.0（`codex-cli`）
> - `~/.codex/`（运行时数据：sessions / sqlite / 全局状态）
>
> 每节标注证据类型：
> **【实测】**= 本机命令输出直接验证；
> **【拆包】**= 从 `app.asar` 反混淆代码读出；
> **【推断】**= 由前两者合理推导，未直接观测。
>
> 本文修正了 `codex-architecture-reverse-analysis.md` 中的若干错误结论，见 §11。

---

## 0. 复现取证的命令

```bash
# 1. 生成与本机 codex 版本完全一致的协议类型（最重要的一条）
codex app-server generate-ts --out ./schemas          # 94 个 .ts + v2/ 子目录
codex app-server generate-json-schema --out ./schemas

# 2. 观察桌面 App 真实的进程拓扑
ps -eo pid,ppid,command | grep app-server

# 3. 拆 Electron 包
npx @electron/asar list /Applications/ChatGPT.app/Contents/Resources/app.asar
npx @electron/asar extract-file .../app.asar .vite/build/preload.js

# 4. 直接驱动 app-server（stdio JSONL）
codex app-server --listen stdio://

# 5. 核心状态库
sqlite3 ~/.codex/state_5.sqlite ".schema threads"
```

---

## 1. 进程拓扑（实测）

`ps -eo pid,ppid,command` 的真实输出：

```
PID    PPID   COMMAND
88387  1      /Applications/ChatGPT.app/Contents/MacOS/ChatGPT          ← Electron main
88582  88387  /Applications/ChatGPT.app/Contents/Resources/codex \
                 -c features.code_mode_host=true app-server \
                 --analytics-default-enabled                            ← Agent 子进程
```

**结论（关键）：桌面 App 把 `codex app-server` 作为 Electron 主进程的直接子进程 spawn，
走默认 `stdio://` 传输。** 没有 `--listen`，即没有端口、没有 socket 文件 —— 纯 stdin/stdout
JSONL 管道。

配套观察：

- 二进制是**随 App 自带**的（`ChatGPT.app/Contents/Resources/codex`，218 MB），
  不依赖用户是否装了 CLI。App 里的 codex 与 `/opt/homebrew/bin/codex` 是两份独立文件。
- `Resources/` 下还有 `codex-code-mode-host`（50 MB）和 `codex_chronicle`（4.6 MB）两个辅助二进制。
- `-c features.code_mode_host=true` 说明桌面版默认开启 code-mode host 特性。
- Electron 框架被改名打包为 `Codex Framework.framework`（Chromium 151），
  渲染进程叫 `Codex (Renderer)`。

> 对照组：本机还跑着 `codex app-server --listen ws://127.0.0.1:65234`，
> 但它的父进程是 `node src/server/index.ts`（第三方 codex-web 项目），
> **不是** ChatGPT.app 起的。不要被这个误导 —— 官方桌面版用 stdio。

---

## 2. 三层架构与职责边界

```
┌──────────────────────────────────────────────────────────────┐
│ Renderer (React SPA, app.asar/webview/)                      │
│  • 侧栏：Projects / Threads     • 会话区：ThreadItem 流渲染     │
│  • Composer      • 面板：文件树 / diff / 终端 / 浏览器          │
│  ✗ 不持有 agent，不发 HTTP 到模型，不直接读文件                  │
└───────────────▲──────────────────────────────────────────────┘
                │ 单一泛化消息通道（见 §3），非 per-feature IPC
┌───────────────┴──────────────────────────────────────────────┐
│ Electron Main (.vite/build/main-*.js, 2.5 MB)                │
│  • spawn + 托管 codex app-server 子进程                        │
│  • JSON-RPC 编解码：id↔Promise 配对、notification 广播          │
│  • ★ Project 概念的唯一实现者（协议里没有 project）              │
│  • 持久化 ~/.codex/.codex-global-state.json                   │
│  • codex-history-snapshots.db（better-sqlite3，线程历史缓存）   │
│  • node-pty（终端）、node-mac-permissions、objc-js             │
└───────────────▲──────────────────────────────────────────────┘
                │ stdio JSONL (JSON-RPC 2.0 语义)
┌───────────────┴──────────────────────────────────────────────┐
│ codex app-server (Rust)                                      │
│  • Thread / Turn / Item 生命周期   • Agent 循环（调模型）        │
│  • 工具执行：shell / apply_patch / MCP / fs                    │
│  • 沙箱（Seatbelt/Landlock）+ 审批反向请求                     │
│  • 持久化：rollout JSONL + state_5.sqlite + thread_history.sqlite│
└──────────────────────────────────────────────────────────────┘
```

**最重要的一条设计原则：UI 不碰 agent，Main 不实现 agent。**
Main 是一个**协议适配器 + 客户端侧概念（Project）的宿主**，仅此而已。

---

## 3. Electron Main ↔ Renderer 的 IPC 设计【拆包 · 完整还原】

这一节是老文档写错最多的地方。`preload.js` 只有 4.4 KB，反混淆后设计非常清晰。

### 3.1 不是 per-feature IPC，而是单一泛化通道

```js
const S = 'codex_desktop:message-from-view'   // renderer → main
const C = 'codex_desktop:message-for-view'    // main → renderer

contextBridge.exposeInMainWorld('electronBridge', {
  sendMessageFromView: async (msg) => { await ipcRenderer.invoke(S, msg) },
  // ...
})

// main → renderer 不是回调，而是重新派发成 window 的 message 事件：
ipcRenderer.on(C, (_e, payload) => {
  window.dispatchEvent(new MessageEvent('message', { data: payload }))
})
```

要点：

- 渲染层**不是**通过 `bridge.onXxx(cb)` 订阅，而是全局 `window.addEventListener('message')`。
  好处：renderer 侧可以用同一套 message 处理逻辑同时兼容 Electron 宿主和 Web/iframe 宿主
  （`codexWindowType` 暴露为 `'electron'`，代码里据此分支）。
- 所有业务消息共用一个信封，类型靠 `msg.type` 判别。新增功能不需要动 preload。

### 3.2 分块流式消息协议（大 payload 的关键）

`preload.js` 里有一个完整的校验器，协议名 `codex-host-chunked-message-v1`：

```ts
type ChunkedMessage = {
  marker: 'codex-host-chunked-message-v1'
  transferId: string
  sequence: number                    // 必须是 safe integer
  kind: 'start' | 'chunk' | 'end'
  tokens?: JsonToken[]                // kind === 'chunk' 时
}

// tokens 是"流式 JSON 词法单元"，不是 JSON 片段字符串：
type JsonToken =
  | { type: 'array-start' } | { type: 'object-start' }
  | { type: 'container-end' }
  | { type: 'string-start', target: 'key' | 'value' }
  | { type: 'string-chunk', value: string }
  | { type: 'string-end' }
  | { type: 'key', value: string }
  | { type: 'value', value: string | number | boolean | null }
```

配套一条**背压 ACK 通道**：

```js
'codex_desktop:chunked-message-ack'
acknowledgeChunkedMessage: (transferId, sequence) => ipcRenderer.send(ACK, transferId, sequence)
```

**为什么要这么做**：Electron 的 `ipcRenderer` 走 structured clone，一条巨大的
`thread/read` 结果（几万行历史 + 大段命令输出）会造成**一次性反序列化卡顿**，
主/渲染进程同时掉帧。Codex 的做法是把 JSON 在主进程侧**词法化成 token 流**，
分块推送，渲染进程增量重建对象并可以边收边渲染；ACK 让主进程知道渲染进程
消费到哪了，避免无限堆积。

> 这是整个逆向里最值得直接抄的一个设计。你要做长会话历史 / 大文件 diff，
> 迟早会撞上同样的问题。

### 3.3 同步快照：首屏零往返

```js
const D = ipcRenderer.sendSync('codex_desktop:get-shared-object-snapshot') ?? {}
getSharedObjectSnapshotValue: (key) => D[key]

// 更新走异步通道，本地镜像同步维护
'shared-object-set'      // renderer 主动写
'shared-object-updated'  // main 推送变更
```

还有一个专用的：

```js
getInitialSidebarBootstrap: () => ipcRenderer.sendSync('codex_desktop:get-initial-sidebar-bootstrap')
```

**侧栏（项目 + 会话列表）的首屏数据是 `sendSync` 同步取的**，因此第一帧就有内容，
不会出现"先空列表再刷入"的闪烁。代价是阻塞一次 IPC —— 他们认为对首屏值得。
主题同理：`get-system-theme-variant` 同步取，preload 阶段就往
`documentElement` 加 `electron-dark` / `electron-light` class，**杜绝主题闪白**。

### 3.4 其余暴露的能力

| API | 用途 |
|---|---|
| `getPathForFile(file)` | `webUtils.getPathForFile`，拖拽文件拿真实路径（Electron 32+ 唯一正解） |
| `startFileDrag(path)` | 反向拖拽：从 App 拖文件到 Finder |
| `showContextMenu(spec)` | 原生右键菜单（不是 HTML 菜单） |
| `sendWorkerMessageFromView(id, msg)` / `subscribeToWorkerMessages(id, cb)` | 按 worker id 分频道的独立通道 |
| `connect-app-host` | `ipcRenderer.postMessage(ch, undefined, [port])` 转移 **MessagePort**，给 MCP App 沙箱用 |
| `getDesktopUserAgent()` | `Codex Desktop/{ver} (Mac OS; arm64)` |

MCP App 沙箱那条尤其巧妙：把 `MessagePort` 直接转移给主进程，
之后沙箱 iframe 与宿主是**点对点**通信，不再经过主消息总线。

---

## 4. app-server 协议全貌【实测：generate-ts 输出】

`codex app-server generate-ts` 在本机 v0.147.0 生成 **94 个顶层类型 + `v2/` 下 500+ 个**。
三类消息：

### 4.1 ClientRequest —— 客户端能调的方法（约 100 个）

按域分组（完整列表见生成的 `ClientRequest.ts`）：

| 域 | 方法 | 说明 |
|---|---|---|
| 握手 | `initialize` | 必须最先调用 |
| **Thread** | `thread/start` `thread/resume` `thread/fork` `thread/list` `thread/read` `thread/archive` `thread/delete` `thread/unarchive` `thread/rollback` `thread/name/set` `thread/metadata/update` `thread/compact/start` `thread/inject_items` `thread/unsubscribe` | 会话生命周期 |
| **Section** | `threadSection/list` `threadSection/create` `threadSection/update` `threadSection/delete` `thread/section/move` | 会话分组（如 "Pinned"） |
| **Turn** | `turn/start` `turn/steer` `turn/interrupt` | 一轮对话 |
| **fs** | `fs/readFile` `fs/writeFile` `fs/readDirectory` `fs/createDirectory` `fs/remove` `fs/copy` `fs/getMetadata` `fs/watch` `fs/unwatch` | **文件树/编辑器全靠这组** |
| **命令** | `command/exec` `command/exec/write` `command/exec/terminate` `command/exec/resize` | **集成终端（PTY）** |
| 搜索 | `fuzzyFileSearch` | `@` 提及文件的补全 |
| Git | `gitDiffToRemote` | diff 视图 |
| 配置 | `config/read` `config/value/write` `config/batchWrite` `configRequirements/read` | |
| 模型 | `model/list` `modelProvider/capabilities/read` | |
| 账号 | `account/login/start` `account/logout` `account/rateLimits/read` `account/usage/read` | |
| MCP | `mcpServerStatus/list` `mcpServer/tool/call` `mcpServer/resource/read` `mcpServer/oauth/login` | |
| 扩展 | `skills/list` `hooks/list` `plugin/*` `app/*` `marketplace/*` | |
| 审查 | `review/start` | 代码审查模式 |

**注意 `fs/*` 和 `command/exec`：文件树、编辑器、终端这些"看起来是 Electron 本地能力"的东西，
Codex 全部走 app-server。** 原因见 §8。

### 4.2 ServerNotification —— 服务端事件（72 个）

UI 渲染的主要数据源：

```
thread/started  thread/status/changed  thread/name/updated  thread/closed
thread/tokenUsage/updated  thread/compacted  thread/settings/updated
turn/started  turn/completed  turn/diff/updated  turn/plan/updated
item/started  item/completed
item/agentMessage/delta            ← 助手文本流式增量
item/reasoning/summaryTextDelta    ← 推理摘要流式
item/reasoning/textDelta
item/plan/delta
item/commandExecution/outputDelta  ← 命令输出流式
item/commandExecution/terminalInteraction
item/fileChange/outputDelta  item/fileChange/patchUpdated
item/mcpToolCall/progress
hook/started  hook/completed
mcpServer/startupStatus/updated
fs/changed                          ← 文件监听推送
error  warning  guardianWarning  configWarning  deprecationNotice
account/updated  account/rateLimits/updated
model/rerouted  model/verification  model/safetyBuffering/updated
```

### 4.3 ServerRequest —— **反向请求**（10 个，最易漏）

服务端主动向客户端发起、**需要客户端回 response** 的请求：

```
item/commandExecution/requestApproval   ← 执行命令审批
item/fileChange/requestApproval         ← 写文件审批
item/permissions/requestApproval        ← 权限提升审批
item/tool/requestUserInput              ← 工具向用户提问
mcpServer/elicitation/request           ← MCP 表单
item/tool/call                          ← 动态工具（由客户端实现！）
account/chatgptAuthTokens/refresh       ← 刷新令牌
attestation/generate                    ← 设备证明
applyPatchApproval / execCommandApproval  ← 旧版
```

这意味着**协议是真双向的**。你的传输层必须能处理"从 server 来、带 id 的消息"，
并把用户的选择作为 JSON-RPC response 写回。

`item/tool/call` 特别值得注意：agent 可以调用**由客户端实现的工具**
（桌面版用它做截图、浏览器控制等），这是扩展 agent 能力而不改 Rust 核心的口子。

---

## 5. 一次完整对话的真实时序【实测抓包】

我实际驱动了一次 `thread/start` + `turn/start`，原始消息序列如下
（`→` 客户端发，`←` 服务端发）：

```jsonc
→ {"id":1,"method":"initialize","params":{
     "clientInfo":{"name":"workstudio","title":"WorkStudio","version":"0.1.0"},
     "capabilities":{"experimentalApi":true,"requestAttestation":false}}}
← {"id":1,"result":{
     "userAgent":"workstudio/0.147.0 (Mac OS 26.6.1; arm64) ghostty/1.3.1 (workstudio; 0.1.0)",
     "codexHome":"/Users/fanjunjie/.codex",
     "platformFamily":"unix","platformOs":"macos"}}

→ {"method":"initialized","params":{}}                    // 通知，无 id
← {"method":"remoteControl/status/changed","params":{...,"emittedAtMs":1786253045614}}

→ {"id":2,"method":"thread/start","params":{
     "cwd":"/tmp","sandbox":"read-only","approvalPolicy":"on-request"}}
← {"id":2,"result":{"thread":{"id":"019fe4fb-6fb1-70c0-9682-3cd2f2e1f5f1",...}}}
← {"method":"thread/started","params":{"thread":{...}}}
← {"method":"mcpServer/startupStatus/updated","params":{"name":"chrome-devtools-mcp","status":"starting"}}
← {"method":"mcpServer/startupStatus/updated","params":{"name":"node_repl","status":"starting"}}
← {"method":"mcpServer/startupStatus/updated","params":{"name":"playwright","status":"starting"}}
← ... 各自再来一条 "status":"ready"

→ {"id":3,"method":"turn/start","params":{
     "threadId":"019fe4fb-...",
     "input":[{"type":"text","text":"Say exactly: hi.","text_elements":[]}]}}
← {"id":3,"result":{"turn":{"id":"019fe4fb-7f52-...","items":[],
     "itemsView":"notLoaded","status":"inProgress"}}}
← {"method":"thread/status/changed","params":{"status":{"type":"active","activeFlags":[]}}}
← {"method":"turn/started","params":{"turn":{...,"startedAt":...}}}
← {"method":"hook/started","params":{"run":{"id":"session-start:3:/Users/.../hooks.json",
     "eventName":"sessionStart",...}}}
← {"method":"hook/completed","params":{...}}
← {"method":"hook/started","params":{"run":{"eventName":"userPromptSubmit",...}}}
← {"method":"hook/completed","params":{...}}
← {"method":"item/started","params":{"item":{"type":"userMessage","id":"...",
     "content":[{"type":"text","text":"Say exactly: hi.","text_elements":[]}]}}}
← {"method":"item/completed","params":{"item":{"type":"userMessage",...}}}
   // 此后是 item/agentMessage/delta 流 → item/completed → turn/completed
```

**从这段抓包能确认的事实：**

1. `initialize` 的 `id` 与 response 严格配对；`initialized` 是**通知**（无 id）。
2. `thread/start` 的 result 和 `thread/started` 通知**都会来**，内容重复。
   客户端应以通知为准做状态机驱动，result 只用来拿到 threadId。
3. **MCP server 是 per-thread 惰性启动的** —— `thread/start` 之后才 starting→ready，
   且事件带 `threadId`。UI 需要展示这个启动过程（否则用户以为卡住）。
4. **Hook 在 turn 内执行并广播**（sessionStart / userPromptSubmit），
   在 `item/started` 之前。UI 可以据此显示"正在执行钩子"。
5. 用户消息本身也是一个 `item`，由**服务端**回显 `item/started`/`item/completed`。
   客户端**不应该**自己往列表里插用户消息 —— 等服务端回显，否则会重复。
   （`clientUserMessageId` 字段就是用来做乐观 UI 去重的。）
6. `turn/start` 的 result 里 `items:[]` + `itemsView:"notLoaded"` —— 内容全靠后续通知增量填。

---

## 6. Session（Thread）是怎么获取和持久化的

### 6.1 三处存储【实测】

```
~/.codex/
├── sessions/2026/08/08/rollout-2026-08-08T21-58-44-<uuid>.jsonl   ← 真相之源
├── session_index.jsonl        ← 轻量索引 {id, thread_name, updated_at}
├── state_5.sqlite             ← 列表查询用的元数据表
└── thread_history_1.sqlite    ← 渲染用的 item/turn 投影
```

### 6.2 rollout JSONL：会话的真相之源【实测】

每行一个对象，`type` 字段区分：

| type | 内容 |
|---|---|
| `session_meta` | 首行。`{session_id, timestamp, cwd, originator, cli_version, ...}` |
| `turn_context` | 每轮的上下文快照：`{turn_id, cwd, workspace_roots, model, approval, sandbox}` |
| `response_item` | **发给模型的原始会话项**：`{type:"message", role:"developer"\|"user"\|"assistant", content:[...]}`、function_call 等 |
| `event_msg` | **面向 UI 的事件**：`task_started` / `user_message` / `task_complete` |
| `world_state` | 环境快照：`agents_md`、`collaboration_mode`、`environments` 等 |

关键设计：**`response_item`（模型视角）和 `event_msg`（UI 视角）并存于同一文件。**
恢复会话时，喂给模型的是 `response_item`，渲染给用户的是 `event_msg` + item 投影。
两者解耦，所以 UI 可以改版而不影响模型上下文，反之亦然。

实测首行样例（已截断）：

```jsonc
{"type":"session_meta","payload":{
  "session_id":"019fe1ab-3e22-7113-aeaf-0c2f6efeb5af",
  "timestamp":"2026-08-08T13:58:44.044Z",
  "cwd":"/Users/fanjunjie/Documents/ChatGPT/codex-reverse",
  "originator":"Code..."}}
{"type":"turn_context","payload":{
  "turn_id":"019fe1ab-450a-...","cwd":"...",
  "workspace_roots":["/Users/.../codex-reverse","/Users/fanjunjie/.codex/visualizatio..."]}}
```

注意 `workspace_roots` 是**数组**，且包含 cwd 之外的路径 —— 见 §7.4。

### 6.3 state_5.sqlite：列表查询的加速表【实测 schema】

```sql
CREATE TABLE threads (
    id TEXT PRIMARY KEY,
    rollout_path TEXT NOT NULL,      -- 指回 JSONL
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    source TEXT NOT NULL,            -- 'cli' | 'vscode' | 'app-server' ...
    model_provider TEXT NOT NULL,
    cwd TEXT NOT NULL,               -- ★ 项目归属的依据
    title TEXT NOT NULL,
    sandbox_policy TEXT NOT NULL,
    approval_mode TEXT NOT NULL,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    has_user_event INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    git_sha TEXT, git_branch TEXT, git_origin_url TEXT,
    first_user_message TEXT, preview TEXT,
    recency_at INTEGER, recency_at_ms INTEGER,
    name TEXT, is_pinned INTEGER DEFAULT 0,
    thread_section_id TEXT REFERENCES thread_sections(id) ON DELETE SET NULL,
    section_position INTEGER,
    ...
);

-- ★★★ 这几条索引直接暴露了产品的查询模式：
CREATE INDEX idx_threads_archived_cwd_recency_at_ms
    ON threads(archived, cwd, recency_at_ms DESC, id DESC);
CREATE INDEX idx_threads_archived_cwd_created_at_ms  ON threads(archived, cwd, created_at_ms DESC, id DESC);
CREATE INDEX idx_threads_visible_recency_at_ms
    ON threads(archived, recency_at_ms DESC, id DESC) WHERE preview <> '';
CREATE INDEX idx_threads_pinned_recency_at_ms
    ON threads(archived, recency_at_ms DESC, id DESC) WHERE is_pinned = 1 AND preview <> '';
CREATE INDEX idx_threads_section_position
    ON threads(archived, thread_section_id, section_position ASC, id ASC);
```

`(archived, cwd, recency DESC)` 这条复合索引是**"按项目列会话"的物证**。
`WHERE preview <> ''` 的部分索引说明：**没有任何用户消息的空会话不进列表**。

另有触发器把秒级时间戳自动同步到毫秒列（`*_at_ms`），说明经历过一次精度迁移。

### 6.4 `thread/list` —— 列表 API【实测】

```ts
type ThreadListParams = {
  cursor?: string | null          // 不透明游标
  limit?: number | null
  sortKey?: ThreadSortKey | null  // 默认 created_at
  sortDirection?: SortDirection | null
  modelProviders?: string[] | null
  sourceKinds?: ThreadSourceKind[] | null   // 默认只要交互式来源
  archived?: boolean | null
  sectionId?: string | null       // 省略=全部, null=未分组, id=该分组
  cwd?: string | string[] | null  // ★ 按 cwd 精确匹配过滤（可传多个）
  useStateDbOnly?: boolean        // true=只查 sqlite，不扫 JSONL 修复元数据
  searchTerm?: string | null
}
```

返回 `{ data: Thread[], nextCursor, backwardsCursor }`（双向游标）。

**`cwd: string | string[]` 就是"按项目筛会话"的实现方式。** 注意注释写明是
**exact match**，不是前缀匹配 —— 所以多根项目要把每个 root 都传进去。

`useStateDbOnly` 揭示了一个性能权衡：默认路径会**扫 JSONL 修复元数据**（慢但准），
快速路径只读 sqlite（快但可能陈旧）。桌面版首屏大概率用 `true`，后台再做修复。

实测返回的 `Thread` 对象（真实数据，节选）：

```jsonc
{
  "id": "019fb865-f0d4-71c2-94f6-0ba9cb8a8d6f",
  "sessionId": "019fb865-...",         // fork 时子线程继承根的 sessionId
  "forkedFromId": null,
  "parentThreadId": null,               // subagent 才有
  "preview": "本项目目前处于比较干净的状态...",  // 首条用户消息
  "ephemeral": false,
  "section": null, "sectionEnteredAt": null,
  "modelProvider": "custom",
  "createdAt": 1785505116, "updatedAt": 1785549007, "recencyAt": 1785548045,
  "status": { "type": "notLoaded" },    // notLoaded|idle|active|systemError
  "path": "/Users/fanjunjie/.codex/sessions/2026/07/31/rollout-....jsonl",
  "cwd": "/Users/fanjunjie/Documents/repositories/github/Nexus",
  "cliVersion": "0.146.0",
  "source": "cli",
  "gitInfo": { "sha": "127b7dab...", "branch": "main",
               "originUrl": "https://github.com/jeryfan/Nexus.git" },
  "name": null,
  "turns": []                           // 列表接口恒为空，需 thread/read
}
```

`turns` 只在 `thread/resume` / `thread/fork` / `thread/rollback` /
`thread/read(includeTurns:true)` 时才填充 —— 列表接口刻意不带正文。

### 6.5 恢复会话的三条路径【协议注释】

`ThreadResumeParams` 的文档注释原文：

> 1. By thread_id：从磁盘按 id 加载
> 2. By history：从内存实例化
> 3. By path：从磁盘按路径加载
>
> 非运行中线程优先级：`history > 非空 path > thread_id`。
> 若 thread_id 指向**正在运行**的线程，app-server 会**重新加入**该线程，
> 并把非空 path 当作一致性校验。
> **优先用 thread_id。**

"重新加入正在运行的线程"很关键：**关掉窗口再打开，turn 还在跑，重连后继续收事件。**

---

## 7. Project 是怎么实现的 —— 本次逆向最重要的发现

### 7.1 结论：协议里根本没有 Project【实测】

```bash
grep -ril "project" /tmp/codex_proto/   # 94+500 个协议类型文件
# 命中的只有 6 个，且全是无关语义：
#   FileSystemSpecialPath.ts, ConfigLayerSource.ts, HookSource.ts, ...
```

`ClientRequest` 的约 100 个方法里**没有任何 `project/*`**。
`state_5.sqlite` 里**没有 projects 表**。

**Project 是 100% 的 Electron 客户端侧概念。app-server 只认 `cwd`。**

对应地，`main-*.js` 里有大量 project 标识符（`projectId` ×75、`projectRoot` ×54、
`projectless` ×35、`projectRoots` ×17、`projectlessSpaces` ×19 ...），
而 Rust 侧一个都没有。

### 7.2 项目注册表的真实存储【实测】

文件：`~/.codex/.codex-global-state.json`（JSON，不是 sqlite）

顶层 key（实测全量）：

```
local-projects                 selected-project              project-order
active-workspace-roots         electron-saved-workspace-roots
thread-project-assignments     projectless-thread-ids
thread-workspace-root-hints    thread-projectless-output-directories
thread-writable-roots          pinned-thread-ids             queued-follow-ups
electron-persisted-atom-state  electron-main-window-bounds
codex-managed-remote-connections   selected-remote-host-id   ...
```

真实内容（本机数据）：

```jsonc
// local-projects：以 projectId 为 key 的字典
{
  "0c603c13-0cdd-4c6b-a0f9-4b22fb9d4a4d": {
    "id":   "0c603c13-0cdd-4c6b-a0f9-4b22fb9d4a4d",
    "name": "gams",
    "rootPaths": ["/Users/fanjunjie/Documents/repositories/personal/gams"],  // ★ 数组
    "createdAt": 1785247344801,
    "updatedAt": 1785247344801
  },
  "b1213fcb-...": { "name": "genui",  "rootPaths": [".../genui"],  ... },
  "7689da48-...": { "name": "agent-explore", ... }
}

// selected-project：判别式联合
{ "type": "local", "projectId": "5048b109-8839-48bb-a6ee-6a774199ea00" }

// project-order：侧栏排序（用户可拖拽）
["5048b109-...", "7689da48-...", "b1213fcb-...", "0c603c13-..."]

// thread-project-assignments：★ 显式的 thread → project 映射
{
  "019fa908-c52a-7613-a5b0-532bc2d47d7f": {
    "projectKind": "local",
    "projectId":   "0c603c13-0cdd-4c6b-a0f9-4b22fb9d4a4d",
    "cwd":         "/Users/fanjunjie/Documents/repositories/personal/gams",
    "pendingCoreUpdate": false
  },
  "019f93c4-...": {
    "projectKind": "local",
    "projectId":   "local-066c46dc337d569c13506e4292facfc6",   // ← 派生 id，见下
    "cwd":         "/Users/fanjunjie/Documents/repositories/personal/ideact",
    "pendingCoreUpdate": false
  }
}

// projectless-thread-ids：不属于任何项目的会话
["019f4c7b-6f3d-71a2-960e-1240da85eda4"]

// thread-workspace-root-hints：为 projectless 会话保留的根路径提示
{ "019f4c7b-...": "/Users/fanjunjie/Documents/Codex" }

// pinned-thread-ids
["019fa908-...", "019fb865-..."]
```

### 7.3 两种 projectId 并存【实测】

- **用户显式建的项目** → 随机 UUID：`0c603c13-0cdd-4c6b-a0f9-4b22fb9d4a4d`
- **由 cwd 自动推断的项目** → 派生 id：`local-066c46dc337d569c13506e4292facfc6`
  （`local-` + 32 位十六进制，由归一化后的 root 集合稳定哈希得出。
  我未能确认具体算法 —— 试过 md5(path)、md5(path/)、md5(lowercase) 均不匹配，
  推测掺了盐或先做了平台相关归一化。**你自己实现时随便定，只要稳定即可。**）

派生 id 的意义：CLI/VSCode 在某目录起的会话，桌面 App 打开时能**自动归入一个项目**，
不需要用户手动建。这是"会话不会丢"的关键体验。

### 7.4 归属判定逻辑【拆包还原】

```js
// 给定路径 t，找它属于哪个项目：遍历所有项目，比对 rootPaths 精确相等
function resolveProject(store, t) {
  let best = null
  for (const p of Object.values(getLocalProjects(store))) {
    if (p.rootPaths.some(r => path.relative(r, t) === '')) {
      if (best == null || betterThan({...p, rootPath: t}, {...best, rootPath: t}))
        best = p
    }
  }
  return best
}
```

注意是 `path.relative(root, t) === ''` —— **精确相等**，与 `thread/list` 的
`cwd` exact-match 语义一致。子目录起的会话不会自动归入父项目，
而是会派生出一个新的 `local-<hash>` 项目。

创建项目时的命名规则（拆包）：

```js
name: providedName?.trim() || path.basename(roots[0] ?? '') || roots[0] || 'Project'
```

多根项目（`rootPaths: string[]`）说明产品支持一个项目挂多个目录 ——
对应 §6.2 rollout 里看到的 `workspace_roots` 数组。

### 7.5 完整的"打开项目 → 看到会话列表"链路

```
1. 主进程启动
   读 ~/.codex/.codex-global-state.json
   → local-projects / project-order / selected-project

2. Renderer preload 阶段
   ipcRenderer.sendSync('get-initial-sidebar-bootstrap')
   → 同步拿到项目列表 + 选中项，首帧即有内容（§3.3）

3. 用户点某个项目 (projectId)
   Main: rootPaths = localProjects[projectId].rootPaths

4. Main → app-server
   { "method": "thread/list",
     "params": { "cwd": rootPaths,            // ★ 数组，多根一起传
                 "archived": false,
                 "sortKey": "recency",
                 "limit": 50 } }

5. app-server 走 idx_threads_archived_cwd_recency_at_ms 索引
   ← { "data": [Thread...], "nextCursor": "..." }

6. Main 合并客户端侧元数据：
   - pinned-thread-ids       → 置顶
   - thread-project-assignments → 覆盖/纠正归属
   - project-order           → 排序
   分块流式推给 renderer（§3.2）

7. 用户点某个会话
   → thread/resume { threadId }
   ← { thread: { ..., turns: [...] } }   // 这次带正文
   + 后续 item/* 通知继续流式补充
```

**要点：Project 的筛选发生在客户端组装 `cwd` 参数这一步，服务端只是执行一次带
cwd 过滤的分页查询。** 这就是为什么整个 Rust 侧不需要知道 project 存在。

---

## 8. 为什么文件树/终端也走 app-server

Electron 主进程完全有能力自己 `fs.readdir` / `node-pty`，但 Codex 把
`fs/*` 和 `command/exec` 放进了协议。原因（推断，但证据充分）：

1. **远程/SSH 场景**：`main-*.js` 里有大量 `pathForDesktopHost` /
   `pathForAgentEnvironment` / `shouldUseWslPaths` 的路径适配代码，以及
   `app-server --listen unix://` 经 SSH 转发的逻辑。
   agent 可能跑在**另一台机器 / WSL / 容器**里 ——
   此时"项目文件"根本不在本机，只能通过 app-server 访问。
2. **沙箱一致性**：agent 看到的文件视图必须和 UI 展示的一致（含权限边界）。
3. **`fs/watch` + `fs/changed`**：agent 改文件后 UI 自动刷新，走同一条事件流，
   不需要在 Electron 侧再搭一套 watcher 并处理与 agent 写入的竞态。

`main-*.js` 中确有 SSH 远程 app-server 的启动代码：

```js
`app-server --listen `, quote(`unix://`), ` >${LOG} 2>&1 &`
// 以及 'app-server-control/app-server.log'、'app-server-control/forwarded-ssh-agent.sock'
```

**对 WorkStudio 的含义**：如果你确定只做本地，直接在 Electron 主进程用 `fs`/`node-pty`
更简单、更快，没必要照抄。但**接口形状**建议对齐 `fs/*`，将来要支持远程时不用重写 UI。

---

## 9. ThreadItem —— UI 渲染的核心数据模型【实测】

会话区本质是一个 `ThreadItem[]` 渲染器。完整的判别式联合（`type` 字段）：

| type | 关键字段 | UI 呈现 |
|---|---|---|
| `userMessage` | `content: UserInput[]`, `clientId` | 用户气泡 |
| `agentMessage` | `text`, `phase`, `memoryCitation` | 助手 Markdown |
| `reasoning` | `summary: string[]`, `content: string[]` | 可折叠推理块 |
| `plan` | `text` | 计划卡片 |
| `commandExecution` | `command`, `cwd`, `status`, `commandActions[]`, `aggregatedOutput`, `exitCode`, `durationMs`, `processId` | 终端卡片 |
| `fileChange` | `changes: FileUpdateChange[]`, `status` | diff 卡片 |
| `mcpToolCall` | `server`, `tool`, `arguments`, `result`, `error`, `durationMs` | 工具调用卡片 |
| `dynamicToolCall` | `namespace`, `tool`, `contentItems` | 客户端工具 |
| `collabAgentToolCall` | `senderThreadId`, `receiverThreadIds`, `agentsStates` | 多 agent 协作 |
| `subAgentActivity` | `agentThreadId`, `agentPath` | 子 agent |
| `webSearch` / `imageView` / `imageGeneration` / `sleep` | | 各自卡片 |
| `enteredReviewMode` / `exitedReviewMode` | `review` | 审查模式分隔 |
| `contextCompaction` | | 上下文压缩分隔线 |
| `hookPrompt` | `fragments` | 钩子注入 |

`commandExecution.commandActions` 值得注意 —— 服务端**已经把 shell 命令解析成结构化
动作列表**（管道会拆成多个），UI 据此渲染"这条命令会做什么"，
而不是让前端自己解析 shell 语法。

`UserInput` 的类型也很有参考价值：

```ts
type UserInput =
  | { type: 'text',   text: string, text_elements: TextElement[] }  // 富文本 span
  | { type: 'image',  url: string, detail?: ImageDetail }
  | { type: 'localImage', path: string }
  | { type: 'audio' | 'localAudio', ... }
  | { type: 'skill',   name: string, path: string }    // /skill
  | { type: 'mention', name: string, path: string }    // @file
```

`text_elements` 是"UI 定义的 span"，让 `@提及`、`/技能` 在**持久化后仍能还原成
富文本 chip**，而不是退化成纯字符串。这是 Composer 设计的关键。

---

## 10. 落地建议：映射到 WorkStudio 现状

你当前的结构（`src/main/index.ts` + `fileIpc.ts` + `WorkspaceContext.tsx` +
`services/workspace`）与 Codex 的分层其实**方向一致**，差的是协议层。

### 阶段一：接上 app-server（最小可用）

```
src/main/
  codex/
    AppServerClient.ts     # spawn codex app-server，stdio JSONL 编解码
                           #   - Map<id, {resolve,reject}> 配对 request/response
                           #   - notification 按 method 广播
                           #   - ★ ServerRequest（带 id 从 server 来）路由到 renderer 审批 UI
    protocol/              # 直接放 `codex app-server generate-ts` 的产物，勿手写
  projects/
    ProjectStore.ts        # local-projects / selected-project / project-order
                           # 建议存 app.getPath('userData')/projects.json
```

- **协议类型不要手写。** 把 `codex app-server generate-ts --out src/main/codex/protocol`
  加进构建脚本，codex 升级时重新生成即可，避免类型漂移。
- 握手务必 `initialize` → 等 result → `initialized`，之前发任何请求都会被拒。

### 阶段二：Project 层（你的核心差异点）

直接照抄 Codex 的数据模型，它已经被验证过：

```ts
interface Project {
  id: string            // uuid（手动建）或 `local-<hash>`（cwd 推断）
  name: string          // 默认 basename(rootPaths[0])
  rootPaths: string[]   // ★ 一开始就用数组，后面加多根不用改 schema
  createdAt: number
  updatedAt: number
}
type SelectedProject = { type: 'local', projectId: string } | { type: 'projectless' }
```

拉某项目的会话：

```ts
const { rootPaths } = projects[projectId]
const res = await appServer.request('thread/list', {
  cwd: rootPaths,            // 数组，exact match
  archived: false,
  sortKey: 'recency',
  limit: 50,
  useStateDbOnly: true       // 首屏走快路径
})
```

你现有的 `WorkspaceContext` 已经有 `projects` / `currentProject` /
`projectExpanded` —— 把 `workspaceService.getWorkspaceData()` 的实现从 mock
换成上面这条链路即可，**Context 的形状基本不用动**。

### 阶段三：事件流渲染

- 建一个 `ThreadItem[]` 的 reducer，按 `item/started` → `item/*/delta` →
  `item/completed` 就地更新（用 `item.id` 索引）。
- **不要在发送时乐观插入用户消息**，等 `item/started(userMessage)` 回显；
  需要即时反馈就用 `clientUserMessageId` 做去重。
- `item/agentMessage/delta` 高频到达，务必做批量渲染
  （`requestAnimationFrame` 合并），否则长回复会掉帧。

### 阶段四：审批（不能跳过）

`sandbox: 'read-only'` + `approvalPolicy: 'on-request'` 时，服务端会发
`item/commandExecution/requestApproval`（**带 id**）。不回复 = agent 永久卡住。
必须实现：反向请求 → renderer 弹审批 UI → 用户选择 → 写回 JSON-RPC response。

### 可以直接抄的两个工程设计

1. **分块流式 IPC（§3.2）** —— 长会话历史/大 diff 迟早撞上，早做省一次重构。
2. **`sendSync` 首屏快照（§3.3）** —— 侧栏和主题都靠它消除闪烁，成本极低。

### 建议不抄的

- `fs/*` / `command/exec` 走协议：纯本地场景直接用 Electron 的 `fs` / `node-pty`
  更简单。但**接口形状对齐**，留好远程的口子。
- 自建 sqlite 缓存：会话量小的时候 `thread/list` 足够快，`useStateDbOnly:true`
  已经是走 sqlite 索引了。

---

## 11. 对既有文档 `codex-architecture-reverse-analysis.md` 的更正

那份文档整体方向正确，但以下几点经实测证伪或需补充：

| 原结论 | 实测更正 |
|---|---|
| "Preload 用 contextBridge 暴露类型化 API（invoke/on）" | ❌ 实际是**单一泛化消息通道** + `window.dispatchEvent(MessageEvent)`，没有 per-feature 方法。且有分块流式协议和 ACK 背压（§3） |
| "better-sqlite3：App 自身的本地状态（窗口、最近项目等）" | ❌ better-sqlite3 用于 `codex-history-snapshots.db`（线程历史缓存）。**项目/窗口状态存在 `~/.codex/.codex-global-state.json`**（JSON） |
| "环境变量 `CODEX_CLI_PATH` 可指定二进制" | ⚠️ 未在本机验证。实测桌面版用**自带的** `ChatGPT.app/Contents/Resources/codex` |
| 未提及 Project 的实现 | ✅ 补充：Project 是纯客户端概念，协议无 `project/*`，靠 `thread/list` 的 `cwd` 过滤实现（§7） |
| 未提及反向请求 `item/tool/call` | ✅ 补充：agent 可调用**客户端实现的工具**（§4.3） |
| 未提及 MCP per-thread 启动 | ✅ 补充：`thread/start` 后才 starting→ready，UI 需展示（§5） |
| "协议省略 `jsonrpc:"2.0"` 头" | ✅ 实测确认：响应中确无 `jsonrpc` 字段；但请求里带上也能被接受 |

---

## 附：本次生成的协议类型清单位置

```bash
codex app-server generate-ts --out ./schemas
# 顶层 94 个 + schemas/v2/ 下 500+ 个
# 最重要的四个：
#   ClientRequest.ts       所有可调方法
#   ServerNotification.ts  所有事件
#   ServerRequest.ts       所有反向请求（审批）
#   v2/ThreadItem.ts       UI 渲染的核心联合类型
```
