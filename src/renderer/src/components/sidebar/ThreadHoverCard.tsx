import type { ChatSummary } from '../../services/chat/types'
import { useWorkspace } from '../../state/WorkspaceContext'
import { formatRelativeTime } from '../../utils/time'
import { BranchIcon, FolderIcon, InfoIcon } from '../icons'
import {
  HoverCardRowView,
  HoverCardSectionView,
  HoverCardTitle,
  type HoverCardSection
} from './HoverCardParts'

/**
 * 会话悬浮卡片的**内容** —— 外壳(圆角/模糊/定位/portal)归 `Tooltip`
 * 的 `variant="rich"`,这里只渲染 Codex `XNc` 那棵子树。
 *
 * 实测规格(Codex 里给项目内的会话行 hover 800ms,卡片 224×86):
 *
 * ```
 * div.flex.w-fit.max-w-[min(20rem,calc(100vw-16px))].min-w-56.flex-col.gap-1.px-row-x.py-1.5.text-token-foreground
 * ├ div.flex.min-w-0.flex-col.gap-1.pb-0.5           标题块
 * │ └ div.flex.w-full.min-w-0.items-center.gap-3
 * │   ├ HoverCardTitle(w-0 flex-1)                   可改名
 * │   └ div.flex.shrink-0.items-center.gap-1.text-xs.leading-5.text-token-description-foreground   «2d»
 * ├ [项目行]                                          直接挂在根上,不进 section
 * ├ [仓库行]
 * └ sections…                                        每组一层 div.flex.min-w-0.flex-col.gap-1
 * ```
 *
 * 两个容易搞错的点:
 * - **相对时间是 text-xs(12px)**,不是 text-sm。会话行内不显示时间,时间只在这张卡片里。
 * - 项目行/仓库行是根的**直接**子元素,和 sections 平级;把它们塞进 section
 *   会多出一层 `div.flex.flex-col.gap-1`,行距就变了。
 *
 * ## 为什么本机 Codex 里 hover 会话行不弹卡片
 *
 * 不是延迟太短也不是没实现:`SRc` 里 `disableHoverCard: c || (E == null && !Ee)`,
 * 其中 `E = hoverCardProjectLabel`。侧栏列表只在**会话归属某个项目**时才有这个
 * 标签(`W = s ?? H?.label ?? null`),所以 Recents / 置顶里的无项目会话一律不弹。
 * 展开项目后 hover 它下面的会话,卡片就出来了 —— 上面那份 224×86 的实测就是这么拿到的。
 */
export function ThreadHoverCard({ chat }: { chat: ChatSummary }): React.JSX.Element {
  const { projects, renameChat } = useWorkspace()
  const project = projects.find((p) => p.id === chat.projectId)

  const sections: HoverCardSection[] = []
  if (chat.gitBranch) {
    sections.push({
      id: 'environment',
      rows: [{ id: 'branch', icon: <BranchIcon className="icon-xs" />, label: chat.gitBranch }]
    })
  }
  if (chat.status.type === 'systemError') {
    sections.push({
      id: 'status',
      rows: [
        {
          id: 'system-error',
          allowWrap: true,
          icon: <InfoIcon className="icon-xs text-token-error-foreground" />,
          label: 'Task encountered a system error',
          tone: 'danger'
        }
      ]
    })
  }

  return (
    <div className="flex w-fit max-w-[min(20rem,calc(100vw-16px))] min-w-56 flex-col gap-1 px-row-x py-1.5 text-token-foreground">
      <div className="flex min-w-0 flex-col gap-1 pb-0.5">
        <div className="flex w-full min-w-0 items-center gap-3">
          <HoverCardTitle
            className="w-0 flex-1"
            title={chat.title}
            titleValue={chat.title}
            onRename={(next) => void renameChat(chat.id, next)}
          />
          <div className="flex shrink-0 items-center gap-1 text-xs leading-5 text-token-description-foreground">
            {formatRelativeTime(chat.updatedAt)}
          </div>
        </div>
      </div>
      {/* 项目行是根的直接子元素,不进 section —— 多包一层 gap-1 行距就变了 */}
      {project && (
        <HoverCardRowView
          row={{ id: 'project', icon: <FolderIcon className="icon-xs" />, label: project.name }}
        />
      )}
      {sections.map((section) => (
        <HoverCardSectionView key={section.id} section={section} />
      ))}
    </div>
  )
}
