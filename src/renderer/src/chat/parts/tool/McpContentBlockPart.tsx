import {
  formatAnnotations,
  type McpAnnotations,
  type McpContentBlock
} from '../../model/mcpContent'

/**
 * 一个 MCP 内容块 → 一段 DOM。逐字对应 Codex `subagent-activity-chip-group`
 * 源码的 `sw(e)` —— 一个对 `block.type` 的扁平 switch，六个分支。
 *
 * ## 最要紧的一条:文本块是**散文**,不是代码
 *
 * ```
 * div.relative.overflow-clip.rounded-lg.border.border-token-border-heavy
 *    .bg-token-text-code-block-background.contain-inline-size
 * ├ div.sticky.top-0.z-10.flex.items-center.justify-between…   ← 标题栏是 sticky 的
 * │ ├ div.min-w-0.truncate  «plaintext»
 * │ └ div.flex.items-center                                    ← 空槽(Codex 也是空的)
 * └ div.max-h-48.overflow-y-auto.p-2
 *   └ pre.font-sans.whitespace-pre-wrap.break-words.leading-relaxed
 *        .text-token-description-foreground/80.m-0
 * ```
 *
 * 之前 WS 把整个 `content` 数组 `JSON.stringify` 之后塞进代码块,于是:
 * 等宽字体 + `whitespace-pre!`(不换行)→ MCP 返回的长 URL 直接横向溢出。
 * 而 MCP 的返回值**经常就是散文**(服务器回一段说明文字),按代码排版是错位的。
 *
 * 标题栏 `sticky top-0 z-10` 配合外层 `max-h-48 overflow-y-auto`:内容超过 192px
 * 时往下滚,"plaintext" 这行钉在顶上不跟着走 —— 长结果滚到一半还知道自己在看什么。
 *
 * `[&_*]:text-token-non-assistant-body-descendant` 写在**块列表容器**与 `pre` 上
 * 各一次(Codex 也是这两处,外壳那层没有):MCP 结果不是助手正文,里面万一带了
 * 带颜色的子元素也要压成"非助手正文"的灰度,不能借用助手正文的前景色。
 */
export function McpContentBlockPart({ block }: { block: McpContentBlock }): React.JSX.Element {
  switch (block.type) {
    case 'text':
      return (
        <div className="relative overflow-clip rounded-lg border border-token-border-heavy bg-token-text-code-block-background contain-inline-size">
          <div className="sticky top-0 z-10 flex items-center justify-between py-1 ps-2 pe-2 font-sans text-sm text-token-description-foreground select-none">
            <div className="min-w-0 truncate">plaintext</div>
            <div className="flex items-center" />
          </div>
          <div className="max-h-48 overflow-y-auto p-2">
            <pre className="[&_*]:text-token-non-assistant-body-descendant text-token-description-foreground/80 m-0 whitespace-pre-wrap break-words font-sans text-size-chat leading-relaxed extension:leading-normal">
              {joinLines([block.text, annotationLine(block.annotations)])}
            </pre>
          </div>
        </div>
      )

    case 'image': {
      const note = annotationLine(block.annotations)
      const img = (
        <img
          className="max-h-48 w-max max-w-full gap-0.5 rounded-md object-contain"
          src={`data:${block.mimeType};base64,${block.data}`}
        />
      )
      if (note == null) return img
      return (
        <div className="flex flex-col gap-0.5">
          {img}
          <p className="text-size-chat whitespace-pre-wrap text-token-description-foreground/80">
            {note}
          </p>
        </div>
      )
    }

    case 'audio': {
      const note = annotationLine(block.annotations)
      return (
        <div className="flex flex-col gap-0.5">
          <audio
            className="w-full gap-0.5"
            controls
            src={`data:${block.mimeType};base64,${block.data}`}
            preload="metadata"
          />
          {note == null ? null : (
            <p className="text-size-chat whitespace-pre-wrap text-token-description-foreground/80">
              {note}
            </p>
          )}
        </div>
      )
    }

    case 'resourceLink': {
      const note = annotationLine(block.annotations)
      return (
        <div className="flex flex-col gap-0.5 text-size-chat">
          <div className="break-words text-token-description-foreground/80">
            Read {block.title ?? block.name ?? block.uri}
          </div>
          {note == null ? null : (
            <div className="break-words whitespace-pre-wrap text-token-description-foreground/80">
              {note}
            </div>
          )}
        </div>
      )
    }

    /*
     * 内嵌资源摊成一张"字段表":URI / MIME type / Annotations / Content。
     * 标签用 `font-medium text-token-foreground` 压深一档 —— 这里同时出现
     * 四种不同性质的值,不给标签加重量就分不清哪段是哪段。
     * `break-all` 而不是 `break-words`:URI 里没有空格,按词断行等于不断行。
     */
    case 'embeddedResource': {
      const { resource } = block
      const content = resource.text ?? resource.blob ?? ''
      const note = formatAnnotations(resource.annotations)
      return (
        <div className="flex flex-col gap-0.5 text-size-chat text-token-description-foreground/80">
          <div className="flex gap-1">
            <span className="font-medium text-token-foreground">URI</span>
            <span className="break-all">{resource.uri}</span>
          </div>
          {resource.mimeType == null ? null : (
            <div className="flex gap-1">
              <span className="font-medium text-token-foreground">MIME type</span>
              <span className="break-all">{resource.mimeType}</span>
            </div>
          )}
          {note == null ? null : (
            <div className="flex gap-1">
              <span className="font-medium text-token-foreground">Annotations</span>
              <span className="break-all">{note}</span>
            </div>
          )}
          {content === '' ? null : (
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-token-foreground">Content</span>
              <pre className="max-h-48 overflow-auto rounded-md bg-token-input-background px-3 py-2 whitespace-pre-wrap text-token-description-foreground/80">
                {content}
              </pre>
            </div>
          )}
        </div>
      )
    }

    case 'unknown':
      return (
        <pre className="[&_*]:text-token-non-assistant-body-descendant bg-token-input-background text-token-description-foreground/80 max-h-48 overflow-auto whitespace-pre-wrap rounded-md px-3 py-2 text-size-chat">
          {block.raw}
        </pre>
      )
  }
}

/** Codex 的 `cw()` —— 注解拼成 `Annotations: …` 一行 */
function annotationLine(annotations: McpAnnotations | null): string | null {
  const formatted = formatAnnotations(annotations)
  return formatted == null ? null : `Annotations: ${formatted}`
}

/** Codex 的 `uw()` —— 去掉 null 之后用换行拼起来 */
function joinLines(parts: (string | null)[]): string {
  return parts.filter((p) => p != null).join('\n')
}
