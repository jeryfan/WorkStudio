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
import { ChevronIcon } from '../icons'
import { COMPOSER_BUTTON_BASE, ComposerDropdownLabel } from './ComposerDropdownLabel'
import { RichTextInput } from './RichTextInput'
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
 * Composer —— 层级与类名逐层对齐 Codex 实测(见 docs/codex-alignment-audit.md A4)。
 *
 *   div.min-w-0.w-full [data-codex-composer-root data-composer-placement]
 *   ├ div.relative.px-[…home-composer-inline-inset].empty:hidden.electron:grid
 *   │   [data-above-composer-portal]                      ← 上方 portal 槽(常空)
 *   └ div.flex.w-full.flex-col.gap-2.relative
 *     ├ div.z-0.relative.-mb-2                            ← 工具条,负 margin 咬进输入框
 *     │ └ div > div.codex-ComposerFooter.codex-ComposerHomeUtilityBar
 *     │       [data-composer-home-utility-bar-position="above"][data-composer-placement]
 *     │   └ div.horizontal-scroll-fade-mask.hide-scrollbar…overflow-x-auto
 *     │       [data-composer-utility-bar-scroll-area role="group"]
 *     │     └ div.flex.w-max.min-w-full.items-center.gap-1
 *     └ div.relative
 *       └ div.codex-ComposerLayoutRoot.gap-2 [data-composer-layout / -radius-variant /
 *             -surface-overflow / -surface-variant / -utility-bar-variant]
 *         └ div.codex-ComposerLayoutBody [data-composer-layout]
 *           ├ div.contents > div.codex-ComposerLayoutAttachments [data-composer-attachments]
 *           └ div.contents > div.codex-ComposerLayoutFooter [data-composer-footer-responsive]
 *             ├ div.min-w-0.col-start-1.row-start-2        ← 左下:加号 + 权限
 *             ├ div.min-w-0.col-span-full.row-start-1.-mx-2 ← 输入区(占满第一行)
 *             └ div.min-w-0.col-start-3.row-start-2        ← 右下:模型 + 发送
 *
 * 机制上的关键点:
 *
 * 1. **ComposerLayoutFooter 是 grid**,三个槽用 `col-start`/`row-start` 显式定位:
 *    输入区在第 1 行占满(`col-span-full`),两组控件在第 2 行左右分列。
 *    之前用 flex + `ml-auto` 排,窄窗口下换行行为和 Codex 不一样。
 * 2. 工具条那层 **`-mb-2`(8px)** 负 margin 咬进输入框,不是之前的
 *    `-mb-[23px]` + `pb-[27px]` 那套硬编码。
 * 3. 输入框表面色/圆角/模糊全部由 `codex-ComposerLayoutRoot` 的模块 CSS 给,
 *    由 4 个 `data-composer-*` 属性选档 —— 不在这里写 `rounded-2xl border bg-… backdrop-blur`。
 * 4. 尺寸 token:按钮 `h-token-button-composer-sm`(20px)/ 发送键
 *    `size-token-button-composer`(28px),不是 h-6 / size-[26px]。
 *
 * 输入区是 ProseMirror(见 RichTextInput.tsx),与 Codex 同构:
 * (`codex-RichTextInput` > `div.ProseMirror[contenteditable]` > `p.placeholder`)。
 *
 * 交互接线(保持原有,未改):
 * - 项目 pill → ProjectPicker;hover 出现的 × 取消项目归属
 * - 加号 → PlusMenu;权限 pill → AccessPicker;模型 pill → ModelPicker
 * - 提交目标由 ChatRuntime 决定:有打开的会话就追加一轮,否则先建会话
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

/**
 * placement 决定工具条与表面的档位,Codex 用 data-composer-placement 表达
 * ('home' | 'thread')。原先那个 `inline` 布尔已删 —— 位置差异不再靠调用方
 * 换外层类名(首页曾是 absolute 定位),而是由 HomeView / ChatView 各自的
 * 流式容器决定,Composer 自己永远是 `min-w-0 w-full`。
 */
export function Composer({
  placement = 'home'
}: { placement?: 'home' | 'thread' } = {}): React.JSX.Element {
  const { currentProject, selectProject } = useWorkspace()
  const { access, model, effort } = useSession()
  const { activeChatId, phase, readOnly, sendMessage, startChat, interrupt } = useChatRuntime()
  const [text, setText] = useState('')
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const projectPillRef = useRef<HTMLButtonElement>(null)

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

  // Enter 提交 / Shift+Enter 换行归 RichTextInput 的 keymap
  // (ProseMirror 自己处理输入法组合态,不需要再判 isComposing)

  return (
    <div
      ref={wrapRef}
      data-codex-composer-root=""
      data-composer-placement={placement}
      className="min-w-0 w-full"
    >
      <div
        data-above-composer-portal="true"
        className="relative px-[var(--home-composer-inline-inset)] empty:hidden electron:grid"
      />
      <div className="flex w-full flex-col gap-2 relative">
        {/* 工具条 —— -mb-2 咬进下面的输入框表面 */}
        <div className="z-0 relative -mb-2" aria-hidden="false">
          <div>
            <div
              className="codex-ComposerFooter codex-ComposerHomeUtilityBar"
              data-composer-home-utility-bar-position="above"
              data-composer-placement={placement}
            >
              <div
                role="group"
                aria-label="Composer utility bar"
                data-composer-utility-bar-scroll-area=""
                className="horizontal-scroll-fade-mask hide-scrollbar min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
              >
                <div className="flex w-max min-w-full items-center gap-1">
                  {/* 项目选择器 —— Codex 用 ActiveProjectSelectorTrigger 包住按钮 + 清除键 */}
                  <div
                    className="codex-ActiveProjectSelectorTrigger"
                    data-clear-project-available={currentProject ? '' : undefined}
                    data-subtle-hover=""
                  >
                    <button
                      type="button"
                      ref={projectPillRef}
                      aria-label={
                        currentProject ? `Change project: ${currentProject.name}` : 'Select project'
                      }
                      onClick={(e) =>
                        togglePopover('project', e.currentTarget.getBoundingClientRect())
                      }
                      className={`${COMPOSER_BUTTON_BASE} codex-ComposerFooterDropdown h-token-button-composer-sm px-1.5 py-0 text-sm leading-[18px] in-data-[composer-placement=home]:px-2`}
                    >
                      <ComposerDropdownLabel
                        foreground="primary"
                        collapse="xs"
                        valueClassName="!max-w-60 text-token-foreground"
                        icon={
                          <span className="inline-flex shrink-0" data-project-selector-icon="true">
                            <FolderIcon className="icon-xs shrink-0" />
                          </span>
                        }
                      >
                        <span data-tooltip-visibility-target="true">
                          {currentProject?.name ?? 'Select project'}
                        </span>
                      </ComposerDropdownLabel>
                    </button>
                    {currentProject && (
                      <button
                        type="button"
                        aria-label="Don't work in a project"
                        data-clear-project-button="true"
                        data-state="closed"
                        onClick={() => void selectProject({ type: 'unassigned' })}
                        className="codex-ActiveProjectSelectorTriggerClearButton"
                      >
                        <CircleCloseIcon className="size-4" />
                      </button>
                    )}
                  </div>
                  {/* 运行位置 —— Codex 首页显示 "Local",宽处显示 "Work locally" */}
                  <button
                    type="button"
                    className={`${COMPOSER_BUTTON_BASE} codex-ComposerFooterDropdown h-token-button-composer-sm px-1.5 py-0 text-sm leading-[18px] in-data-[composer-placement=home]:px-2 outline-hidden`}
                  >
                    <ComposerDropdownLabel
                      foreground="primary"
                      collapse="xs"
                      valueClassName="max-w-40"
                      icon={<LocalIcon className="icon-xs" />}
                      chevron={<ChevronIcon className="codex-ComposerDropdownLabelChevron" />}
                    >
                      <span className="in-data-[composer-placement=home]:hidden">Work locally</span>
                      <span className="hidden in-data-[composer-placement=home]:inline">Local</span>
                    </ComposerDropdownLabel>
                  </button>
                  {currentProject && (
                    <button
                      type="button"
                      className={`${COMPOSER_BUTTON_BASE} codex-ComposerFooterDropdown h-token-button-composer-sm px-1.5 py-0 text-sm leading-[18px] in-data-[composer-placement=home]:px-2 outline-hidden cursor-interaction px-0`}
                    >
                      <ComposerDropdownLabel
                        foreground="primary"
                        collapse="sm"
                        valueClassName="max-w-40 text-sm"
                        icon={<BranchIcon className="icon-xs" />}
                        secondaryChevron={
                          <ChevronIcon className="codex-ComposerDropdownLabelChevron" />
                        }
                      >
                        main
                      </ComposerDropdownLabel>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative">
          <div
            className="codex-ComposerLayoutRoot gap-2"
            data-composer-layout="multiline"
            data-composer-radius-variant="default"
            data-composer-surface-overflow="visible"
            data-composer-surface-variant="default"
            data-composer-utility-bar-variant={placement}
          >
            <div className="codex-ComposerLayoutBody" data-composer-layout="multiline">
              <div className="contents">
                <div
                  className="codex-ComposerLayoutAttachments"
                  data-composer-attachments=""
                  data-composer-spacing="default"
                />
              </div>
              <div className="contents">
                <div
                  className="codex-ComposerLayoutFooter"
                  data-composer-footer-responsive=""
                  data-composer-layout="multiline"
                  data-composer-spacing="default"
                >
                  {/* 左下槽 */}
                  <div className="min-w-0 col-start-1 row-start-2">
                    <div className="flex min-w-0 items-center gap-[5px]">
                      <span className="contents" data-state="closed">
                        <button
                          type="button"
                          aria-label="Add files and more"
                          onClick={togglePlusMenu}
                          className={`${COMPOSER_BUTTON_BASE} h-token-button-composer px-2 py-0 text-sm leading-[18px] aspect-square shrink-0 items-center justify-center !px-0`}
                        >
                          <PlusIcon className="icon-xs text-token-text-primary" />
                        </button>
                      </span>
                      <button
                        type="button"
                        onClick={(e) =>
                          togglePopover('access', e.currentTarget.getBoundingClientRect())
                        }
                        className={`${COMPOSER_BUTTON_BASE} h-token-button-composer-sm px-1.5 py-0 text-sm leading-[18px] outline-hidden cursor-interaction min-w-0`}
                      >
                        <ComposerDropdownLabel
                          foreground={access.warn ? 'warning' : 'primary'}
                          collapse="xs"
                          valueClassName="max-w-40"
                          icon={
                            <ShieldIcon
                              className={`icon-xs shrink-0 ${
                                access.warn ? 'text-token-editor-warning-foreground' : ''
                              }`}
                            />
                          }
                        >
                          {access.label}
                        </ComposerDropdownLabel>
                      </button>
                    </div>
                  </div>

                  {/* 输入槽 —— 第一行占满 */}
                  <div className="min-w-0 col-span-full row-start-1 -mx-2">
                    <div className="mb-1 flex-grow overflow-y-auto px-3">
                      <RichTextInput
                        value={text}
                        onChange={setText}
                        onSubmit={() => void submit()}
                        disabled={readOnly}
                        ariaLabel="Do anything"
                        placeholder={
                          readOnly ? 'Read-only — open in another client' : 'Do anything'
                        }
                      />
                    </div>
                  </div>

                  {/* 右下槽 */}
                  <div className="min-w-0 col-start-3 row-start-2">
                    <div className="flex min-w-0 items-center justify-end w-full">
                      <div className="flex min-w-0 flex-1 justify-end">
                        <div className="flex min-w-0 items-center gap-1">
                          <span>
                            <span
                              className="contents outline-hidden cursor-interaction"
                              data-state="closed"
                            >
                              <button
                                type="button"
                                onClick={(e) =>
                                  togglePopover('model', e.currentTarget.getBoundingClientRect())
                                }
                                className={`${COMPOSER_BUTTON_BASE} h-token-button-composer px-2 py-0 text-sm leading-[18px] min-w-0`}
                              >
                                <ComposerDropdownLabel
                                  foreground="tertiary"
                                  collapse="none"
                                  valueClassName="max-w-40"
                                >
                                  <span className="flex max-w-40 min-w-0 items-center gap-1.5">
                                    <span className="flex min-w-0 items-center gap-1 tabular-nums">
                                      <span className="truncate whitespace-nowrap">
                                        {model?.displayName ?? '…'}
                                      </span>
                                    </span>
                                    {effort && (
                                      <span
                                        className="codex-ComposerFooterLabel shrink-0"
                                        data-composer-footer-collapse="sm"
                                      >
                                        {effort}
                                      </span>
                                    )}
                                  </span>
                                </ComposerDropdownLabel>
                              </button>
                            </span>
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {/* 运行中变停止:一个按钮两种语义,与上游一致 */}
                        <button
                          type="button"
                          aria-label={running ? 'Stop' : 'Send'}
                          disabled={running ? false : !canSend}
                          onClick={() => (running ? void interrupt() : void submit())}
                          className={`cursor-interaction size-token-button-composer flex items-center justify-center rounded-full transition-opacity focus-visible:outline-2 bg-token-foreground p-0.5 focus-visible:outline-token-button-background ${
                            running || canSend ? 'opacity-100' : 'opacity-50'
                          }`}
                        >
                          {running ? (
                            <span className="size-2.5 rounded-[2px] bg-token-dropdown-background" />
                          ) : (
                            <SendIcon className="icon-xs text-token-dropdown-background" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Codex 的 ComposerLayoutBody 有**第三个**空 div.contents ——
                  预留给附加槽(实测常态为空,但结构在)。 */}
              <div className="contents" />
            </div>
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
