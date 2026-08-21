import { useState } from 'react'
import { useWorkspace } from '../../state/WorkspaceContext'
import { HomeLogoIcon } from '../icons'
import { Popover } from '../composer/popovers/Popover'
import { ProjectPicker } from '../composer/popovers/ProjectPicker'

/**
 * .hero（1.html 第 446-490 行）：top:289px 水平居中，logo + 标题（项目名 proj-link）。
 * 项目名是项目选择弹层的第二个触发点（chat.html 中 projectTrigger 与
 * composer 的 projectSelector 共用 #popProject）。
 */
export function Hero(): React.JSX.Element | null {
  const { currentProject } = useWorkspace()
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  if (!currentProject) return null

  return (
    <div className="absolute left-1/2 top-[289px] flex w-max max-w-full -translate-x-1/2 flex-col items-center gap-6">
      <div data-testid="home-icon" className="relative size-14 text-token-text-primary opacity-30">
        <HomeLogoIcon className="absolute inset-0 size-full" />
      </div>
      <h1 className="select-none whitespace-pre-wrap text-center text-2xl font-normal leading-8 text-token-text-primary">
        What should we build in{' '}
        <button
          type="button"
          onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
          className="inline-block underline decoration-[rgba(111,111,116,0.9)] decoration-dotted decoration-1 underline-offset-4 hover:text-[#55555a]"
        >
          {currentProject.name}
        </button>
        ?
      </h1>
      {anchor && (
        <Popover
          anchor={anchor}
          align="center"
          width={260}
          onClose={() => setAnchor(null)}
          ariaLabel="Select project"
        >
          <ProjectPicker onClose={() => setAnchor(null)} />
        </Popover>
      )}
    </div>
  )
}
