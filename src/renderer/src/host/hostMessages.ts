import { useEffect } from 'react'
import { isChunkedMessage, JsonTokenAssembler } from '@shared/host/chunked'
import type {
  HostMessage,
  HostMessageOf,
  HostMessageType,
  ViewMessage
} from '@shared/host/messages'

/**
 * 宿主消息的收发。
 *
 * 取证：Codex 渲染层有一个统一的 `postMessage` 出口（宿主在时走
 * `electronBridge.sendMessageFromView`，同时派发一个 `codex-message-from-view`
 * 自定义事件给非 Electron 宿主用），入口则是 `window.addEventListener('message')`
 * —— preload 把主进程的消息重新派发成 window 的 message 事件，所以渲染层的
 * 这段代码在 Electron / web 两种宿主下是同一份。
 *
 * 分块消息在这一层重组：preload 只透传并提供 ACK 通道，重组成本落在渲染进程
 * 自己的时间片里，一片一片来，不会一次性卡住主线程。
 */

type Handler = (message: HostMessage) => void

const handlersByType = new Map<string, Set<Handler>>()
const assemblers = new Map<string, JsonTokenAssembler>()
let started = false

function dispatch(message: HostMessage): void {
  const handlers = handlersByType.get(message.type)
  if (handlers == null) return
  for (const handler of Array.from(handlers)) handler(message)
}

function onWindowMessage(event: MessageEvent): void {
  const payload = event.data as unknown
  if (payload == null || typeof payload !== 'object') return

  if (isChunkedMessage(payload)) {
    const { transferId, sequence, kind, tokens } = payload
    if (kind === 'start') {
      assemblers.set(transferId, new JsonTokenAssembler())
    } else if (kind === 'chunk') {
      assemblers.get(transferId)?.push(tokens ?? [])
    } else {
      const assembler = assemblers.get(transferId)
      assemblers.delete(transferId)
      if (assembler != null && assembler.complete) dispatch(assembler.result() as HostMessage)
    }
    // ACK 必须在处理完这一片之后发：它的语义是"我消费完了，可以给下一片"
    window.electronBridge?.acknowledgeChunkedMessage(transferId, sequence)
    return
  }

  const message = payload as HostMessage
  if (typeof message.type !== 'string') return
  dispatch(message)
}

function ensureStarted(): void {
  if (started) return
  started = true
  window.addEventListener('message', onWindowMessage)
}

/** 渲染层 → 宿主（Codex 的 `postMessage` 出口） */
export function postMessageFromView(message: ViewMessage): void {
  const bridge = window.electronBridge
  if (bridge?.sendMessageFromView != null) {
    void bridge.sendMessageFromView(message).catch((error: unknown) => {
      if (message.type !== 'log-message') {
        console.warn('[host] failed to send message from view', message.type, error)
      }
    })
  }
  // 非 Electron 宿主（预览页 / iframe）用这个事件接同一套消息
  window.dispatchEvent(new CustomEvent('codex-message-from-view', { detail: message }))
}

/** 订阅某一类宿主消息 */
export function subscribeHostMessage<T extends HostMessageType>(
  type: T,
  handler: (message: HostMessageOf<T>) => void
): () => void {
  ensureStarted()
  const handlers = handlersByType.get(type) ?? new Set<Handler>()
  handlersByType.set(type, handlers)
  const wrapped: Handler = (message) => handler(message as HostMessageOf<T>)
  handlers.add(wrapped)
  return () => {
    handlers.delete(wrapped)
    if (handlers.size === 0) handlersByType.delete(type)
  }
}

/** Codex `_m(type, handler, deps)` 的同构：hook 形式的订阅 */
export function useHostMessage<T extends HostMessageType>(
  type: T,
  handler: (message: HostMessageOf<T>) => void,
  deps: readonly unknown[] = []
): void {
  useEffect(
    () => subscribeHostMessage(type, handler),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 与 Codex 一致：由调用方声明依赖
    [type, ...deps]
  )
}

/** 首帧就绪：宿主据此冲刷排队的事件（Codex 的 `ready`） */
export function notifyViewReady(): void {
  ensureStarted()
  postMessageFromView({ type: 'ready' })
}
