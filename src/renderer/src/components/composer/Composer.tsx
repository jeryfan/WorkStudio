import { useWorkspace } from '../../state/WorkspaceContext'
import { BranchIcon, FolderIcon, LocalIcon, PlusIcon, SendIcon, ShieldIcon } from '../icons'
import { UtilityPill } from './UtilityPill'

/**
 * .composer-wrap（1.html 第 559-722 行）：bottom:15px，738px 宽。
 * utility-bar 用 margin-bottom:-23px + 底部 27px 内边距"咬合"进毛玻璃输入框顶部。
 */
export function Composer(): React.JSX.Element | null {
  const { currentProject } = useWorkspace()
  if (!currentProject) return null

  return (
    <div className="absolute bottom-[15px] left-1/2 flex w-[738px] max-w-[calc(100%-32px)] -translate-x-1/2 flex-col">
      <div className="mx-3 -mb-[23px] flex items-center gap-1 overflow-hidden rounded-t-2xl bg-utility px-2 pb-[27px] pt-2">
        <UtilityPill
          icon={<FolderIcon />}
          label={currentProject.name}
          ariaLabel={`Change project: ${currentProject.name}`}
        />
        <UtilityPill icon={<LocalIcon className="size-4" />} label="Local" />
        <UtilityPill icon={<BranchIcon className="size-4" />} label="main" />
      </div>

      <div className="relative z-10 flex flex-col rounded-2xl border border-black/5 bg-composer shadow-composer backdrop-blur-[16px]">
        <textarea
          className="h-12 w-full resize-none bg-transparent px-3 pb-0.5 pt-3 text-base leading-[22px] text-primary outline-none placeholder:text-placeholder"
          placeholder="Do anything"
          spellCheck
        />
        <div className="flex select-none items-center gap-[5px] px-2 pb-2">
          <div className="flex min-w-0 items-center gap-[5px]">
            <button
              type="button"
              aria-label="Add files and more"
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-primary hover:bg-black/5"
            >
              <PlusIcon />
            </button>
            <button
              type="button"
              className="flex h-6 items-center gap-1.5 rounded-full px-1.5 text-[13px] text-accent hover:bg-black/5"
            >
              <ShieldIcon className="size-4 shrink-0" />
              <span>Full access</span>
            </button>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <div className="flex items-center gap-2 whitespace-nowrap text-[13px] text-[#8b8b90]">
              <span>5.6 Sol</span>
              <span className="shrink-0">Extra High</span>
            </div>
            <button
              type="button"
              aria-label="Send"
              className="ml-1 flex size-[26px] shrink-0 items-center justify-center rounded-full bg-[rgba(28,28,30,0.5)]"
            >
              <SendIcon className="size-4 text-[#f4f4f5]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
