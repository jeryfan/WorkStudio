/**
 * 分块流式消息协议的往返自检。
 *
 * 覆盖：长字符串切片、深层嵌套（显式栈不爆栈）、undefined/NaN 的 JSON 语义、
 * 以及 preload 侧校验器认不认自己产出的报文。
 */
import { chunkMessages, JsonTokenAssembler, isChunkedMessage } from '../src/shared/host/chunked'

const deep: Record<string, unknown> = {}
let cursor = deep
for (let i = 0; i < 5000; i++) {
  const next: Record<string, unknown> = {}
  cursor.k = next
  cursor = next
}

const sample = {
  a: 1,
  b: 'x'.repeat(40_000),
  c: [1, 2, { d: null, e: true }],
  f: { g: { h: [[], {}, 'short'] } },
  skip: undefined,
  n: Number.NaN,
  keys: { '': 'empty key', ['k'.repeat(30_000)]: 'long key' },
  deep
}

const assembler = new JsonTokenAssembler()
let messages = 0
for (const message of chunkMessages('verify', sample, {
  tokensPerChunk: 7,
  stringChunkSize: 1000
})) {
  if (!isChunkedMessage(message)) throw new Error('validator rejected its own message')
  messages += 1
  if (message.kind === 'chunk') assembler.push(message.tokens ?? [])
}

const actual = JSON.stringify(assembler.result())
const expected = JSON.stringify(JSON.parse(JSON.stringify(sample)))
if (actual !== expected) {
  console.error('MISMATCH')
  console.error('actual  :', actual.slice(0, 400))
  console.error('expected:', expected.slice(0, 400))
  process.exit(1)
}
console.log(`chunked protocol OK — ${messages} messages, complete=${assembler.complete}`)
