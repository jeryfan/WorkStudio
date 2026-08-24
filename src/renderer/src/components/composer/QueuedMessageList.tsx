import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Tooltip } from '../tooltip/Tooltip'
import { Popover } from './popovers/Popover'
import {
  CloseIcon,
  DotsIcon,
  EditIcon,
  GripIcon,
  SendIcon,
  SideChatIcon,
  WarningTriangleIcon
} from '../icons'
import type { QueuedFollowUp } from '../../state/ChatRuntimeContext'

/**
 * 排队 follow-up 面板 —— Codex `queued-message-list` chunk(`Ce` = QueuedMessageList)
 * 的移植,渲染在 composer 上方的 AboveComposerStack 槽位。
 *
 * Codex 实测/源码结构:
 *
 *   div.vertical-scroll-fade-mask.hide-scrollbar flex max-h-[30dvh] flex-col gap-px
 *       overflow-x-hidden overflow-y-auto px-3 py-row-y
 *   ├ (isInterrupted)banner:"Queue paused because you interrupted" + ghost "Resume"
 *   └ DndContext(activationConstraint {distance:6}) > SortableContext(vertical)
 *     └ AnimatePresence(initial:false)
 *       └ motion.div[initial={height:0,opacity:0} animate={height:auto,opacity:1}
 *          exit 同 initial,transition 0.18s].overflow-visible   ← 每行
 *         ├ span.relative.-ms-3.flex.h-4.cursor-grab…ps-3.active:cursor-grabbing(grip)
 *         ├ div.flex.min-w-0.items-start.gap-1-5
 *         │   ├ (pausedReason)警告标(tooltip:发送失败的解释)
 *         │   └ span.line-clamp-1…text-token-text-secondary    ← 消息文本
 *         ├ button[aria-label="Steer"|"Retry"] > icon + 文字   ← Send now
 *         ├ button[aria-label="Delete queued message"]         ← 删除
 *         └ ⋯ 菜单:Edit message / Open in side chat / Turn on|off queueing
 *
 * 与 Codex 的已知偏差(均已标记,不影响结构与交互):
 * - 行内文本 Codex 走 markdown 渲染(带 cwd/hostId 链接解析),这里纯文本。
 * - "Edit message" Codex 是面板行内编辑;这里取回文本放进 composer 输入框
 *   (Codex CLI 的语义;桌面端行内编辑 UI 未能从源码确认)。
 * - 行容器/fe 的基础类未从源码确认(导出名在 bundle 中被压扁),行内叶子类全部照抄。
 */
export function QueuedMessageList({
  messages,
  isInterrupted,
  isSendNowDisabled,
  isQueueingEnabled,
  onEditMessage,
  onDeleteMessage,
  onOpenInSideChatMessage,
  onSendNowMessage,
  onReorderMessages,
  onQueueingChange,
  onResumeInterruptedQueue
}: {
  messages: QueuedFollowUp[]
  isInterrupted: boolean
  isSendNowDisabled: boolean
  isQueueingEnabled: boolean
  onEditMessage(id: string): void
  onDeleteMessage(id: string): void
  onOpenInSideChatMessage?(id: string): void
  onSendNowMessage(id: string): void
  onReorderMessages(activeId: string, overId: string): void
  onQueueingChange(enabled: boolean): void
  onResumeInterruptedQueue(): void
}): React.JSX.Element | null {
  const ids = messages.map((m) => m.id)
  // Codex:PointerSensor,activationConstraint {distance: 6}
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const handleDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId !== overId) onReorderMessages(activeId, overId)
  }

  if (messages.length === 0) return null

  return (
    <div className="vertical-scroll-fade-mask hide-scrollbar flex max-h-[30dvh] flex-col gap-px overflow-x-hidden overflow-y-auto px-3 py-row-y">
      {isInterrupted && (
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm text-token-foreground">
            Queue paused because you interrupted
          </span>
          <button
            type="button"
            onClick={onResumeInterruptedQueue}
            className="cursor-interaction shrink-0 rounded-full px-2 py-0.5 text-sm text-token-text-tertiary hover:bg-token-list-hover-background"
          >
            Resume
          </button>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <QueuedMessageRow
                key={message.id}
                message={message}
                isSendNowDisabled={isSendNowDisabled}
                isQueueingEnabled={isQueueingEnabled}
                onEditMessage={onEditMessage}
                onDeleteMessage={onDeleteMessage}
                onOpenInSideChatMessage={onOpenInSideChatMessage}
                onSendNowMessage={onSendNowMessage}
                onQueueingChange={onQueueingChange}
              />
            ))}
          </AnimatePresence>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function QueuedMessageRow({
  message,
  isSendNowDisabled,
  isQueueingEnabled,
  onEditMessage,
  onDeleteMessage,
  onOpenInSideChatMessage,
  onSendNowMessage,
  onQueueingChange
}: {
  message: QueuedFollowUp
  isSendNowDisabled: boolean
  isQueueingEnabled: boolean
  onEditMessage(id: string): void
  onDeleteMessage(id: string): void
  onOpenInSideChatMessage?(id: string): void
  onSendNowMessage(id: string): void
  onQueueingChange(enabled: boolean): void
}): React.JSX.Element {
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null)
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: message.id })

  const paused = message.pausedReason != null
  const sendNowLabel = paused ? 'Retry' : 'Steer'

  return (
    <motion.div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="overflow-visible"
    >
      <div className={`group flex items-center gap-1.5 ${isDragging ? 'opacity-60' : ''}`}>
        {/* grip(Codex:attributes/listeners 都在这个 span 上) */}
        <span
          ref={setActivatorNodeRef}
          className="relative -ms-3 flex h-4 cursor-grab items-center justify-center ps-3 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripIcon
            aria-hidden
            className="icon-2xs pointer-events-none absolute start-0 top-1/2 -translate-y-1/2 text-token-input-placeholder-foreground/70 transition-opacity"
          />
        </span>
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          {paused && (
            <Tooltip
              side="top"
              tooltipContent={
                <div className="space-y-1 text-center">
                  <p>This queued message could not be sent</p>
                  <p className="text-token-description-foreground">
                    Retry, edit, or delete it to continue the queue
                  </p>
                </div>
              }
            >
              <span className="mt-0.5 inline-flex shrink-0">
                <WarningTriangleIcon className="icon-2xs text-token-editor-warning-foreground" />
              </span>
            </Tooltip>
          )}
          <span className="line-clamp-1 max-h-lh min-w-0 self-center leading-4 text-token-text-secondary">
            {message.text}
          </span>
        </div>
        <Tooltip
          side="top"
          tooltipContent={
            paused ? (
              <div className="space-y-1 text-center">
                <p>Try sending this queued message again</p>
                <p className="text-token-description-foreground">
                  Edit or delete it if retry keeps failing
                </p>
              </div>
            ) : (
              'Submit without interrupting the model'
            )
          }
        >
          <button
            type="button"
            data-markdown-copy="exclude"
            aria-label={sendNowLabel}
            disabled={isSendNowDisabled}
            onClick={(e) => {
              e.stopPropagation()
              onSendNowMessage(message.id)
            }}
            className="flex cursor-interaction items-center gap-1 rounded-full px-2 py-0.5 text-sm text-token-text-tertiary hover:bg-token-list-hover-background disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendIcon className="icon-2xs shrink-0" />
            {sendNowLabel}
          </button>
        </Tooltip>
        <button
          type="button"
          aria-label="Delete queued message"
          onClick={(e) => {
            e.stopPropagation()
            onDeleteMessage(message.id)
          }}
          className="flex cursor-interaction items-center justify-center rounded-full p-0.5 text-token-text-tertiary hover:bg-token-list-hover-background [&>svg]:icon-2xs"
        >
          <CloseIcon />
        </button>
        <button
          type="button"
          aria-label="Queued message actions"
          onClick={(e) => setMenuAnchor(e.currentTarget.getBoundingClientRect())}
          className="flex cursor-interaction items-center justify-center rounded-full p-0.5 text-token-text-tertiary hover:bg-token-list-hover-background [&>svg]:icon-2xs"
        >
          <DotsIcon />
        </button>
        {menuAnchor && (
          <Popover
            anchor={menuAnchor}
            align="end"
            width={220}
            onClose={() => setMenuAnchor(null)}
            ariaLabel="Queued message actions"
          >
            <div className="no-drag z-50 m-px flex w-full select-none flex-col overflow-y-auto px-1 py-1 text-token-foreground">
              <QueuedMenuItem
                icon={<EditIcon className="icon-xs shrink-0 opacity-75" />}
                label="Edit message"
                onSelect={() => {
                  setMenuAnchor(null)
                  onEditMessage(message.id)
                }}
              />
              {onOpenInSideChatMessage && (
                <QueuedMenuItem
                  icon={<SideChatIcon className="icon-xs shrink-0 opacity-75" />}
                  label="Open in side chat"
                  onSelect={() => {
                    setMenuAnchor(null)
                    onOpenInSideChatMessage(message.id)
                  }}
                />
              )}
              <QueuedMenuItem
                icon={<GripIcon className="icon-xs shrink-0 opacity-75" />}
                label={isQueueingEnabled ? 'Turn off queueing' : 'Turn on queueing'}
                onSelect={() => {
                  setMenuAnchor(null)
                  onQueueingChange(!isQueueingEnabled)
                }}
              />
            </div>
          </Popover>
        )}
      </div>
    </motion.div>
  )
}

function QueuedMenuItem({
  icon,
  label,
  onSelect
}: {
  icon: React.ReactNode
  label: string
  onSelect(): void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-description-foreground hover:bg-token-list-hover-background focus:bg-token-list-hover-background cursor-interaction"
    >
      <div className="flex w-full items-center gap-1.5">
        {icon}
        <span className="flex-1 min-w-0 truncate text-start">{label}</span>
      </div>
    </button>
  )
}
