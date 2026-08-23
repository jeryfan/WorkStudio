import { cx } from '../../../utils/cx'

/**
 * `DiffCounts`(Codex app-initial 源码 `CZ`) —— 「+12 -3」那对数字。
 *
 * 三处只有读源码才知道的细节:
 *
 * 1. **减号是普通的 `-`(U+002D),不是 `−`(U+2212)**。Codex 的文案 id 是
 *    `wham.message.modal.repoAndDiffStats.linesRemoved`,defaultMessage
 *    就是 `-{linesRemoved}`。我上一版自作聪明用了真减号,宽度和字形都不对
 *    ——`disambiguated-digits` 的 `tabular-nums` 管不到 U+2212。
 * 2. **`disambiguated-digits`**(`font-feature-settings:"cv01" on,"cv02" on`)
 *    是必需的:小字号下默认字形的 1/l、0/O 分不开。这个类原先没被提取器收进来。
 * 3. **`variant` 三档**,颜色来源完全不同:
 *    - `color`:直接给 git 增删色
 *    - `monochrome`:一律 placeholder 灰(用在不该抢注意力的位置)
 *    - `agent-activity`:平时继承外层颜色,只在 `group/activity-header` **hover**
 *      时才变成 git 增删色 —— 而且带
 *      `:not(:has([data-agent-activity-file-link]:hover))`:鼠标停在文件链接上
 *      不算,免得"要点链接"和"要看改了多少"两种意图的反馈混在一起。
 *      文件改动活动行用的是这一档。
 *
 * `data-thread-find-skip` 让全文搜索跳过这两个数字 —— 搜 "12" 不该命中行数。
 */
export function DiffCounts({
  linesAdded,
  linesRemoved,
  variant = 'color',
  className
}: {
  linesAdded: number
  linesRemoved: number
  variant?: 'color' | 'monochrome' | 'agent-activity'
  className?: string
}): React.JSX.Element {
  const hoverAdded =
    '[@media(hover:hover)]:group-[:hover:not(:has([data-agent-activity-file-link]:hover))]/activity-header:text-token-git-decoration-added-resource-foreground'
  const hoverRemoved =
    '[@media(hover:hover)]:group-[:hover:not(:has([data-agent-activity-file-link]:hover))]/activity-header:text-token-git-decoration-deleted-resource-foreground'

  return (
    <span
      data-thread-find-skip="true"
      className={cx(
        'inline-flex items-center gap-1 disambiguated-digits tabular-nums tracking-tight',
        className
      )}
    >
      <span
        className={cx(
          'flex shrink-0 items-center',
          variant === 'monochrome' && 'text-token-input-placeholder-foreground',
          variant === 'color' && 'text-token-git-decoration-added-resource-foreground',
          variant === 'agent-activity' && hoverAdded
        )}
      >
        +{linesAdded}
      </span>
      <span
        className={cx(
          'flex shrink-0 items-center',
          variant === 'monochrome' && 'text-token-input-placeholder-foreground',
          variant === 'color' && 'text-token-git-decoration-deleted-resource-foreground',
          variant === 'agent-activity' && hoverRemoved
        )}
      >
        -{linesRemoved}
      </span>
    </span>
  )
}
