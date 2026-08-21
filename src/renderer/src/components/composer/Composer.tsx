import { useRef, useState } from 'react'
import { useWorkspace } from '../../state/WorkspaceContext'
import { useSession } from '../../state/SessionContext'
import { useChatRuntime } from '../../state/ChatRuntimeContext'
import type { AskForApproval, SandboxMode } from '@shared/protocol/entities'
import {
  BranchIcon,
  CircleCloseIcon,
  FolderIcon,
  LocalIcon,
  PlusIcon,
  SendIcon,
  ShieldIcon
} from '../icons'
import { UtilityPill } from './UtilityPill'
import { Popover } from './popovers/Popover'
import { ProjectPicker } from './popovers/ProjectPicker'
import { PlusMenu } from './popovers/PlusMenu'
import { AccessPicker } from './popovers/AccessPicker'
import { ModelPicker } from './popovers/ModelPicker'

/** Composer 的四个弹层身份；同一时刻只打开一个（chat.html closeAll 的语义） */
type PopoverId = 'project' | 'plus' | 'access' | 'model'

interface PopoverState {
  id: PopoverId
  /** 打开瞬间的触发元素 rect，弹层据此 fixed 定位 */
  anchor: DOMRect
}

/**
 * .composer-wrap（1.html 第 559-722 行）：bottom:15px，738px 宽。
 * utility-bar 用 margin-bottom:-23px + 底部 27px 内边距"咬合"进毛玻璃输入框顶部。
 *
 * 交互接线（设计文档 §5.4 + chat.html）：
 * - 项目 pill → ProjectPicker；hover 出现的 × 取消项目归属（unassigned）
 * - 加号 → PlusMenu（Add/Plugins/Agents/Files 分区）
 * - 权限 pill → AccessPicker（approval + sandbox 策略，存 SessionContext）
 * - 模型 pill → ModelPicker（model/list + effort 滑块，存 SessionContext）
 * - Local / Branch pill 保持静态展示，不接线
 *
 * 提交目标由 ChatRuntime 决定：已有打开的会话就在其中追加一轮，
 * 否则先建会话再发第一轮。
 */
/** 无项目会话的权限档：逐项授权 */
const PROJECTLESS_APPROVAL: AskForApproval = {
  granular: {
    sandbox_approval: true,
    rules: true,
    skill_approval: true,
    request_permissions: true,
    mcp_elicitations: true
  }
}

export function Composer({ inline = false }: { inline?: boolean } = {}): React.JSX.Element {
  const { currentProject, selectProject } = useWorkspace()
  const { access, model, effort } = useSession()
  const { activeChatId, phase, readOnly, sendMessage, startChat, interrupt } = useChatRuntime()
  const [text, setText] = useState('')
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const projectPillRef = useRef<HTMLSpanElement>(null)

  const closePopover = (): void => setPopover(null)

  const togglePopover = (id: PopoverId, anchor: DOMRect): void => {
    setPopover((prev) => (prev?.id === id ? null : { id, anchor }))
  }

  /** 加号菜单铺满 composer 宽度，锚点取整个 wrap */
  const togglePlusMenu = (): void => {
    const wrap = wrapRef.current
    if (!wrap) return
    togglePopover('plus', wrap.getBoundingClientRect())
  }

  const openProjectPicker = (): void => {
    const pill = projectPillRef.current
    if (!pill) return
    setPopover({ id: 'project', anchor: pill.getBoundingClientRect() })
  }

  const handlePlusSelect = (id: string): void => {
    if (id === 'work-in-project') {
      openProjectPicker()
      return
    }
    // 附件 / 目标 / 计划模式 / 技能 / 插件动作随 M4 会话输入（UserInput）接入
    closePopover()
  }

  const running = phase === 'running'
  const canSend = text.trim().length > 0 && !submitting && !readOnly

  /**
   * 无项目会话回落到用户主目录，并把权限档收紧到逐项授权——没有项目边界时
   * agent 名义上能碰整个主目录，沿用项目内的宽松档风险过大。
   */
  const resolveRunLocation = (): {
    cwd: string
    approvalPolicy: AskForApproval
    sandbox: SandboxMode
  } => {
    const root = currentProject?.rootPaths[0]
    if (root) return { cwd: root, approvalPolicy: access.approval, sandbox: access.sandbox }
    // granular 会对沙箱、规则、技能、权限提升逐项征求同意
    return { cwd: '~', approvalPolicy: PROJECTLESS_APPROVAL, sandbox: 'workspace-write' }
  }

  const submit = async (): Promise<void> => {
    const value = text.trim()
    if (!value || submitting) return
    setSubmitting(true)
    // 先清空输入框：用户消息由服务端回显成条目，这里不做本地插入，
    // 否则会和回显的那条重复。
    setText('')
    try {
      if (activeChatId) await sendMessage(value)
      else await startChat({ text: value, ...resolveRunLocation() })
    } catch (err) {
      // 发送失败把文本还给用户，不然内容就丢了
      setText(value)
      console.error('[composer] submit failed:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter 发送，Shift+Enter 换行；输入法组合期间不能拦截
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <div
      ref={wrapRef}
      className={
        inline
          ? // 会话页：输入区在正常流里，宽度跟随正文列
            'flex w-full flex-col'
          : // 首页：绝对定位居中悬浮
            'absolute bottom-[15px] left-1/2 flex w-[738px] max-w-[calc(100%-32px)] -translate-x-1/2 flex-col'
      }
    >
      <div className="mx-3 -mb-[23px] flex items-center gap-1 overflow-hidden rounded-t-2xl bg-(--color-background-button-secondary) px-2 pb-[27px] pt-2">
        {/* 项目 pill + hover 出现的取消按钮（chat.html .proj-group） */}
        <span ref={projectPillRef} className="group/proj flex items-center gap-0.5">
          <UtilityPill
            icon={<FolderIcon />}
            label={currentProject?.name ?? 'Select project'}
            ariaLabel={currentProject ? `Change project: ${currentProject.name}` : 'Select project'}
            onClick={(e) => togglePopover('project', e.currentTarget.getBoundingClientRect())}
          />
          {currentProject && (
            <button
              type="button"
              aria-label="Don't work in a project"
              onClick={() => void selectProject({ type: 'unassigned' })}
              className="flex size-4 items-center justify-center text-token-text-tertiary opacity-0 transition-opacity hover:text-token-text-primary group-hover/proj:opacity-100"
            >
              <CircleCloseIcon className="size-4" />
            </button>
          )}
        </span>
        {/* Local / Branch：静态展示，按需求不接线 */}
        <UtilityPill icon={<LocalIcon className="size-4" />} label="Local" />
        {currentProject && <UtilityPill icon={<BranchIcon className="size-4" />} label="main" />}
      </div>

      <div className="relative z-10 flex flex-col rounded-2xl border border-black/5 bg-(--color-background-elevated-primary) shadow-(--color-background-elevated-primary) backdrop-blur-[16px]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={readOnly}
          className="h-12 w-full resize-none bg-transparent px-3 pb-0.5 pt-3 text-base leading-[22px] text-token-text-primary outline-none placeholder:text-token-input-placeholder-foreground"
          placeholder={readOnly ? 'Read-only — open in another client' : 'Do anything'}
          spellCheck
        />
        <div className="flex select-none items-center gap-[5px] px-2 pb-2">
          <div className="flex min-w-0 items-center gap-[5px]">
            <button
              type="button"
              aria-label="Add files and more"
              onClick={togglePlusMenu}
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-token-text-primary hover:bg-black/5"
            >
              <PlusIcon />
            </button>
            <button
              type="button"
              onClick={(e) => togglePopover('access', e.currentTarget.getBoundingClientRect())}
              className={`flex h-6 items-center gap-1.5 rounded-full px-1.5 text-[13px] hover:bg-black/5 ${
                access.warn ? 'text-(--color-accent-orange)' : 'text-token-text-primary'
              }`}
            >
              <ShieldIcon className="size-4 shrink-0" />
              <span>{access.label}</span>
            </button>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={(e) => togglePopover('model', e.currentTarget.getBoundingClientRect())}
              className="flex h-6 items-center gap-2 whitespace-nowrap rounded-full px-1.5 text-[13px] text-[#8b8b90] hover:bg-black/5"
            >
              <span className="tabular-nums">{model?.displayName ?? '…'}</span>
              <span className="shrink-0">{effort ?? ''}</span>
            </button>
            {/* 运行中变停止：一个按钮两种语义，与上游一致 */}
            <button
              type="button"
              aria-label={running ? 'Stop' : 'Send'}
              disabled={running ? false : !canSend}
              onClick={() => (running ? void interrupt() : void submit())}
              className={`ml-1 flex size-[26px] shrink-0 items-center justify-center rounded-full ${
                running || canSend ? 'bg-[rgba(28,28,30,0.9)]' : 'bg-[rgba(28,28,30,0.5)]'
              }`}
            >
              {running ? (
                <span className="size-2.5 rounded-[2px] bg-[#f4f4f5]" />
              ) : (
                <SendIcon className="size-4 text-[#f4f4f5]" />
              )}
            </button>
          </div>
        </div>
      </div>

      {popover?.id === 'project' && (
        <Popover
          anchor={popover.anchor}
          width={260}
          onClose={closePopover}
          ariaLabel="Select project"
        >
          <ProjectPicker onClose={closePopover} />
        </Popover>
      )}
      {popover?.id === 'plus' && (
        <Popover
          anchor={popover.anchor}
          width={popover.anchor.width}
          height={320}
          onClose={closePopover}
          ariaLabel="Add files and more"
        >
          <PlusMenu onSelect={handlePlusSelect} />
        </Popover>
      )}
      {popover?.id === 'access' && (
        <Popover
          anchor={popover.anchor}
          width={Math.min(480, window.innerWidth - 16)}
          onClose={closePopover}
          ariaLabel="Approval policy"
        >
          <AccessPicker onClose={closePopover} />
        </Popover>
      )}
      {popover?.id === 'model' && (
        <Popover
          anchor={popover.anchor}
          align="end"
          width={224}
          onClose={closePopover}
          ariaLabel="Select model"
        >
          <ModelPicker />
        </Popover>
      )}
    </div>
  )
}
