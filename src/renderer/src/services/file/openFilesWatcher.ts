import { rpc } from '../../rpc/client'
import { M } from '@shared/protocol/methods'
import { LOCAL_HOST_ID, type HostId } from '@shared/host/messages'
import type { FsChangedNotification } from '@shared/protocol/generated/v2/FsChangedNotification'
import { isAbsolutePath, joinPath } from '../../utils/workspacePath'

/**
 * 打开中的文件监视器 —— Codex `jPn`(app-initial:4734xxx,MPn 那个 class)的移植。
 *
 * 这条链在 Codex 里是这样的(**全在渲染层**,不经 Electron 主进程):
 *
 *   文件 tab 开/关 → `v$i(scope, {excludeTab})`
 *     → 消息 `set-open-review-file-source-tabs {conversationId, openFiles}`
 *     → manager `setOpenReviewFileSourceTabs()` → `sync()`
 *     → 对每个 (hostId, 绝对路径) 起一个 `fs/watch {path, watchId: open-file-<uuid>}`
 *   app-server 推 `fs/changed {watchId, changedPaths}`
 *     → `getFileChangeMessages(watchId)` 产出
 *       `refetch-review-file-source`(refreshMode auto)/ `review-file-source-changed`(manual)
 *       + `open-file-changed`(文本编辑器 tab 用)
 *     → 查看器重新读文件(`h$i` 重取 read-file 查询)
 *
 * 之前 WS 缺的是**整条链**,不是某个 IPC 通道:文件 tab 只在挂载/换路径时读一次,
 * 磁盘上的改动不会回到界面。协议侧本来就有 `fs/watch`/`fs/unwatch`/`fs/changed`
 * (2026-08-25 在运行中的应用里实测:watch → 追加内容 → 收到
 * `{watchId, changedPaths:['/tmp/…']}`),缺的只是渲染层这一层注册与分发。
 *
 * 未移植的两支(WS 没有对应物,不做假实现):
 * - `openFiles`(Codex 的 `text-editor:` 可编辑 tab)与 `mcpResources`:WS 没有这两种 tab;
 * - `ignoreFileChangeEvents` / `ignoreChangesUntilMs`(5s 窗口,Codex `APn`):
 *   它防的是"自己写盘引发的自我刷新",WS 的查看器只读,没有写入方。
 */

/** Codex 的 reviewFiles 元素(`u$i` 的返回):artifact 类型才是 manual,其余 auto */
export interface ReviewFileSource {
  hostId: HostId
  path: string
  refreshMode: 'auto' | 'manual'
}

interface WatchTarget {
  hostId: HostId
  path: string
  reviewFiles: ReviewFileSource[]
}

interface Watch {
  watchId: string
  target: WatchTarget
  isStarted: boolean
  shouldUnwatchOnStart: boolean
}

/** Codex `kPn(hostId, path)` */
function watchKey(hostId: HostId, path: string): string {
  return `${hostId}\0${path}`
}

export type FileChangeListener = (event: { hostId: HostId; path: string }) => void

class OpenFilesWatcher {
  private readonly reviewFilesByConversationId = new Map<string, ReviewFileSource[]>()
  private readonly watchesByKey = new Map<string, Watch>()
  private readonly watchesByWatchId = new Map<string, Watch>()
  private readonly listeners = new Set<FileChangeListener>()
  private subscribed = false
  /** conversationId → cwd,`getWatchPath` 用它把相对路径解析成绝对路径(Codex 同) */
  private cwdByConversationId = new Map<string, string | null>()

  /** Codex `setOpenReviewFileSourceTabs(conversationId, openFiles)` */
  setOpenReviewFileSourceTabs(
    conversationId: string,
    cwd: string | null,
    reviewFiles: ReviewFileSource[]
  ): void {
    this.cwdByConversationId.set(conversationId, cwd)
    // Codex `setOpenFilesBySource`:全空就把这条会话删掉,再 sync
    if (reviewFiles.length === 0) this.reviewFilesByConversationId.delete(conversationId)
    else this.reviewFilesByConversationId.set(conversationId, reviewFiles)
    this.sync()
  }

  /** Codex `removeConversation` */
  removeConversation(conversationId: string): void {
    this.reviewFilesByConversationId.delete(conversationId)
    this.cwdByConversationId.delete(conversationId)
    this.sync()
  }

  /** 文件内容变化的订阅(Codex 侧是 `_m('refetch-review-file-source' | …)` 消息) */
  subscribe(listener: FileChangeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Codex `getWatchPath`:`Qp(getConversationCwd(id) ?? '', path)`,非绝对路径丢弃 */
  private watchPath(conversationId: string, path: string): string | null {
    const resolved = joinPath(this.cwdByConversationId.get(conversationId) ?? '', path)
    return isAbsolutePath(resolved) ? resolved : null
  }

  /** Codex `sync()`:算出目标集合 → 停掉多余的 watch → 起缺的 watch */
  private sync(): void {
    const desired = new Map<string, WatchTarget>()
    for (const [conversationId, reviewFiles] of this.reviewFilesByConversationId) {
      for (const file of reviewFiles) {
        const path = this.watchPath(conversationId, file.path)
        if (path == null) continue
        const key = watchKey(file.hostId, path)
        const target = desired.get(key) ?? { hostId: file.hostId, path, reviewFiles: [] }
        target.reviewFiles.push(file)
        desired.set(key, target)
      }
    }

    for (const [key, watch] of [...this.watchesByKey]) {
      const target = desired.get(key)
      if (target == null) this.stopWatch(key, watch)
      else watch.target = target
    }
    for (const [key, target] of desired) {
      if (!this.watchesByKey.has(key)) this.startWatch(key, target)
    }
  }

  private startWatch(key: string, target: WatchTarget): void {
    this.ensureSubscribed()
    const watch: Watch = {
      // Codex 的 watchId 形态:`open-file-${uuid}`
      watchId: `open-file-${crypto.randomUUID()}`,
      target,
      isStarted: false,
      shouldUnwatchOnStart: false
    }
    this.watchesByKey.set(key, watch)
    this.watchesByWatchId.set(watch.watchId, watch)
    void rpc
      .request(M.fsWatch, { watchId: watch.watchId, path: target.path })
      .then(() => {
        watch.isStarted = true
        // 起 watch 期间已经被要求停掉(tab 关得比响应快)
        if (watch.shouldUnwatchOnStart) this.sendStopWatch(watch.watchId)
      })
      .catch((error: unknown) => {
        if (this.watchesByKey.get(key) !== watch) return
        this.watchesByKey.delete(key)
        this.watchesByWatchId.delete(watch.watchId)
        console.warn('Failed to watch open file', target.path, error)
      })
  }

  private stopWatch(key: string, watch: Watch): void {
    this.watchesByKey.delete(key)
    this.watchesByWatchId.delete(watch.watchId)
    if (!watch.isStarted) {
      watch.shouldUnwatchOnStart = true
      return
    }
    this.sendStopWatch(watch.watchId)
  }

  private sendStopWatch(watchId: string): void {
    void rpc.request(M.fsUnwatch, { watchId }).catch((error: unknown) => {
      console.warn('Failed to unwatch open file', watchId, error)
    })
  }

  private ensureSubscribed(): void {
    if (this.subscribed) return
    this.subscribed = true
    rpc.on(M_FS_CHANGED, (params) => {
      const { watchId } = params as FsChangedNotification
      // Codex `getFileChangeMessages(watchId)`:按 watch 上挂的文件产出事件
      const watch = this.watchesByWatchId.get(watchId)
      if (watch == null) return
      for (const file of watch.target.reviewFiles) {
        for (const listener of this.listeners) {
          listener({ hostId: file.hostId, path: file.path })
        }
      }
    })
  }
}

/** 通知方法名(协议侧 `fs/changed`;methods.ts 只收方法,通知名在 notifications 侧) */
const M_FS_CHANGED = 'fs/changed'

export const openFilesWatcher = new OpenFilesWatcher()

/** Codex `u$i`:tab → review file source(WS 的文件 tab 都是 auto 刷新) */
export function reviewFileSourceOf(path: string): ReviewFileSource {
  return { hostId: LOCAL_HOST_ID, path, refreshMode: 'auto' }
}
