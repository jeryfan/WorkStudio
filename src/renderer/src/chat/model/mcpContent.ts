/**
 * MCP 内容块 —— 协议把工具结果的 `content` 声明成 `Array<JsonValue>`（不透明 JSON），
 * 这里按 MCP 规范把它解析成一个可判别联合。
 *
 * 为什么要解析而不是整个 `JSON.stringify` 塞进代码块（此前 WS 的做法）：
 * Codex 的 `sw()` 是一个对 `block.type` 的扁平 switch，**六种块各有各的排版** ——
 * 图片渲染成 `<img>`、音频渲染成 `<audio controls>`、文本渲染成散文段落。
 * 序列化成 JSON 之后这些信息就全丢了，一张截图会变成几十 KB 的 base64 字符串。
 *
 * 解析是**尽力而为**的：认不出的块归到 `unknown` 并保留原始 JSON，
 * 由渲染层原样打印。协议注明新块类型不必等 Codex 发版就能透传，
 * 所以"认不出"是常态而不是异常。
 */

/** MCP 块上的注解，渲染成 `Annotations: audience=…; priority=…` 一行 */
export interface McpAnnotations {
  audience: string[] | null
  priority: number | null
  lastModified: string | null
}

export type McpContentBlock =
  | { type: 'text'; text: string; annotations: McpAnnotations | null }
  | { type: 'image'; data: string; mimeType: string; annotations: McpAnnotations | null }
  | { type: 'audio'; data: string; mimeType: string; annotations: McpAnnotations | null }
  | {
      type: 'resourceLink'
      uri: string
      name: string | null
      title: string | null
      annotations: McpAnnotations | null
    }
  | {
      type: 'embeddedResource'
      resource: {
        uri: string
        mimeType: string | null
        text: string | null
        blob: string | null
        annotations: McpAnnotations | null
      }
    }
  | { type: 'unknown'; raw: string }

function str(o: Record<string, unknown>, key: string): string | null {
  const v = o[key]
  return typeof v === 'string' ? v : null
}

function parseAnnotations(raw: unknown): McpAnnotations | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const audience = Array.isArray(o.audience)
    ? o.audience.filter((a): a is string => typeof a === 'string')
    : null
  const priority = typeof o.priority === 'number' ? o.priority : null
  const lastModified = str(o, 'lastModified')
  if (audience == null && priority == null && lastModified == null) return null
  return { audience, priority, lastModified }
}

/**
 * Codex 的 `lw()` —— 注解拼成一行。三个字段都没有就返回 null（不显示这一行）。
 */
export function formatAnnotations(a: McpAnnotations | null): string | null {
  if (a == null) return null
  const parts: string[] = []
  if (a.audience != null && a.audience.length > 0) parts.push(`audience=${a.audience.join(', ')}`)
  if (a.priority != null) parts.push(`priority=${String(a.priority)}`)
  if (a.lastModified != null) parts.push(`lastModified=${a.lastModified}`)
  return parts.length === 0 ? null : parts.join('; ')
}

/** Codex 的 `rw()` —— 缩进序列化，循环引用等异常退回空串 */
export function stringifyJson(value: unknown, indent = 2): string {
  try {
    return JSON.stringify(value, null, indent) ?? 'null'
  } catch {
    return ''
  }
}

function parseBlock(raw: unknown): McpContentBlock {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { type: 'unknown', raw: stringifyJson(raw) }
  }
  const o = raw as Record<string, unknown>
  const annotations = parseAnnotations(o.annotations)

  switch (o.type) {
    case 'text': {
      const text = str(o, 'text')
      if (text == null) break
      return { type: 'text', text, annotations }
    }
    case 'image':
    case 'audio': {
      const data = str(o, 'data')
      const mimeType = str(o, 'mimeType')
      if (data == null || mimeType == null) break
      return { type: o.type, data, mimeType, annotations }
    }
    case 'resource_link': {
      const uri = str(o, 'uri')
      if (uri == null) break
      return {
        type: 'resourceLink',
        uri,
        name: str(o, 'name'),
        title: str(o, 'title'),
        annotations
      }
    }
    case 'resource': {
      const r = o.resource
      if (r == null || typeof r !== 'object' || Array.isArray(r)) break
      const res = r as Record<string, unknown>
      const uri = str(res, 'uri')
      if (uri == null) break
      return {
        type: 'embeddedResource',
        resource: {
          uri,
          mimeType: str(res, 'mimeType'),
          text: str(res, 'text'),
          blob: str(res, 'blob'),
          annotations: parseAnnotations(res.annotations)
        }
      }
    }
  }
  return { type: 'unknown', raw: stringifyJson(raw) }
}

export function parseMcpContentBlocks(raw: unknown): McpContentBlock[] {
  if (!Array.isArray(raw)) return []
  return raw.map(parseBlock)
}

/**
 * Codex 的 `ow()` —— **整个结果就是一段 JSON** 时把它摘出来。
 *
 * 条件很紧：恰好一个块、类型是 text、没有注解、正文 trim 之后以 `{` 或 `[` 开头
 * 且能被 `JSON.parse` 解析。满足才返回缩进后的 JSON 串，否则 null。
 *
 * 摘出来是为了**换一种排版**：这类结果是机器数据不是散文，交给代码块做等宽 +
 * 语法高亮才读得懂；而普通的文本结果（MCP 服务器经常直接回一段说明）
 * 塞进代码块只会又窄又不换行。分流的判据不能是"服务器声明了什么"
 * （它只会说 type: text），只能是**正文长什么样**。
 */
export function extractStructuredJson(blocks: McpContentBlock[]): string | null {
  if (blocks.length !== 1) return null
  const [block] = blocks
  if (block.type !== 'text' || block.annotations != null) return null
  const text = block.text.trim()
  if (text[0] !== '{' && text[0] !== '[') return null
  try {
    return stringifyJson(JSON.parse(text))
  } catch {
    return null
  }
}
