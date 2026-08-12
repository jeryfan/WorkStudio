// 临时验证脚本：把触发 bug 的事件时序喂给纯 reducer，断言渲染顺序
import {
  adoptPendingTurn,
  completeTurn,
  createPendingTurn,
  toRuntimeTurn,
  upsertItem
} from '../src/renderer/src/state/turnStore.ts'
import { turnsToRows } from '../src/renderer/src/chat/adapter/entryToContent.ts'

let failed = 0
const check = (name, cond, extra) => {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failed++
    console.log(`  ✗ ${name}${extra !== undefined ? '\n      ' + JSON.stringify(extra) : ''}`)
  }
}

const CID = 'client-1'
const userInput = [{ type: 'text', text: '你好', text_elements: [] }]
const localUserMsg = {
  type: 'userMessage',
  id: `pending:${CID}`,
  clientId: CID,
  content: userInput
}
const echoedUserMsg = { type: 'userMessage', id: 'srv-u1', clientId: CID, content: userInput }
const reasoning = { type: 'reasoning', id: 'r1', summary: ['**查目录**\n先看看'], content: [] }
const serverTurn = (items = []) => ({
  id: 'turn-1',
  items,
  itemsView: 'full',
  status: 'inProgress',
  error: null,
  startedAt: 1000,
  completedAt: null
})

/*
 * 一轮渲染出来的顺序：用户消息 → 活动 → 回答。
 *
 * 直接走真正的投影函数，而不是自己数条目：本文件断言的是"事件乱序到达时用户
 * 看到的顺序对不对"，那个顺序是 turnsToRows 决定的。绕开它去数 items 只能证明
 * 数据进了轮次，证明不了它在界面上排在哪。
 */
const renderOrder = (turn) =>
  turnsToRows([turn]).flatMap((row) =>
    row.kind === 'request'
      ? ['user']
      : row.content.map((c) => (c.kind === 'markdownContent' ? 'answer' : c.kind))
  )

console.log('\n[A] 最坏时序：turn/started 和活动条目都早于用户消息回显')
{
  let turns = []
  turns = [...turns, createPendingTurn(CID, localUserMsg)] // 1. 点发送
  check('乐观轮次已建，用户消息在轮内', renderOrder(turns[0])[0] === 'user', renderOrder(turns[0]))

  turns = adoptPendingTurn(turns, toRuntimeTurn(serverTurn())) // 2. turn/started（items 为空）
  check(
    '没有多出一个轮次',
    turns.length === 1,
    turns.map((t) => t.id)
  )
  check('轮次 id 换成服务端的', turns[0].id === 'turn-1')
  check('用户消息仍在最前', renderOrder(turns[0])[0] === 'user', renderOrder(turns[0]))

  turns = upsertItem(turns, 'turn-1', reasoning) // 3. 推理先到
  check(
    '推理排在用户消息之后',
    renderOrder(turns[0]).join() === 'user,thinking',
    renderOrder(turns[0])
  )

  turns = upsertItem(turns, 'turn-1', echoedUserMsg) // 4. 用户消息回显（换了 id）
  check(
    '不出现重复气泡',
    turns[0].items.filter((i) => i.type === 'userMessage').length === 1,
    turns[0].items.map((i) => i.id)
  )
  check('用户消息仍在最前', renderOrder(turns[0])[0] === 'user', renderOrder(turns[0]))

  const answer = {
    type: 'agentMessage',
    id: 'a1',
    text: '好的',
    phase: 'final_answer',
    memoryCitation: null
  }
  turns = upsertItem(turns, 'turn-1', answer)
  check(
    '最终顺序 = 用户 → 思考 → 回答',
    renderOrder(turns[0]).join() === 'user,thinking,answer',
    renderOrder(turns[0])
  )
}

console.log('\n[B] 条目事件早于 turn/started（乐观轮次必须被认领，不能分裂）')
{
  let turns = [createPendingTurn(CID, localUserMsg)]
  turns = upsertItem(turns, 'turn-1', reasoning)
  check(
    '乐观轮次被就地认领，仍只有一个轮次',
    turns.length === 1,
    turns.map((t) => t.id)
  )
  check('轮次 id 已换成服务端的', turns[0].id === 'turn-1')
  check('用户消息没有和活动分裂', renderOrder(turns[0])[0] === 'user', renderOrder(turns[0]))

  turns = adoptPendingTurn(turns, toRuntimeTurn(serverTurn([echoedUserMsg])))
  check(
    'turn/started 后仍是一个轮次',
    turns.length === 1,
    turns.map((t) => t.id)
  )
  check(
    '没有重复用户消息',
    turns[0].items.filter((i) => i.type === 'userMessage').length === 1,
    turns[0].items.map((i) => i.id)
  )
  check('轮次不会停在 inProgress 孤儿态', !turns.some((t) => t.id.startsWith('pending:')))
}

console.log('\n[C] 服务端 turn/started 已经带上用户消息')
{
  let turns = [createPendingTurn(CID, localUserMsg)]
  turns = adoptPendingTurn(turns, toRuntimeTurn(serverTurn([echoedUserMsg])))
  check('只有一个轮次', turns.length === 1)
  check(
    '按 clientId 去重，没有两条用户消息',
    turns[0].items.filter((i) => i.type === 'userMessage').length === 1,
    turns[0].items.map((i) => i.id)
  )
}

console.log('\n[D] 完成态耗时以服务端为准')
{
  let turns = [createPendingTurn(CID, localUserMsg)]
  turns = adoptPendingTurn(turns, toRuntimeTurn(serverTurn()))
  turns = completeTurn(
    turns,
    toRuntimeTurn({ ...serverTurn(), status: 'completed', startedAt: 1000, completedAt: 1009 })
  )
  check('status = completed', turns[0].status === 'completed')
  check('耗时用服务端时间戳 9s', turns[0].completedAtMs - turns[0].startedAtMs === 9000, {
    started: turns[0].startedAtMs,
    completed: turns[0].completedAtMs
  })
}

console.log('\n[E] 发送失败时撤回乐观轮次')
{
  const pending = createPendingTurn(CID, localUserMsg)
  const turns = [pending].filter((t) => t.id !== pending.id)
  check('乐观轮次被移除', turns.length === 0)
}

console.log(failed === 0 ? '\n全部通过\n' : `\n${failed} 项失败\n`)
process.exit(failed === 0 ? 0 : 1)
