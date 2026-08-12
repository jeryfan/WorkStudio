import type { Project } from './types'

/**
 * 路径比较用的规范形式。
 *
 * 本模块要同时被主进程和渲染层使用，因此不能依赖 node:path——渲染层是浏览器
 * 环境。存入注册表的路径在主进程侧已经过 path.resolve 转成绝对路径，
 * 这里只需处理分隔符与结尾差异。
 *
 * 不做大小写折叠：macOS 默认大小写不敏感但 Linux 敏感，统一小写会在 Linux 上
 * 把两个不同目录判成同一个。
 */
export function canonicalRoot(input: string): string {
  const unified = input.replace(/\\/g, '/')
  return unified.length > 1 && unified.endsWith('/') ? unified.replace(/\/+$/, '') : unified
}

export function pathsEqual(a: string, b: string): boolean {
  return canonicalRoot(a) === canonicalRoot(b)
}

/** 取路径最后一段作为默认项目名 */
export function basenameOf(path: string): string {
  const segments = canonicalRoot(path).split('/')
  return segments[segments.length - 1] || path
}

/**
 * 按工作目录反查项目。
 *
 * 精确相等而非前缀包含：子目录起的会话不应被吞进父项目，否则用户在子目录
 * 做的独立工作会混进主项目的会话列表里。
 */
export function findProjectForCwd(projects: Project[], cwd: string): Project | null {
  const target = canonicalRoot(cwd)
  for (const project of projects) {
    if (project.rootPaths.some((root) => canonicalRoot(root) === target)) return project
  }
  return null
}
