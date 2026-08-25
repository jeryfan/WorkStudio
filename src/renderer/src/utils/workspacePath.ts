/**
 * 路径工具 —— Codex `bd()` 那组路径原语的移植(名字对应见各函数注释)。
 *
 * 文件 tab 的 `path` 是**绝对路径**(Codex `HY`:tabId = `file:local:<绝对路径>`,
 * 8214 实测 DOM 就是 `file:local:/Users/…/.gitignore`),而文件树与面包屑下拉在
 * **root 相对**空间里工作(实测 Codex 树的 `data-item-path` 是 `src/`、
 * `build/builtin/package.json`)。两个空间的换算就靠 `relativeToRoot`
 * (Codex `qQi`)与 `joinPath`(Codex `Qp`)。
 */

/** Codex `Xp`:统一分隔符(Windows 的 `\\?\` 前缀形态本项目不处理) */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

/** Codex `tm` = `Su`:是不是绝对路径(POSIX 根 / Windows 盘符 / UNC) */
export function isAbsolutePath(path: string): boolean {
  return (
    (path.startsWith('/') && !path.startsWith('//')) ||
    /^[a-zA-Z]:[\\/]/.test(path) ||
    /^[\\/]{2}/.test(path)
  )
}

/** Codex `Zp`:去掉尾部斜杠后的最后一段 */
export function baseName(path: string): string {
  const trimmed = normalizePath(path).replace(/\/+$/, '')
  return trimmed.split('/').at(-1) ?? trimmed
}

/** Codex `D3e`:workspace root 的显示名(根目录名;`/` 与空串没有标签) */
export function workspaceRootLabel(root: string): string {
  const trimmed = normalizePath(root).replace(/\/+$/, '')
  if (trimmed === '' || trimmed === '/') return ''
  const segments = trimmed.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? trimmed
}

/** Codex `Qp`/`$p`:相对路径挂到 root 上得到绝对路径(已是绝对路径就原样返回) */
export function joinPath(root: string, path: string): string {
  const normalizedPath = normalizePath(path)
  const normalizedRoot = normalizePath(root)
  if (isAbsolutePath(normalizedPath) || normalizedRoot === '') return normalizedPath
  if (normalizedPath === '') return normalizedRoot
  return `${normalizedRoot.replace(/\/+$/, '')}/${normalizedPath.replace(/^\/+/, '')}`
}

/**
 * Codex `qQi({filePath, root})`:root 内的相对路径,不在 root 里返回 null。
 * 相对路径入参直接原样返回(Codex 同);前缀比较**忽略大小写**(Codex 用 `Yp`)。
 */
export function relativeToRoot(filePath: string, root: string): string | null {
  const path = normalizePath(filePath).replace(/\/+$/, '')
  if (path.length === 0) return null
  if (!isAbsolutePath(path)) return path
  const normalizedRoot = normalizePath(root).replace(/\/+$/, '')
  const lowerPath = path.toLowerCase()
  const lowerRoot = normalizedRoot.toLowerCase()
  if (lowerRoot.length === 0 || !lowerPath.startsWith(`${lowerRoot}/`)) return null
  return path.slice(normalizedRoot.length + 1)
}

/**
 * Codex `nb(path, base)`:相对化。base 是前缀就截掉;否则退一步 ——
 * 在 path 里找 base 的最后一段并从它之后截断;都不成立返回原路径。
 */
export function relativeFrom(path: string, base: string | null | undefined): string {
  if (!base) return path
  const normalizedBase = normalizePath(base)
  const normalizedPath = normalizePath(path)
  const trimmedBase = normalizedBase.endsWith('/') ? normalizedBase.slice(0, -1) : normalizedBase
  if (normalizedPath.startsWith(`${trimmedBase}/`)) {
    return normalizedPath.slice(trimmedBase.length + 1)
  }
  const lastSegment = `${trimmedBase.split('/').at(-1) ?? trimmedBase}/`
  const index = normalizedPath.indexOf(lastSegment)
  return index !== -1 && (index === 0 || normalizedPath[index - 1] === '/')
    ? normalizedPath.slice(index + lastSegment.length)
    : normalizedPath
}

/** Codex `T3e`:显示路径 = root 标签 + '/' + 相对路径 */
export function displayPathFor({
  root,
  relativePath,
  includeWorkspaceRootLabel
}: {
  root: string
  relativePath: string
  includeWorkspaceRootLabel: boolean
}): string {
  const rel = normalizePath(relativePath)
  if (!includeWorkspaceRootLabel) return rel
  const label = workspaceRootLabel(root)
  return label ? (rel ? `${label}/${rel}` : label) : rel
}

/**
 * Codex `t$i({cwd, path, workspaceRoot})`:面包屑/tooltip 用的显示路径。
 * 基准优先取 cwd(文件在 cwd 里时),否则 workspaceRoot;相对化后加 root 标签。
 */
export function fileDisplayPath({
  cwd,
  path,
  workspaceRoot
}: {
  cwd: string | null
  path: string
  workspaceRoot: string | null
}): string {
  const base = cwd != null && !isAbsolutePath(relativeFrom(path, cwd)) ? cwd : workspaceRoot
  if (base == null) return path
  const rel = relativeFrom(path, base)
  return isAbsolutePath(rel)
    ? rel
    : displayPathFor({ root: base, relativePath: rel, includeWorkspaceRootLabel: true })
}

/** Codex `n$i`:显示路径切成面包屑段 */
export function fileDisplaySegments(params: {
  cwd: string | null
  path: string
  workspaceRoot: string | null
}): string[] {
  return normalizePath(fileDisplayPath(params))
    .split('/')
    .filter((segment) => segment.length > 0)
}

/** 面包屑某一段的下拉目标(Codex `r$i` 的返回元素);undefined = 该段不可点 */
export interface BreadcrumbSegmentTarget {
  /** 该段对应的 root 相对路径;null = 根目录本身 */
  activePath: string | null
  /** 下拉要列的目录(root 相对);null = 根目录 */
  directoryPath: string | null
}

/**
 * Codex `r$i({cwd, path, workspaceRoot})`:逐段算出下拉目标。
 *
 * 显示段(可能以 cwd 为基准)与 root 相对段长度可能不同,所以两边右对齐后逐段比对;
 * 对不上就整体返回 null(不给下拉)。root 标签那段的目标是 `{null, null}`(列根目录),
 * 左侧多出来的段返回 undefined(纯文本)。
 */
export function breadcrumbSegmentTargets({
  cwd,
  path,
  workspaceRoot
}: {
  cwd: string | null
  path: string
  workspaceRoot: string
}): (BreadcrumbSegmentTarget | undefined)[] | null {
  const rel = relativeToRoot(path, workspaceRoot)
  if (rel == null) return null
  const display = fileDisplaySegments({ cwd, path, workspaceRoot })
  const relative = normalizePath(rel)
    .split('/')
    .filter((segment) => segment.length > 0)
  const overlap = Math.min(display.length, relative.length)
  const displayOffset = display.length - overlap
  const relativeOffset = relative.length - overlap
  const mismatch = display
    .slice(displayOffset)
    .some((segment, i) => segment !== (relative[relativeOffset + i] ?? ''))
  if (mismatch) return null
  const labelIndex = displayOffset - 1
  const rootLabelAt =
    relativeOffset === 0 &&
    labelIndex >= 0 &&
    (display[labelIndex] ?? '') === baseName(workspaceRoot)
      ? labelIndex
      : null
  return display.map((_segment, i) => {
    if (i === rootLabelAt) return { activePath: null, directoryPath: null }
    if (i < displayOffset) return undefined
    const n = relativeOffset + i - displayOffset
    return {
      activePath: relative.slice(0, n + 1).join('/'),
      directoryPath: relative.slice(0, n).join('/') || null
    }
  })
}

/**
 * Codex `e$i({filePath, roots})`:在一组 workspace roots 里找包含该文件的根,
 * **多个命中取最长的那个**(嵌套 root 要落到更具体的根)。
 */
export function resolveInWorkspaceRoots(
  path: string,
  roots: readonly string[]
): { workspaceRoot: string; relPath: string } | null {
  let best: { workspaceRoot: string; relPath: string } | null = null
  for (const root of roots) {
    const relPath = relativeToRoot(path, root)
    if (relPath == null) continue
    const normalizedRoot = normalizePath(root).replace(/\/+$/, '')
    if (best == null || normalizedRoot.length > best.workspaceRoot.length) {
      best = { workspaceRoot: normalizedRoot, relPath }
    }
  }
  return best
}
