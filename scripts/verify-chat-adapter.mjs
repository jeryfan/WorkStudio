#!/usr/bin/env node
/**
 * 校验协议 → 渲染模型的投影。
 *
 * 这一层最容易出错的不是"某个字段映射错了"（那种一眼看得出来），而是**顺序**：
 * 服务端可以在回显用户消息之前就推来轮次事件和活动条目，照到达顺序渲染会让
 * 用户看见自己刚发的话排在 agent 的活动下面。所以这里主要断言行与内容块的
 * 排列，而不是逐字段比对。
 *
 * 直接导入 .ts（Node 的类型剥离）。adapter 里全部是 `import type`，
 * 剥离后没有运行时依赖，跑得起来。
 *
 *   node scripts/verify-chat-adapter.mjs
 */
import { latestTodos, turnsToRows } from '../src/renderer/src/chat/adapter/entryToContent.ts'

let failed = 0
function check(name, cond, extra) {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}${extra ? '\n      ' + JSON.stringify(extra) : ''}`)
  }
}

// ── 夹具 ────────────────────────────────────────────────────────────

const userMsg = (id, text) => ({
  type: 'userMessage',
  id,
  clientId: id,
  content: [{ type: 'text', text, text_elements: [] }]
})
const answer = (id, text) => ({ type: 'agentMessage', id, text, phase: null, memoryCitation: null })
const reasoning = (id) => ({ type: 'reasoning', id, summary: ['thinking…'], content: [] })
const exec = (id, command, extra = {}) => ({
  type: 'commandExecution',
  id,
  command,
  commandActions: [],
  status: 'completed',
  aggregatedOutput: 'out',
  exitCode: 0,
  durationMs: 10,
  cwd: '/',
  processId: null,
  source: 'agent',
  pluginId: null,
  scriptPath: null,
  ...extra
})
const compaction = (id) => ({ type: 'contextCompaction', id })

const turn = (id, items, extra = {}) => ({
  id,
  items,
  status: 'completed',
  startedAtMs: 1000,
  completedAtMs: 2000,
  error: null,
  reconnect: null,
  plan: null,
  ...extra
})

const kinds = (row) => row.content.map((c) => c.kind)

// ── 一轮 = 一个 request 行 + 一个 response 行 ───────────────────────

console.log('轮次拆行')
{
  const rows = turnsToRows([turn('t1', [userMsg('u1', 'hi'), answer('a1', 'hello')])])
  check(
    '拆成两行',
    rows.length === 2,
    rows.map((r) => r.kind)
  )
  check('request 在前', rows[0].kind === 'request')
  check('request 取到正文', rows[0].text === 'hi', rows[0].text)
  check('response 在后', rows[1].kind === 'response')
  check('回答落进 response', kinds(rows[1]).join() === 'markdownContent', kinds(rows[1]))
}

console.log('用户消息先于活动条目（到达顺序颠倒也要摆正）')
{
  // 服务端先推活动、后回显用户消息的情形：turnStore 会把用户消息补在最前，
  // 这里断言 adapter 不会因为"位置在前的不是 userMessage"就把它漏进 response
  const rows = turnsToRows([
    turn('t1', [userMsg('u1', 'go'), exec('c1', 'ls'), answer('a1', 'done')])
  ])
  check('仍是 request 在前', rows[0].kind === 'request' && rows[0].text === 'go')
  check(
    '活动条目排在回答之前',
    kinds(rows[1]).join() === 'toolInvocation,markdownContent',
    kinds(rows[1])
  )
}

console.log('轮次开头之后的用户消息（排队消息）留在 response')
{
  const rows = turnsToRows([
    turn('t1', [userMsg('u1', 'first'), answer('a1', 'ok'), userMsg('u2', 'queued')])
  ])
  check('request 只含开头那条', rows[0].text === 'first', rows[0].text)
  check(
    '排队消息进 response 正文',
    kinds(rows[1]).join() === 'markdownContent,markdownContent',
    kinds(rows[1])
  )
}

console.log('连续的开头用户消息合并成一个 request')
{
  const rows = turnsToRows([
    turn('t1', [userMsg('u1', 'a'), userMsg('u2', 'b'), answer('x', 'ok')])
  ])
  check('只产出一个 request 行', rows.filter((r) => r.kind === 'request').length === 1)
  check('两条正文都在', rows[0].text === 'a\n\nb', rows[0].text)
}

console.log('无用户消息的轮次不产出空 request 行')
{
  const rows = turnsToRows([turn('t1', [answer('a1', 'resumed')])])
  check(
    '只有 response 行',
    rows.length === 1 && rows[0].kind === 'response',
    rows.map((r) => r.kind)
  )
}

console.log('推理条目现在会渲染成 thinking 块')
{
  const rows = turnsToRows([turn('t1', [userMsg('u1', 'hi'), reasoning('r1'), answer('a1', 'x')])])
  check('thinking 在回答之前', kinds(rows[1]).join() === 'thinking,markdownContent', kinds(rows[1]))
}

console.log('推理 → thinking')
{
  const r = (id, summary, content = []) => ({ type: 'reasoning', id, summary, content })

  const done = turnsToRows([
    turn('t1', [userMsg('u1', 'hi'), r('r1', ['**读代码**\n看了注册表']), answer('a1', 'x')])
  ])
  const think = done[1].content.find((c) => c.kind === 'thinking')
  check('产出 thinking 块', !!think, kinds(done[1]))
  check('标题取加粗小标题而不是正文', think?.title === '读代码', think?.title)
  check('后面还有条目 → 已结束', think?.isActive === false, think?.isActive)

  // 标题取最新一段：前面几段是已经想完的，标题该反映当前进度
  const multi = turnsToRows([
    turn('t1', [r('r1', ['**先看 A**\n…', '**再看 B**\n…'])], { status: 'inProgress' })
  ])
  const t2 = multi[0].content[0]
  check('标题取最新一段', t2?.title === '再看 B', t2?.title)
  check('轮次进行中且是最后一条 → 进行中', t2?.isActive === true, t2?.isActive)

  // 没有加粗小标题时退回首行，而不是最后一行（最后一行是半句正文）
  const noBold = turnsToRows([turn('t1', [r('r1', ['检查依赖版本\n然后跑一遍构建'])])])
  check(
    '无加粗时取首行',
    noBold[0].content[0]?.title === '检查依赖版本',
    noBold[0].content[0]?.title
  )

  // summary 为空时退回 content
  const onlyContent = turnsToRows([turn('t1', [r('r1', [], ['完整推理'])])])
  check('summary 为空时用 content', onlyContent[0].content[0]?.items?.join() === '完整推理')

  // 空白段落不该产出空条目
  const blanks = turnsToRows([turn('t1', [r('r1', ['  ', '有内容', ''])])])
  check('滤掉空白段', blanks[0].content[0]?.items?.join() === '有内容', blanks[0].content[0]?.items)
}

console.log('工具条目 → toolInvocation（归一化）')
{
  const mcp = (id, extra = {}) => ({
    type: 'mcpToolCall',
    id,
    server: 'github',
    tool: 'create_issue',
    status: 'completed',
    arguments: { title: 'hi' },
    appContext: null,
    pluginId: null,
    readOnlyHint: null,
    result: { content: [{ type: 'text', text: 'ok' }], structuredContent: null, _meta: null },
    error: null,
    durationMs: 100,
    ...extra
  })
  const dynamic = (id, extra = {}) => ({
    type: 'dynamicToolCall',
    id,
    namespace: 'my',
    tool: 'do_thing',
    arguments: { a: 1 },
    status: 'completed',
    contentItems: null,
    success: true,
    durationMs: 50,
    ...extra
  })
  const web = (id, query, extra = {}) => ({
    type: 'webSearch',
    id,
    query,
    action: null,
    results: extra.results,
    ...(extra.status ? { status: extra.status } : {})
  })
  const fileChange = (id, changes, extra = {}) => ({
    type: 'fileChange',
    id,
    changes,
    status: 'completed',
    ...extra
  })

  const rows = turnsToRows([
    turn('t1', [
      userMsg('u1', 'hi'),
      exec('c1', 'npm test', {
        commandActions: [{ type: 'read', command: 'x', name: 'a.ts', path: '/a.ts' }]
      }),
      mcp('m1'),
      dynamic('d1'),
      web('w1', 'vscode agent window'),
      fileChange('f1', [
        {
          path: 'src/a.ts',
          kind: { type: 'update', move_path: null },
          diff: '@@ -1 +1 @@\n-old\n+new'
        }
      ]),
      answer('a1', 'done')
    ])
  ])
  const tools = rows[1].content.filter((c) => c.kind === 'toolInvocation').map((c) => c.invocation)

  check(
    '五种条目归一成五个 toolInvocation',
    tools.length === 5,
    tools.map((t) => t.toolId)
  )
  check(
    '工具块在回答之前',
    kinds(rows[1]).join() ===
      'toolInvocation,toolInvocation,toolInvocation,toolInvocation,toolInvocation,markdownContent'
  )

  // 状态映射
  check(
    'read 命令用人话文案',
    tools[0].invocationMessage === 'Reading a.ts' && tools[0].pastTenseMessage === 'Read a.ts',
    tools[0]
  )
  check(
    'completed → completed',
    tools[0].state.type === 'completed' && tools[0].state.success === true
  )
  check(
    '退出码非零 → 失败',
    turnsToRows([turn('t1', [exec('c1', 'x', { exitCode: 1, commandActions: [] })])])[0].content[0]
      .invocation.state.success === false
  )
  const running = turnsToRows([
    turn('t1', [exec('c1', 'x', { status: 'inProgress', commandActions: [] })], {
      status: 'inProgress'
    })
  ])[0].content[0].invocation
  check('inProgress → executing', running.state.type === 'executing')
  const declined = turnsToRows([
    turn('t1', [exec('c1', 'x', { status: 'declined', commandActions: [] })])
  ])[0].content[0].invocation
  check(
    'declined → cancelled/denied 而不是 failed',
    declined.state.type === 'cancelled' && declined.state.reason === 'denied'
  )

  // MCP / dynamic
  check(
    'mcp 入参是格式化的 JSON',
    tools[1].data.kind === 'inputOutput' && tools[1].data.input.includes('"title"')
  )
  check('mcp 出参序列化 content 数组', tools[1].data.output?.includes('"text"'))
  check(
    'dynamic 拼接出参',
    turnsToRows([
      turn('t1', [dynamic('d1', { contentItems: [{ type: 'inputText', text: 'hello' }] })])
    ])[0].content[0].invocation.data.output === 'hello'
  )
  check(
    'dynamic success=false → failed',
    turnsToRows([turn('t1', [dynamic('d1', { success: false })])])[0].content[0].invocation.state
      .success === false
  )

  // fileChange
  const fe = tools[4]
  check(
    'fileChange → fileEdit + 操作类型',
    fe.data.kind === 'fileEdit' && fe.data.changes[0].operation === 'update'
  )
  check('fileChange 文案含文件名', fe.invocationMessage === 'Editing src/a.ts')

  // webSearch：无状态字段，直接 completed
  const ws = tools[3]
  check(
    'webSearch → search + completed',
    ws.data.kind === 'search' &&
      ws.state.type === 'completed' &&
      ws.data.query === 'vscode agent window'
  )
}

console.log('diff 解析（格式无关）')
{
  const { parseDiff, countDiffLines } = await import('../src/renderer/src/chat/model/diff.ts')

  const unified = [
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,4 +1,4 @@',
    ' const x = 1',
    '-const y = 2',
    '+const z = 2',
    ' const w = 3',
    ' const v = 4'
  ].join('\n')
  const p = parseDiff(unified)
  check(
    '统一 diff 还原两侧',
    p?.original === 'const x = 1\nconst y = 2\nconst w = 3\nconst v = 4' &&
      p?.modified === 'const x = 1\nconst z = 2\nconst w = 3\nconst v = 4',
    p
  )
  check('增删计数正确', p?.added === 1 && p?.removed === 1)

  const multi = parseDiff('@@ -1,2 +1,2 @@\n-a\n+b\n@@ -10 +10 @@\n-c\n+d')
  check('多个 hunk 依次拼接', multi?.original === 'a\nc' && multi?.modified === 'b\nd')

  check('不认识的行 → 整体放弃', parseDiff('@@ -1 +1 @@\n???\nfoo') === null)
  check('没有 hunk → null', parseDiff('not a diff') === null)
  check('只有上下文 → null', parseDiff('@@ -1 +1 @@\n context line') === null)

  // 计数比还原宽容：方言不认识也能数
  const weird = 'custom-format\n@@\n+A\n-B\nunchanged\n+C'
  check('计数不依赖方言', countDiffLines(weird).added === 2 && countDiffLines(weird).removed === 1)
  check(
    '计数排除文件头',
    countDiffLines('--- a/x\n+++ b/x\n+A\n-B').added === 1 &&
      countDiffLines('--- a/x\n+++ b/x\n+A\n-B').removed === 1
  )
}

console.log('上下文压缩')
{
  const rows = turnsToRows([turn('t1', [userMsg('u1', 'hi'), compaction('k1'), answer('a1', 'x')])])
  check(
    '压缩块在回答之前',
    kinds(rows[1]).join() === 'contextCompaction,markdownContent',
    kinds(rows[1])
  )
}

// ── 审批（服务端反向请求叠到工具调用上）────────────────────────────

console.log('审批')
{
  const approval = (itemId, extra = {}) =>
    new Map([
      [
        itemId,
        {
          requestKey: extra.requestKey ?? itemId,
          itemId,
          turnId: extra.turnId ?? 't1',
          reason: extra.reason ?? null,
          fallback: extra.fallback ?? { kind: 'command', command: 'rm -rf build', cwd: '/repo' }
        }
      ]
    ])

  // 常规：条目已在，审批把它推进"等待确认"
  const running = turn(
    't1',
    [userMsg('u1', 'hi'), exec('c1', 'rm -rf build', { status: 'inProgress' })],
    {
      status: 'inProgress'
    }
  )
  const withApproval = turnsToRows([running], approval('c1', { reason: '需要写权限' }))
  const inv = withApproval[1].content[0].invocation
  check('状态被推进为等待确认', inv.state.type === 'waitingForConfirmation', inv.state)
  check('带上回传用的 requestKey', inv.state.requestKey === 'c1', inv.state)
  check('带上服务端给的理由', inv.state.reason === '需要写权限', inv.state)
  check('工具本身的数据不受影响', inv.data.command === 'rm -rf build', inv.data)

  // requestKey 与 itemId 不同（zsh-exec-bridge 的子命令）
  const sub = turnsToRows([running], approval('c1', { requestKey: 'cb-42' }))
  check('requestKey 独立于 itemId', sub[1].content[0].invocation.state.requestKey === 'cb-42')

  // 已结束的条目不该被拽回等待确认
  const done = turnsToRows([turn('t1', [exec('c1', 'ls')])], approval('c1'))
  check(
    '已完成的条目不被审批覆盖',
    done[0].content[0].invocation.state.type === 'completed',
    done[0].content[0].invocation.state
  )

  // 审批比条目先到：必须自建一条，否则 agent 等的确认没有入口
  const orphan = turnsToRows(
    [turn('t1', [userMsg('u1', 'hi')], { status: 'inProgress' })],
    approval('c9')
  )
  const made = orphan[1].content.find((c) => c.kind === 'toolInvocation')?.invocation
  check('审批先到时自建工具调用', !!made, kinds(orphan[1]))
  check('自建的 id 用 itemId，真条目一到就顶替', made?.id === 'c9', made?.id)
  check('自建的命令取自审批参数', made?.data.command === 'rm -rf build', made?.data)
  check('自建的也是等待确认态', made?.state.type === 'waitingForConfirmation')

  // 别的轮次的审批不能漏进这一轮
  const other = turnsToRows(
    [turn('t1', [userMsg('u1', 'hi')], { status: 'inProgress' })],
    approval('c9', { turnId: 't-other' })
  )
  check('不属于本轮的审批不渲染', !kinds(other[1]).includes('toolInvocation'), kinds(other[1]))

  // 文件改动的审批参数不带补丁
  const fileApproval = turnsToRows(
    [turn('t1', [userMsg('u1', 'hi')], { status: 'inProgress' })],
    approval('f9', { fallback: { kind: 'fileChange' } })
  )
  const fe = fileApproval[1].content.find((c) => c.kind === 'toolInvocation')?.invocation
  check(
    '文件改动审批自建空补丁的 fileEdit',
    fe?.data.kind === 'fileEdit' && fe.data.changes.length === 0
  )
}

// ── 计划 / 钩子 / 审阅模式 ──────────────────────────────────────────

console.log('计划 → 输入框上方的待办清单（不进回复流）')
{
  const plan = (id, text) => ({ type: 'plan', id, text })

  // 上游把计划喂给 service、由输入框上方的部件显示，回复流里一个字都不放
  const rows = turnsToRows([
    turn('t1', [userMsg('u1', 'hi'), plan('p1', '- [ ] a'), answer('a1', 'ok')])
  ])
  check('计划不出现在回复流里', kinds(rows[1]).join() === 'markdownContent', kinds(rows[1]))

  // 结构化步骤优先：只有它带每一步的状态
  const structured = latestTodos([
    {
      ...turn('t1', [plan('p1', '随便什么文本')]),
      plan: [
        { title: '看代码', status: 'completed' },
        { title: '改代码', status: 'in-progress' }
      ]
    }
  ])
  check('结构化步骤优先于条目文本', structured.length === 2, structured)
  check('带每一步的状态', structured[0].status === 'completed', structured)

  // 没有结构化步骤（会话重开）时解析条目文本
  const parsed = latestTodos([turn('t1', [plan('p1', '- [x] 读注册表\n- [ ] 生成 token')])])
  check(
    '文本形式能解析成条目',
    parsed.map((t) => `${t.status}:${t.title}`).join() ===
      'completed:读注册表,not-started:生成 token',
    parsed
  )

  // 解析不出来就当没有，不能凭空造出假条目
  check(
    '解析不了时不产出假条目',
    latestTodos([turn('t1', [plan('p1', '我打算先看看注册表')])]).length === 0
  )

  // 一份计划往往跨轮次执行，只看最后一轮会让它在每轮开头凭空消失
  const across = latestTodos([turn('t1', [plan('p1', '- [ ] a')]), turn('t2', [answer('x', 'ok')])])
  check('跨轮次回溯到上一轮的计划', across.length === 1 && across[0].title === 'a', across)

  // 多份计划取最新
  const many = latestTodos([turn('t1', [plan('p1', '- [ ] a'), plan('p2', '- [x] a')])])
  check('取最后一份计划', many[0].status === 'completed', many)

  check('没有计划时是空数组', latestTodos([turn('t1', [answer('a', 'ok')])]).length === 0)
}

console.log('钩子 / 审阅模式')
{
  const hook = (id, fragments) => ({ type: 'hookPrompt', id, fragments })

  const one = turnsToRows([turn('t1', [hook('h1', [{ text: '注意分支', hookRunId: 'r' }])])])
  check('单个片段用单数文案', one[0].content[0]?.title === 'Hook added context')
  check('正文取片段文本', one[0].content[0]?.body === '注意分支')

  const two = turnsToRows([
    turn('t1', [
      hook('h1', [
        { text: 'a', hookRunId: 'r1' },
        { text: 'b', hookRunId: 'r2' }
      ])
    ])
  ])
  check('多个片段用复数文案', two[0].content[0]?.title === '2 hooks added context')
  check('片段之间留空行', two[0].content[0]?.body === 'a\n\nb')

  // 空片段不该产出一个点开是空的折叠块
  const empty = turnsToRows([turn('t1', [hook('h1', [{ text: '  ', hookRunId: 'r' }])])])
  check('全空的钩子不渲染', empty[0].content.length === 0, kinds(empty[0]))

  const review = turnsToRows([
    turn('t1', [
      { type: 'enteredReviewMode', id: 'e1', review: '看看这个 PR' },
      { type: 'exitedReviewMode', id: 'x1', review: '看看这个 PR' }
    ])
  ])
  check('进出审阅模式各一块', kinds(review[0]).join() === 'reviewMode,reviewMode', kinds(review[0]))
  check(
    '区分进入与退出',
    review[0].content[0].entered === true && review[0].content[1].entered === false
  )
}

// ── 「工作中」指示 ─────────────────────────────────────────────────

console.log('工作中（填补"发出去了但还没回来"的空档）')
{
  const running = (items, extra = {}) =>
    turnsToRows([turn('t1', items, { status: 'inProgress', ...extra })])

  // 最要紧的一条：什么都还没回来时必须有东西在动
  const bare = running([userMsg('u1', 'hi')])
  check('空回复也要显示工作中', kinds(bare[1]).join() === 'working', kinds(bare[1]))
  check(
    '文案来自词表',
    typeof bare[1].content[0].label === 'string' && bare[1].content[0].label.length > 0
  )

  // 同一轮文案恒定（纯函数 + 按 id 取模），否则每帧换一个词像抽风
  const again = running([userMsg('u1', 'hi')])
  check('同一轮文案稳定', again[1].content[0].label === bare[1].content[0].label)

  // 已经有别的东西在表达进度时不叠加
  const thinking = running([reasoning('r1')])
  check('推理进行中不叠加', !kinds(thinking[0]).includes('working'), kinds(thinking[0]))

  const execing = running([exec('c1', 'x', { status: 'inProgress' })])
  check('工具执行中不叠加', !kinds(execing[0]).includes('working'), kinds(execing[0]))

  const streaming = running([userMsg('u1', 'hi'), answer('a1', '正在写…')])
  check('正文流式中不叠加', !kinds(streaming[1]).includes('working'), kinds(streaming[1]))

  const reconnecting = turnsToRows([
    turn('t1', [userMsg('u1', 'hi')], {
      status: 'inProgress',
      reconnect: { attempt: 1, maxAttempts: 5, serverOverloaded: false, detail: null }
    })
  ])
  check('重连中不叠加', !kinds(reconnecting[1]).includes('working'), kinds(reconnecting[1]))

  // 工具跑完、下一步还没来 —— 正是需要它的间隙
  const between = running([userMsg('u1', 'hi'), exec('c1', 'ls')])
  check(
    '工具完成后的间隙要显示',
    kinds(between[1]).join() === 'toolInvocation,working',
    kinds(between[1])
  )
  check('永远排在最后', between[1].content.at(-1).kind === 'working')

  // 轮次结束就撤掉
  const done = turnsToRows([turn('t1', [userMsg('u1', 'hi'), answer('a1', 'ok')])])
  check('轮次完成后不显示', !kinds(done[1]).includes('working'), kinds(done[1]))
}

console.log('检索结果（不透明 JSON 的尽力抽取）')
{
  const web = (id, query, results) => ({ type: 'webSearch', id, query, action: null, results })

  const rows = turnsToRows([
    turn('t1', [
      web('w1', 'q', [
        { title: 'A', url: 'https://a', snippet: '…' },
        { name: 'B', url: 'https://b' },
        { url: 'https://c' },
        'plain string',
        { weird: 1 }
      ])
    ])
  ])
  const data = rows[0].content[0].invocation.data
  check('结果条数正确', data.results.length === 5, data.results)
  check('优先取 title', data.results[0].title === 'A' && data.results[0].url === 'https://a')
  check('退回 name', data.results[1].title === 'B')
  check('都没有就用 url 当标题', data.results[2].title === 'https://c')
  check('字符串结果直接当标题', data.results[3].title === 'plain string')
  check('认不出的形状序列化成 JSON 而不是丢掉', data.results[4].title.includes('weird'))

  const none = turnsToRows([turn('t1', [web('w1', 'q', null)])])
  check('没有结果时是空数组而不是 null', none[0].content[0].invocation.data.results.length === 0)
}

// ── 轮次收尾 ────────────────────────────────────────────────────────

console.log('失败的轮次')
{
  const rows = turnsToRows([
    turn('t1', [userMsg('u1', 'hi')], { status: 'failed', error: 'stream closed' })
  ])
  const last = rows[1].content.at(-1)
  check('末尾追加错误块', last?.kind === 'errorDetails' && last.level === 'error', last)
  check('用上服务端给的原因', last?.message === 'stream closed', last?.message)
}

console.log('被停止的轮次')
{
  const withAnswer = turnsToRows([
    turn('t1', [userMsg('u1', 'hi'), answer('a1', 'partial')], { status: 'interrupted' })
  ])
  check(
    '已有回答时不再说 Stopped',
    !kinds(withAnswer[1]).includes('errorDetails'),
    kinds(withAnswer[1])
  )

  const withoutAnswer = turnsToRows([turn('t1', [userMsg('u1', 'hi')], { status: 'interrupted' })])
  check(
    '没有回答时提示 Stopped',
    withoutAnswer[1].content.at(-1)?.message === 'Stopped',
    kinds(withoutAnswer[1])
  )
}

console.log('重连')
{
  const rows = turnsToRows([
    turn('t1', [userMsg('u1', 'hi')], {
      status: 'inProgress',
      reconnect: { attempt: 3, maxAttempts: 5, serverOverloaded: true, detail: '429' }
    })
  ])
  const last = rows[1].content.at(-1)
  check('重连块在末尾', last?.kind === 'reconnect' && last.attempt === 3, last)
  check('response 标记为未完成', rows[1].isComplete === false)
}

console.log('多轮')
{
  const rows = turnsToRows([
    turn('t1', [userMsg('u1', 'q1'), answer('a1', 'r1')]),
    turn('t2', [userMsg('u2', 'q2'), answer('a2', 'r2')])
  ])
  check(
    '行序为 请求/回复/请求/回复',
    rows.map((r) => r.kind).join() === 'request,response,request,response',
    rows.map((r) => r.kind)
  )
  const ids = rows.map((r) => `${r.kind}:${r.id}`)
  check('行 id 互不相同', new Set(ids).size === ids.length, ids)
}

if (failed > 0) {
  console.log(`\n${failed} 项未通过。`)
  process.exit(1)
}
console.log('\n全部通过。')
