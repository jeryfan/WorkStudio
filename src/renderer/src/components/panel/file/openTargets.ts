import { useEffect, useState } from 'react'

/**
 * Open in 目标(已安装编辑器)—— Codex 宿主 openIn 能力的 WS 版。
 *
 * Codex:宿主按 cwd/path 探测可用目标,`UXi` 拆出 primaryTarget(持久化的
 * 首选,没有则列表第一个)与 visibleTargets;选择带 persistPreferred 的会记住。
 * WS:主进程静态探测(/Applications + ~/Applications),preferred 存 localStorage。
 */

export interface OpenTarget {
  target: string
  label: string
  appPath: string
  iconFile: string
  kind: 'editor'
}

const PREFERRED_TARGET_KEY = 'file-source:preferred-open-target'

/** assets/apps 图标 url 表(Vite glob,文件名即 Codex 的 /apps/<name>.png) */
const APP_ICON_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../../assets/apps/*.{png,svg}', {
      eager: true,
      query: '?url',
      import: 'default'
    })
  ).map(([path, url]) => [path.split('/').pop() ?? '', url as string])
)

export function appIconUrl(iconFile: string): string | undefined {
  return APP_ICON_URLS[iconFile]
}

let cachedTargets: OpenTarget[] | null = null
let inflight: Promise<OpenTarget[]> | null = null

function fetchTargets(): Promise<OpenTarget[]> {
  if (cachedTargets) return Promise.resolve(cachedTargets)
  inflight ??= window.codexBridge.openIn
    .listTargets()
    .then((list) => {
      cachedTargets = list
      return list
    })
    .catch(() => [])
  return inflight
}

export function readPreferredTarget(): string | null {
  try {
    return localStorage.getItem(PREFERRED_TARGET_KEY)
  } catch {
    return null
  }
}

export function persistPreferredTarget(target: string): void {
  try {
    localStorage.setItem(PREFERRED_TARGET_KEY, target)
  } catch {
    /* 静默 */
  }
}

/** Codex `PXi`:preferred 命中则用它,否则第一个可见目标 */
export function resolvePrimaryTarget(targets: OpenTarget[]): OpenTarget | null {
  if (targets.length === 0) return null
  const preferred = readPreferredTarget()
  return (preferred != null && targets.find((t) => t.target === preferred)) || targets[0]
}

export function useOpenTargets(): {
  targets: OpenTarget[]
  primaryTarget: OpenTarget | null
  isLoading: boolean
} {
  const [targets, setTargets] = useState<OpenTarget[]>(cachedTargets ?? [])
  const [isLoading, setIsLoading] = useState(cachedTargets == null)
  useEffect(() => {
    let cancelled = false
    void fetchTargets().then((list) => {
      if (!cancelled) {
        setTargets(list)
        setIsLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])
  return { targets, primaryTarget: resolvePrimaryTarget(targets), isLoading }
}

/** 打开文件到目标(路径必须是绝对路径,主进程不做相对解析) */
export function openInTarget(
  target: OpenTarget | { target: 'fileManager' | 'systemDefault' },
  absolutePath: string,
  opts?: { line?: number; column?: number; persistPreferred?: boolean }
): void {
  if ('appPath' in target && opts?.persistPreferred !== false) {
    persistPreferredTarget(target.target)
  }
  void window.codexBridge.openIn.open({
    path: absolutePath,
    target: target.target,
    appPath: 'appPath' in target ? target.appPath : undefined,
    line: opts?.line,
    column: opts?.column
  })
}
