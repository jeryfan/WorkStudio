/**
 * JSONL 编解码：一行一条完整报文。
 *
 * 子进程 stdout 的 chunk 边界与行边界无关——一条 3 MB 的响应会跨几十个
 * chunk 到达，两条短消息也可能挤在同一个 chunk 里。这里负责把字节流重新
 * 切回行。
 */

import type { RpcMessage } from './messages'

export function encodeLine(message: RpcMessage): string {
  return JSON.stringify(message) + '\n'
}

export interface LineDecoderOptions {
  /** 单行上限，超出视为协议异常并丢弃该行，避免内存被无界缓冲拖垮 */
  maxLineBytes?: number
  onOverflow?: (droppedBytes: number) => void
}

const DEFAULT_MAX_LINE_BYTES = 64 * 1024 * 1024

export class LineDecoder {
  private buffer = ''
  private overflowing = false
  private readonly maxLineBytes: number

  constructor(private readonly options: LineDecoderOptions = {}) {
    this.maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES
  }

  /** 追加一段文本，返回本次凑齐的完整行（不含换行符，已跳过空行） */
  push(chunk: string): string[] {
    this.buffer += chunk
    const lines: string[] = []

    let start = 0
    for (;;) {
      const idx = this.buffer.indexOf('\n', start)
      if (idx === -1) break
      const line = this.buffer.slice(start, idx)
      start = idx + 1
      if (this.overflowing) {
        // 超长行的尾巴，丢弃到行尾为止即恢复
        this.overflowing = false
        continue
      }
      const trimmed = line.trim()
      if (trimmed) lines.push(trimmed)
    }
    this.buffer = this.buffer.slice(start)

    if (this.buffer.length > this.maxLineBytes) {
      this.options.onOverflow?.(this.buffer.length)
      this.overflowing = true
      this.buffer = ''
    }
    return lines
  }

  reset(): void {
    this.buffer = ''
    this.overflowing = false
  }
}

/** 解析一行；非法 JSON 返回 null 而不抛，避免一条脏数据打断整条流 */
export function decodeLine(line: string): RpcMessage | null {
  try {
    const parsed: unknown = JSON.parse(line)
    return typeof parsed === 'object' && parsed !== null ? (parsed as RpcMessage) : null
  } catch {
    return null
  }
}
