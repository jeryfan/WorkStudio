import { useEffect, useState } from 'react'
import { fileService } from '../../../services'

/**
 * 目录条目聚合 —— Codex `a0a`(app-initial:385020)的移植:
 * root 的条目 + 每个 expandedPath 的条目,合成**扁平路径集合**
 * (目录以 `/` 结尾 —— `r0a`),交给 @pierre/trees 建树。
 *
 * Codex 每目录一个 react-query 查询(staleTime 5s,placeholderData 保留旧值);
 * WS 用模块级缓存 + 订阅,等价语义(5 秒内重复展开不重新请求)。
 */

/** 目录条目缓存值;staleTime 5s(Codex `pm.FIVE_SECONDS`) */
interface DirCacheEntry {
  /** 目录直属条目路径(目录带 `/` 后缀) */
  paths: string[]
  fetchedAt: number
  error: Error | null
}

const STALE_MS = 5000
const cache = new Map<string, DirCacheEntry>()
const inflight = new Map<string, Promise<void>>()
const listeners = new Set<() => void>()

/*
 * 聚合结果按内容缓存(Codex 的 react-query structural sharing 同效):
 * 返回的 paths 数组引用在内容不变时保持稳定 —— FileTreeView 的若干 effect
 * 以它为依赖,引用稳定才不会反复跑(进而反复驱动模型重选)。
 */
const aggregateCache = new Map<string, string[]>()

function notify(): void {
  listeners.forEach((l) => l())
}

function cacheKey(projectId: string, dir: string): string {
  return `${projectId}|${dir}`
}

/** 拉一个目录(带 stale 去重);数据落地后通知订阅方 */
function fetchDir(projectId: string, dir: string): void {
  const k = cacheKey(projectId, dir)
  const existing = cache.get(k)
  if (existing && Date.now() - existing.fetchedAt < STALE_MS) return
  if (inflight.has(k)) return
  inflight.set(
    k,
    fileService
      .listDir(projectId, dir)
      .then((entries) => {
        cache.set(k, {
          // Codex `r0a`:目录以 `/` 结尾
          paths: entries.map((e) => (e.kind === 'dir' ? `${e.relPath}/` : e.relPath)),
          fetchedAt: Date.now(),
          error: null
        })
      })
      .catch((error: unknown) => {
        cache.set(k, {
          paths: existing?.paths ?? [],
          fetchedAt: Date.now(),
          error: error instanceof Error ? error : new Error(String(error))
        })
      })
      .finally(() => {
        inflight.delete(k)
        notify()
      })
  )
}

export interface DirectoryEntriesResult {
  /** 聚合后的扁平路径列表(目录带 `/` 后缀),按 root → 各展开目录顺序 */
  paths: string[]
  isLoading: boolean
  isEmpty: boolean
  error: Error | null
}

/**
 * Codex `Po(a0a, {directoryPath, expandedPaths, …})`:
 * 读 baseDir(默认 root)+ expandedPaths 的聚合文件列表;缺失的目录自动触发拉取。
 * baseDir 是面包屑下拉的根(Codex 的 directoryPath 参数)。
 */
export function useDirectoryEntries(
  projectId: string,
  expandedPaths: readonly string[],
  baseDir = ''
): DirectoryEntriesResult {
  const [, forceRender] = useState(0)

  useEffect(() => {
    const l = (): void => forceRender((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  const dirs = [baseDir, ...expandedPaths] // Codex `Ufo`:null(root) + 非空展开目录
  let error: Error | null = null
  let isLoading = false
  const seen = new Set<string>()
  const next: string[] = []

  for (const dir of dirs) {
    const entry = cache.get(cacheKey(projectId, dir))
    if (entry == null) {
      fetchDir(projectId, dir)
      if (dir === baseDir) isLoading = true
      continue
    }
    if (entry.error && dir === baseDir) error = entry.error
    for (const p of entry.paths) {
      if (!seen.has(p)) {
        seen.add(p)
        next.push(p)
      }
    }
  }

  // 内容一致时复用旧数组引用(structural sharing)
  const aggKey = `${projectId}|${baseDir}|${dirs.join(',')}`
  const prevPaths = aggregateCache.get(aggKey)
  const paths =
    prevPaths != null &&
    prevPaths.length === next.length &&
    prevPaths.every((p, i) => p === next[i])
      ? prevPaths
      : (aggregateCache.set(aggKey, next), next)

  const rootEntry = cache.get(cacheKey(projectId, baseDir))
  return {
    paths,
    isLoading: isLoading && rootEntry == null,
    isEmpty: rootEntry != null && rootEntry.paths.length === 0,
    error
  }
}

/** 项目切换/文件变更后的手动失效( Codex 侧由 host 推送失效;WS 先提供手动入口) */
export function invalidateDirectoryCache(projectId?: string): void {
  if (projectId == null) cache.clear()
  else {
    for (const k of [...cache.keys()]) {
      if (k.startsWith(`${projectId}|`)) cache.delete(k)
    }
  }
  notify()
}
