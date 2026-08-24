import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspace } from '../../state/WorkspaceContext'
import { useSession } from '../../state/SessionContext'
import { useChatRuntime } from '../../state/ChatRuntimeContext'
import { useAppShell } from '../../state/AppShellContext'
import { openSideChat } from '../panel/sideChat/openSideChat'
import { effortProtocolValue } from '../../services/model/types'
import { listSkills } from '../../services/chat/skillService'
import { searchFiles } from '../../services/file/fileSearchService'
import { rpc } from '../../rpc/client'
import { M } from '@shared/protocol/methods'
import { cx } from '../../utils/cx'
import type { AskForApproval, SandboxMode, UserInput } from '@shared/protocol/entities'
import type { SkillMetadata } from '@shared/protocol/generated/v2/SkillMetadata'
import {
  BranchIcon,
  CircleCloseIcon,
  CodexNewChatIcon,
  CompactIcon,
  FileCodeIcon,
  FolderIcon,
  LocalIcon,
  PlusIcon,
  ReasoningIcon,
  SendIcon,
  ShieldIcon,
  SideIcon,
  SkillGenericIcon,
  StopIcon
} from '../icons'
import { ChevronIcon } from '../icons'
import { COMPOSER_BUTTON_BASE, ComposerDropdownLabel } from './ComposerDropdownLabel'
import { QueuedMessageList } from './QueuedMessageList'
import {
  ComposerTopMenuShell,
  type ComposerMenuItem,
  type ComposerMenuSection
} from './ComposerTopMenuShell'
import { buildPlusMenuSections } from './popovers/PlusMenu'
import {
  RichTextInput,
  type ComposerAutocompleteState,
  type ComposerDraft,
  type RichTextInputHandle
} from './RichTextInput'
import { Popover } from './popovers/Popover'
import { ProjectPicker } from './popovers/ProjectPicker'
import { AccessPicker } from './popovers/AccessPicker'
import { ModelPicker } from './popovers/ModelPicker'

/** Composer 的三个 portal 弹层身份(radix 系);同一时刻只打开一个 */
type PopoverId = 'project' | 'access' | 'model'

interface PopoverState {
  id: PopoverId
  /** 打开瞬间的触发元素 rect，弹层据此 fixed 定位 */
  anchor: DOMRect
}

/**
 * 点击表面空白聚焦输入框时,这些元素不算"空白"(Codex `k_o`,逐项照抄)。
 * 点在交互元素上不能抢焦点,否则按钮/链接就点不动了。
 */
const INTERACTIVE_ELEMENT_SELECTOR = `a[href], button, input, select, textarea, [contenteditable='true'], [draggable='true'], [role='button'], [role='link'], [role='menuitem'], [role='option'], [tabindex]:not([tabindex='-1'])`

/**
 * utility bar 进场完成后的定居样式(Codex g_o 的 framer-motion 动画终态,
 * 实测 DOM 就是这条内联 style)。Codex 的 0.3s 进场动画由 shouldAnimate 门控;
 * 这里直接渲染终态 —— 动画未复刻(已记录的偏差),换来 rAF 节流窗口下
 * 不会卡在 opacity: 0 的确定性。
 */
const UTILITY_BAR_SETTLED_STYLE = { opacity: 1, transform: 'translateY(0px)' } as const

/**
 * Composer —— 层级与类名逐层对齐 Codex 实测(见 docs/codex-alignment-audit.md A4;
 * 本轮补齐 thread placement 的运行时差异):
 *
 *   div[data-codex-composer-root data-composer-placement]   class=min-w-0(home 多 w-full)
 *   ├ div[data-above-composer-portal][data-above-composer-conversation-id]
 *   │     .relative.px-[--home-composer-inline-inset].empty:hidden.electron:grid
 *   └ div.flex.w-full.flex-col.gap-2.relative
 *     ├ (仅 home)motion.div.z-0.relative.-mb-2[aria-hidden]      ← UtilityBarSlot
 *     │ └ div > div.codex-ComposerFooter.codex-ComposerHomeUtilityBar
 *     │       [data-composer-home-utility-bar-position="above"][data-composer-placement]
 *     │   └ div[role="group"][data-composer-utility-bar-scroll-area].horizontal-scroll-fade-mask…
 *     │     └ div.flex.w-max.min-w-full.items-center.gap-1
 *     └ div.relative
 *       └ div.codex-ComposerLayoutRoot(.gap-2@home)
 *           [data-composer-layout / -radius-variant / -surface-overflow(home=visible,thread=auto)
 *            / -surface-variant / -utility-bar-variant(home|default)]
 *           [onMouseDown=点空白聚焦 ProseMirror(Codex D_o)]
 *         └ div.codex-ComposerLayoutBody [data-composer-layout]
 *           ├ div.contents > div.codex-ComposerLayoutAttachments [data-composer-attachments]
 *           ├ div.contents > div.codex-ComposerLayoutFooter [data-composer-footer-responsive]
 *           │ ├ div.min-w-0.col-start-1.row-start-2        ← 左下:加号 + 权限
 *           │ ├ div.min-w-0.col-span-full.row-start-1.-mx-2 ← 输入区(占满第一行)
 *           │ └ div.min-w-0.col-start-3.row-start-2        ← 右下:模型 + 提交
 *           └ div.contents                                  ← 第三槽(实测常态为空)
 *
 * placement 的真实差异(运行时实测,之前两种 placement 共用一套是错的):
 * - **thread/side-chat 不渲染 utility bar**(项目/运行位置/分支 pill 是 home 专属),
 *   side chat composer 实测与 thread 完全同构(data-composer-placement="thread")。
 * - `data-composer-utility-bar-variant` 只有 'home' | 'default' 两档,不是 placement 值。
 * - `data-composer-surface-overflow`:home='visible',thread='auto'。
 *
 * 提交按钮模型(Codex `HUs` + `submitButtonMode`):
 * - `running && !hasText` → **Stop**(aria-label "Stop",icon=Codex Gh 方块)
 * - `running && hasText` → **Steer**(aria-label "Steer",turn/steer 转向活动轮,不是 Stop)
 * - 空输入不是 disabled,是 **blocked('empty-message')**:cursor-interaction + opacity-50,
 *   仍可聚焦;disabled 只用于 submitting(spinner)与 readOnly。
 *
 * 输入区是 ProseMirror(见 RichTextInput.tsx),与 Codex 同构:
 * (`codex-RichTextInput` > `div.ProseMirror[contenteditable]` > `p.placeholder`)。
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
 * Codex 的技能显示名推导("chrome:control-chrome" → "Chrome: Control Chrome",
 * "code-to-spec" → "Code to Spec"):按 `:` 分段、按 `-` 分词、首词恒大写,
 * 其后小词(to/of/in/for/and/or/with 等)保持小写。interface.displayName 缺失时的回落。
 */
const TITLE_CASE_SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with'
])

function skillDisplayNameFallback(name: string): string {
  return name
    .split(':')
    .map((segment) =>
      segment
        .split('-')
        .filter(Boolean)
        .map((word, index) =>
          index > 0 && TITLE_CASE_SMALL_WORDS.has(word)
            ? word
            : word.charAt(0).toUpperCase() + word.slice(1)
        )
        .join(' ')
    )
    .join(': ')
}

/**
 * placement 决定工具条与表面的档位,Codex 用 data-composer-placement 表达
 * ('home' | 'thread')。原先那个 `inline` 布尔已删 —— 位置差异不再靠调用方
 * 换外层类名(首页曾是 absolute 定位),而是由 HomeView / ChatView 各自的
 * 流式容器决定,Composer 自己永远是 `min-w-0`(+ home 的 `w-full`)。
 */
export function Composer({
  placement = 'home'
}: { placement?: 'home' | 'thread' } = {}): React.JSX.Element {
  const { currentProject, selectProject } = useWorkspace()
  const { access, model, effort, followUpQueueMode, setFollowUpQueueMode } = useSession()
  const {
    activeChatId,
    phase,
    readOnly,
    sendMessage,
    startChat,
    closeChat,
    interrupt,
    steer,
    queuedFollowUps,
    queueInterrupted,
    enqueueFollowUp,
    deleteQueuedMessage,
    reorderQueuedMessages,
    sendQueuedMessageNow,
    editQueuedMessage,
    resumeInterruptedQueue
  } = useChatRuntime()
  const { rightPanelController, rightPanelOpen } = useAppShell()
  const [text, setText] = useState('')
  // 最新文档的协议输入(文本段 + skill/mention chip);onChange 时与 text 同步刷新
  const inputsRef = useRef<UserInput[]>([])
  const [hasContent, setHasContent] = useState(false)
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const projectPillRef = useRef<HTMLButtonElement>(null)
  const modelButtonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<RichTextInputHandle>(null)
  /* autocomplete(`/`、`@` 触发菜单)状态 */
  const [autocomplete, setAutocomplete] = useState<ComposerAutocompleteState | null>(null)
  const [menuItems, setMenuItems] = useState<ComposerMenuItem[]>([])
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const skillsCacheRef = useRef<{ cwd: string | null; skills: SkillMetadata[] } | null>(null)
  /* 加号菜单(与 slash/@ 共用 ComposerTopMenuShell 的内联菜单,不是 portal) */
  const [plusOpen, setPlusOpen] = useState(false)
  const [plusActiveId, setPlusActiveId] = useState<string | null>(null)
  const [plusFiles, setPlusFiles] = useState<ComposerMenuItem[]>([])

  /** 外部写文本(清空/回填)的统一入口:hasContent 一并重算 */
  const applyText = useCallback((next: string): void => {
    setText(next)
    setHasContent(next.trim().length > 0)
    inputsRef.current =
      next.trim().length > 0 ? [{ type: 'text', text: next, text_elements: [] }] : []
  }, [])

  const isHome = placement === 'home'

  const closePopover = (): void => setPopover(null)

  const togglePopover = useCallback((id: PopoverId, anchor: DOMRect): void => {
    setPopover((prev) => (prev?.id === id ? null : { id, anchor }))
  }, [])

  /** 加号菜单:与 slash/@ 同族的内联顶部菜单(焦点留在输入框,输入即查询) */
  const togglePlusMenu = (): void => {
    setPlusOpen((prev) => !prev)
    setPlusActiveId(null)
  }

  const running = phase === 'running'
  /**
   * Codex `submitButtonMode = running && !hasText ? 'stop' : 'submit'`:
   * 运行中且输入为空 → Stop;运行中有文字 → Steer(可继续转向,不是 Stop)。
   * hasContent 由文档序列化得出,mention chip 也算内容。
   */
  const submitButtonMode: 'stop' | 'submit' = running && !hasContent ? 'stop' : 'submit'
  /**
   * 空输入 = Codex 的 blocked('empty-message'):按钮不是 disabled,
   * 是 cursor-interaction + opacity-50(点击弹出原因提示 —— tooltip 未接)。
   */
  const submitBlocked = !running && !hasContent
  const submitDisabled = readOnly || submitting

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
    if (!hasContent || submitting) return
    const inputs = inputsRef.current
    const plainText = text.trim()
    /*
     * 运行中提交 = follow-up(Codex `followUpQueueMode`):
     * 'queue' → 排进队列,轮次结束自动发;'steer' → 立即转向活动轮。
     * 入队是纯本地动作,不进 submitting 流程。
     * (队列条目只存纯文本,mention 上下文未带入 —— 与 Codex 的 context 差异,已标记)
     */
    if (activeChatId && running && followUpQueueMode === 'queue') {
      enqueueFollowUp(plainText)
      applyText('')
      return
    }
    setSubmitting(true)
    // 先清空输入框：用户消息由服务端回显成条目，这里不做本地插入，
    // 否则会和回显的那条重复。
    applyText('')
    try {
      if (activeChatId) {
        if (running) await steer(inputs)
        else await sendMessage(inputs)
      } else {
        await startChat({ input: inputs, ...resolveRunLocation() })
      }
    } catch (err) {
      // 发送失败把文本还给用户，不然内容就丢了
      applyText(plainText)
      console.error('[composer] submit failed:', err)
    } finally {
      setSubmitting(false)
    }
  }

  /** Codex "Open in side chat":队列消息连同引用文本开成 side chat,并从队列移除 */
  const handleOpenInSideChat = (id: string): void => {
    const message = queuedFollowUps.find((m) => m.id === id)
    if (!message || !activeChatId) return
    deleteQueuedMessage(id)
    void openSideChat({
      controller: rightPanelController,
      sourceChatId: activeChatId,
      cwd: currentProject?.rootPaths[0] ?? null,
      panelOpen: rightPanelOpen,
      initialMessage: message.text
    }).catch((error: unknown) => {
      console.error('Failed to open side chat', error)
    })
  }

  /** Codex "Edit message":取回文本放进输入框 */
  const handleEditQueuedMessage = (id: string): void => {
    const value = editQueuedMessage(id)
    if (value != null) applyText(value)
  }

  /**
   * Codex `D_o`:点 composer 表面的非交互区域 = 聚焦 ProseMirror。
   * preventDefault 阻止原生焦点流转,否则浏览器会把焦点给被点的元素。
   */
  const handleSurfaceMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || e.defaultPrevented) return
    const target = e.target
    if (!(target instanceof Element)) return
    const root = e.currentTarget
    if (!root.contains(target)) return
    const pm = root.querySelector('.ProseMirror')
    if (pm == null || pm.contains(target)) return
    const interactive = target.closest(INTERACTIVE_ELEMENT_SELECTOR)
    if (interactive != null && root.contains(interactive)) return
    e.preventDefault()
    ;(pm as HTMLElement).focus()
  }

  /* ==================== autocomplete(`/`、`@` 触发菜单) ==================== */

  /**
   * 菜单项构建 —— Codex 的数据源形态:
   * - slash:内置命令(Compact 等)+ skills/list 的技能项
   * - at-mention:fuzzyFileSearch 的文件项(150ms debounce)
   */
  useEffect(() => {
    if (!autocomplete?.active) return
    let cancelled = false
    const applyItems = (items: ComposerMenuItem[]): void => {
      if (cancelled) return
      setMenuItems(items)
      setActiveItemId((prev) =>
        prev != null && items.some((i) => i.id === prev) ? prev : (items[0]?.id ?? null)
      )
    }
    if (autocomplete.kind === 'slash-command') {
      const query = autocomplete.query.toLowerCase()
      const items: ComposerMenuItem[] = []
      /*
       * 内置命令 —— Codex slash 菜单实测含 13 项内建命令
       * (Code review/Compact/Continue/Feedback/Goal/Init/MCP/New chat/Pet/
       * Plan mode/Reasoning/Side/Status)。这里只挂 WS 有真实行为支撑的四项,
       * 其余待各自流程接入(icons 已提取备用):
       */
      if (activeChatId) {
        const builtins: ComposerMenuItem[] = [
          {
            id: 'builtin:compact',
            title: 'Compact',
            description: "Compact this chat's context",
            icon: <CompactIcon className="shrink-0 icon-xs icon-2xs" />
          },
          {
            id: 'builtin:new-chat',
            title: 'New chat',
            description: 'Start a blank chat in the same workspace',
            icon: <CodexNewChatIcon className="icon-xs shrink-0" />
          },
          {
            id: 'builtin:reasoning',
            title: 'Reasoning',
            description: effort ?? undefined,
            icon: <ReasoningIcon className="icon-xs shrink-0" />
          },
          {
            id: 'builtin:side',
            title: 'Side',
            description: 'Start a temporary side chat',
            icon: <SideIcon className="icon-xs shrink-0" />
          }
        ]
        for (const item of builtins) {
          if (query.length === 0 || item.title.toLowerCase().includes(query)) items.push(item)
        }
      }
      const cwd = currentProject?.rootPaths[0] ?? null
      const cached = skillsCacheRef.current
      const finish = (skills: SkillMetadata[]): void => {
        for (const skill of skills) {
          /*
           * Codex 的 slash 项标题:优先 interface.displayName,缺失时按
           * 名字推导("chrome:control-chrome" → "Chrome: Control Chrome",
           * 分段按 : 切、词按 - 切、首字母大写)。过滤按原始名 + 显示名。
           */
          const displayName = skill.interface?.displayName ?? skillDisplayNameFallback(skill.name)
          if (
            query.length > 0 &&
            !skill.name.toLowerCase().includes(query) &&
            !displayName.toLowerCase().includes(query)
          )
            continue
          items.push({
            id: `skill:${skill.name}`,
            title: displayName,
            description:
              skill.interface?.shortDescription ?? skill.shortDescription ?? skill.description,
            icon: <SkillGenericIcon className="icon-xs shrink-0" />
          })
        }
        applyItems(items)
      }
      if (cached != null && cached.cwd === cwd) {
        finish(cached.skills)
      } else {
        listSkills(cwd ? [cwd] : [])
          .then((skills) => {
            skillsCacheRef.current = { cwd, skills }
            finish(skills)
          })
          .catch(() => {
            skillsCacheRef.current = { cwd, skills: [] }
            finish([])
          })
      }
      return () => {
        cancelled = true
      }
    }
    // at-mention:文件搜索(debounce)
    const roots = currentProject?.rootPaths ?? []
    const handle = window.setTimeout(() => {
      searchFiles(autocomplete.query, roots)
        .then((files) => {
          applyItems(
            files.slice(0, 20).map((file) => ({
              id: `file:${file.root}/${file.path}`,
              title: file.file_name,
              description: file.path,
              icon: <FileCodeIcon className="icon-xs shrink-0" />
            }))
          )
        })
        .catch(() => applyItems([]))
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [autocomplete, activeChatId, currentProject, effort])

  /** 选中菜单项:内置命令直接执行;技能/文件插入 mention chip */
  const selectMenuItem = useCallback(
    (id: string): void => {
      if (id === 'builtin:compact') {
        // 清掉 /query 文本并触发 compact(Codex 的内置命令路径)
        applyText('')
        if (activeChatId) {
          void rpc.request(M.chatCompact, { threadId: activeChatId }).catch((err: unknown) => {
            console.error('[composer] compact failed:', err)
          })
        }
        return
      }
      if (id === 'builtin:new-chat') {
        applyText('')
        closeChat()
        return
      }
      if (id === 'builtin:reasoning') {
        applyText('')
        const button = modelButtonRef.current
        if (button) togglePopover('model', button.getBoundingClientRect())
        return
      }
      if (id === 'builtin:side') {
        applyText('')
        if (activeChatId) {
          void openSideChat({
            controller: rightPanelController,
            sourceChatId: activeChatId,
            cwd: currentProject?.rootPaths[0] ?? null,
            panelOpen: rightPanelOpen
          }).catch((error: unknown) => {
            console.error('Failed to open side chat', error)
          })
        }
        return
      }
      if (id.startsWith('skill:')) {
        const name = id.slice('skill:'.length)
        const skill = skillsCacheRef.current?.skills.find((s) => s.name === name)
        if (skill != null) inputRef.current?.insertMention('skill', skill.name, skill.path)
        return
      }
      if (id.startsWith('file:')) {
        const item = menuItems.find((i) => i.id === id)
        if (item != null) {
          inputRef.current?.insertMention('file', item.title, id.slice('file:'.length))
        }
      }
    },
    [
      activeChatId,
      applyText,
      menuItems,
      closeChat,
      togglePopover,
      rightPanelController,
      rightPanelOpen,
      currentProject
    ]
  )

  /* ==================== 加号菜单(ComposerTopMenuShell 内联菜单) ==================== */

  /**
   * 分区数据 + 查询过滤 —— Codex:打开后焦点留在输入框,输入即过滤
   * (Add/Plugins 按标题过滤;Files 分区显示 fuzzyFileSearch 结果,
   * 空查询时是 "Type to search for files" 占位)。
   */
  const plusSections = useMemo<ComposerMenuSection[]>(() => {
    if (!plusOpen) return []
    const query = text.trim().toLowerCase()
    return buildPlusMenuSections().map((section) => {
      if (section.heading === 'Files') {
        return { ...section, items: query.length > 0 ? plusFiles : [] }
      }
      if (query.length === 0) return section
      return {
        ...section,
        items: section.items.filter((item) => item.title.toLowerCase().includes(query))
      }
    })
  }, [plusOpen, text, plusFiles])
  const plusFlatItems = useMemo(() => plusSections.flatMap((s) => s.items), [plusSections])

  // Files 分区:查询非空时 debounce 搜索
  useEffect(() => {
    if (!plusOpen) return
    const query = text.trim()
    const roots = currentProject?.rootPaths ?? []
    const handle = window.setTimeout(() => {
      if (query.length === 0) {
        setPlusFiles([])
        return
      }
      searchFiles(query, roots)
        .then((files) => {
          setPlusFiles(
            files.slice(0, 20).map((file) => ({
              id: `file:${file.root}/${file.path}`,
              title: file.file_name,
              description: file.path,
              icon: <FileCodeIcon className="icon-xs shrink-0" />
            }))
          )
        })
        .catch(() => setPlusFiles([]))
    }, 150)
    return () => window.clearTimeout(handle)
  }, [plusOpen, text, currentProject])

  /** 选中加号菜单项:Files 分区的文件插入 mention chip;其余动作随各自流程接入 */
  const selectPlusItem = useCallback(
    (id: string): void => {
      if (id.startsWith('file:')) {
        const item = plusFiles.find((i) => i.id === id)
        if (item != null) {
          setPlusOpen(false)
          // 清掉查询串再插 chip(clearDoc 同步执行,顺序保证)
          inputRef.current?.clearDoc()
          inputRef.current?.insertMention('file', item.title, id.slice('file:'.length))
        }
        return
      }
      // Files and folders / Goal / Plan mode / Record a skill / 插件动作:
      // 结构与 Codex 对齐,动作随各自流程接入(见 docs 标记)
      setPlusOpen(false)
    },
    [plusFiles]
  )

  const handleMenuEscape = useCallback((): void => {
    setPlusOpen(false)
  }, [])

  /** 菜单激活时的键盘导航(由 RichTextInput 的 autocomplete 插件转发) */
  const handleAutocompleteCommand = useCallback(
    (command: 'up' | 'down' | 'enter'): void => {
      // 加号菜单打开时,导航归加号菜单(Codex:焦点留在输入框,输入即查询)
      if (plusOpen) {
        if (plusFlatItems.length === 0) return
        if (command === 'enter') {
          selectPlusItem(plusActiveId ?? plusFlatItems[0].id)
          return
        }
        const index = plusFlatItems.findIndex((i) => i.id === plusActiveId)
        const delta = command === 'down' ? 1 : -1
        const next =
          index < 0
            ? delta > 0
              ? 0
              : plusFlatItems.length - 1
            : (index + delta + plusFlatItems.length) % plusFlatItems.length
        setPlusActiveId(plusFlatItems[next].id)
        return
      }
      if (menuItems.length === 0) return
      if (command === 'enter') {
        selectMenuItem(activeItemId ?? menuItems[0].id)
        return
      }
      const index = menuItems.findIndex((i) => i.id === activeItemId)
      const delta = command === 'down' ? 1 : -1
      const next =
        index < 0
          ? delta > 0
            ? 0
            : menuItems.length - 1
          : (index + delta + menuItems.length) % menuItems.length
      setActiveItemId(menuItems[next].id)
    },
    [menuItems, activeItemId, selectMenuItem, plusOpen, plusActiveId, plusFlatItems, selectPlusItem]
  )

  const handleDraftChange = useCallback((draft: ComposerDraft): void => {
    setText(draft.text)
    inputsRef.current = draft.inputs
    setHasContent(
      draft.inputs.some((input) => (input.type === 'text' ? input.text.trim().length > 0 : true))
    )
  }, [])

  /** autocomplete 状态更新 + 关闭时同步清菜单(不走 effect,避免级联渲染) */
  const handleAutocompleteChange = useCallback((state: ComposerAutocompleteState | null): void => {
    setAutocomplete(state)
    if (state == null) {
      setMenuItems([])
      setActiveItemId(null)
    }
  }, [])

  // Enter 提交 / Shift+Enter 换行归 RichTextInput 的 keymap
  // (ProseMirror 自己处理输入法组合态,不需要再判 isComposing)

  return (
    <div
      ref={wrapRef}
      data-codex-composer-root=""
      data-composer-placement={placement}
      className={cx('min-w-0', isHome && 'w-full')}
    >
      <div
        data-above-composer-portal="true"
        data-above-composer-conversation-id={activeChatId ?? undefined}
        className="relative px-[var(--home-composer-inline-inset)] empty:hidden electron:grid"
      />
      {/*
       * AboveComposerStack 槽位(Codex Aic):排队 follow-up 面板。
       * 外层 div 与 Codex 的 stack 壳同结构;仅在有排队内容时渲染
       * (空态靠 empty:hidden 不占位 —— 条件渲染与此等价)。
       */}
      {(queuedFollowUps.length > 0 || queueInterrupted) && (
        <div className="relative px-[var(--home-composer-inline-inset)] empty:hidden">
          <QueuedMessageList
            messages={queuedFollowUps}
            isInterrupted={queueInterrupted}
            isSendNowDisabled={submitting}
            isQueueingEnabled={followUpQueueMode === 'queue'}
            onEditMessage={handleEditQueuedMessage}
            onDeleteMessage={deleteQueuedMessage}
            onOpenInSideChatMessage={activeChatId ? handleOpenInSideChat : undefined}
            onSendNowMessage={(id) => void sendQueuedMessageNow(id)}
            onReorderMessages={reorderQueuedMessages}
            onQueueingChange={(enabled) => setFollowUpQueueMode(enabled ? 'queue' : 'steer')}
            onResumeInterruptedQueue={resumeInterruptedQueue}
          />
        </div>
      )}
      <div className="flex w-full flex-col gap-2 relative">
        {/*
         * 工具条 —— 仅 home(Codex:thread 的 showUtilityBar 为 false,
         * 运行时实测 thread/side-chat 均无此条)。-mb-2 咬进下面的输入框表面;
         * 进出走 framer-motion(opacity + translateY,Codex g_o)。
         */}
        {isHome && (
          <div
            aria-hidden={autocomplete?.active === true ? 'true' : 'false'}
            className={cx(
              'z-0 relative -mb-2',
              autocomplete?.active === true && 'pointer-events-none'
            )}
            style={UTILITY_BAR_SETTLED_STYLE}
          >
            <div className={autocomplete?.active === true ? 'opacity-0' : ''}>
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
                          currentProject
                            ? `Change project: ${currentProject.name}`
                            : 'Select project'
                        }
                        aria-haspopup="dialog"
                        aria-expanded={popover?.id === 'project'}
                        data-slot="popover-trigger"
                        data-state={popover?.id === 'project' ? 'open' : 'closed'}
                        data-composer-navigation-target="workspace-project"
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
                            <span
                              className="inline-flex shrink-0"
                              data-project-selector-icon="true"
                            >
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
                      aria-haspopup="menu"
                      aria-expanded={false}
                      data-state="closed"
                      data-composer-navigation-target="run-location"
                      className={`${COMPOSER_BUTTON_BASE} codex-ComposerFooterDropdown h-token-button-composer-sm px-1.5 py-0 text-sm leading-[18px] in-data-[composer-placement=home]:px-2 outline-hidden`}
                    >
                      <ComposerDropdownLabel
                        foreground="primary"
                        collapse="xs"
                        valueClassName="max-w-40"
                        icon={<LocalIcon className="icon-xs" />}
                        chevron={<ChevronIcon className="codex-ComposerDropdownLabelChevron" />}
                      >
                        <span className="in-data-[composer-placement=home]:hidden">
                          Work locally
                        </span>
                        <span className="hidden in-data-[composer-placement=home]:inline">
                          Local
                        </span>
                      </ComposerDropdownLabel>
                    </button>
                    {currentProject && (
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={false}
                        data-state="closed"
                        data-composer-navigation-target="branch"
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
        )}

        <div className="relative">
          {/* Codex `_ComposerTopMenuShell`:`/`、`@` 触发的菜单与加号菜单锚在表面上方(内联,非 portal) */}
          {autocomplete?.active === true && menuItems.length > 0 && (
            <ComposerTopMenuShell
              items={menuItems}
              activeId={activeItemId}
              onSelect={selectMenuItem}
              onHoverItem={setActiveItemId}
            />
          )}
          {plusOpen && (
            <>
              {/* 点击外侧关闭(portal 弹层的遮罩语义;内联菜单的轻量等价物) */}
              <div className="fixed inset-0 z-40" onMouseDown={() => setPlusOpen(false)} />
              <ComposerTopMenuShell
                sections={plusSections}
                activeId={plusActiveId}
                onSelect={selectPlusItem}
                onHoverItem={setPlusActiveId}
                marginBottom="mb-1"
              />
            </>
          )}
          <div
            className={cx('codex-ComposerLayoutRoot', isHome && 'gap-2')}
            data-composer-layout="multiline"
            data-composer-radius-variant="default"
            data-composer-surface-overflow={isHome ? 'visible' : 'auto'}
            data-composer-surface-variant="default"
            data-composer-utility-bar-variant={isHome ? 'home' : 'default'}
            onMouseDown={handleSurfaceMouseDown}
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
                  {/* 左下槽(FooterInlineControls gap=normal) */}
                  <div className="min-w-0 col-start-1 row-start-2">
                    <div className="flex min-w-0 items-center gap-[5px]">
                      <span className="contents" data-state={plusOpen ? 'open' : 'closed'}>
                        <button
                          type="button"
                          aria-label="Add files and more"
                          aria-expanded={plusOpen}
                          data-state={plusOpen ? 'open' : 'closed'}
                          data-composer-navigation-target="add-context"
                          onClick={togglePlusMenu}
                          className={`${COMPOSER_BUTTON_BASE} h-token-button-composer px-2 py-0 text-sm leading-[18px] aspect-square shrink-0 items-center justify-center !px-0`}
                        >
                          <PlusIcon className="icon-xs text-token-text-primary" />
                        </button>
                      </span>
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={popover?.id === 'access'}
                        data-state={popover?.id === 'access' ? 'open' : 'closed'}
                        data-composer-navigation-target="permissions"
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
                        ref={inputRef}
                        value={text}
                        onChange={handleDraftChange}
                        onSubmit={() => void submit()}
                        onAutocompleteChange={handleAutocompleteChange}
                        onAutocompleteCommand={handleAutocompleteCommand}
                        plusMenuOpen={plusOpen}
                        onMenuEscape={handleMenuEscape}
                        disabled={readOnly}
                        ariaLabel="Do anything"
                        placeholder={
                          readOnly ? 'Read-only — open in another client' : 'Do anything'
                        }
                      />
                    </div>
                  </div>

                  {/* 右下槽(FooterControls > [FooterExpandingControls, FooterActions]) */}
                  <div className="min-w-0 col-start-3 row-start-2">
                    <div className="flex min-w-0 items-center justify-end w-full">
                      <div className="flex min-w-0 flex-1 justify-end">
                        <div className="flex min-w-0 items-center gap-1">
                          <span>
                            {/* Codex 实测该 span 带 type="button"(radix Slot 合并的 trigger
                                props);span 在 TS 里没有 type 属性,走展开绕过 */}
                            <span
                              {...({ type: 'button' } as object)}
                              className="contents outline-hidden cursor-interaction"
                              data-state={popover?.id === 'model' ? 'open' : 'closed'}
                              aria-haspopup="menu"
                              aria-expanded={popover?.id === 'model'}
                            >
                              <button
                                type="button"
                                ref={modelButtonRef}
                                aria-haspopup="menu"
                                aria-expanded={popover?.id === 'model'}
                                data-state={popover?.id === 'model' ? 'open' : 'closed'}
                                data-codex-intelligence-trigger="true"
                                data-composer-navigation-target="reasoning"
                                data-selected-reasoning-effort={
                                  effort ? effortProtocolValue(effort) : undefined
                                }
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
                        {submitButtonMode === 'stop' ? (
                          <button
                            type="button"
                            aria-label="Stop"
                            disabled={readOnly}
                            onClick={() => void interrupt()}
                            className={cx(
                              'cursor-interaction size-token-button-composer flex items-center justify-center rounded-full transition-opacity focus-visible:outline-2 bg-token-foreground p-0.5 focus-visible:outline-token-button-background',
                              readOnly && 'cursor-default opacity-50'
                            )}
                          >
                            <StopIcon className="icon-xs text-token-dropdown-background" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label={
                              running ? (followUpQueueMode === 'queue' ? 'Queue' : 'Steer') : 'Send'
                            }
                            disabled={submitDisabled}
                            onClick={() => (submitBlocked ? undefined : void submit())}
                            className={cx(
                              'cursor-interaction size-token-button-composer flex items-center justify-center rounded-full transition-opacity focus-visible:outline-2 bg-token-foreground p-0.5 focus-visible:outline-token-button-background',
                              submitDisabled && 'cursor-default opacity-50',
                              !submitting && submitBlocked && 'opacity-50'
                            )}
                          >
                            {submitting ? (
                              <SubmitSpinner className="icon-xs text-token-dropdown-background" />
                            ) : (
                              <SendIcon className="icon-xs text-token-dropdown-background" />
                            )}
                          </button>
                        )}
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
      {popover?.id === 'access' && (
        <Popover
          anchor={popover.anchor}
          role="menu"
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
          role="menu"
          align="end"
          width={224}
          onClose={closePopover}
          ariaLabel="Select model"
        >
          <ModelPicker onClose={closePopover} />
        </Popover>
      )}
    </div>
  )
}

/**
 * 提交中的 spinner(Codex `H$` isLoading → `$m`)。
 * 注意:Codex 的 spinner 路径未逐像素确认,这里是同尺寸(icon-xs)圆弧近似。
 */
function SubmitSpinner({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cx('animate-spin', className)}
    >
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M17.5 10a7.5 7.5 0 0 0-7.5-7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
