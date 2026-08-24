/**
 * 文件路径 → 图标组件 —— 对齐 Codex bundle 的 `MV`/`EQi`(app-initial:308186):
 *
 *   EQi(path, mime?):
 *     1. 空 → 'file'
 *     2. 以 / 或 \ 结尾 → 'folder'
 *     3. 小写文件名精确匹配 kQi(仅 'skill.md' → 'skill')
 *     4. 扩展名查 AQi(见下,`TQi` 取扩展名:首个 `.` 开头也算,如 `.gitignore` → 'gitignore')
 *     5. MIME 前缀 jQi(image/ text/ application/pdf|zip|gzip)
 *     6. 兜底 'file'
 *
 *   MV(path) = NV[EQi(path)] —— NV 即 fileTypeIcons.ts 的 FILE_TYPE_ICONS。
 *
 * Codex 的 MIME 兜底走 lookup(host 提供);WS 没有 MIME 源,调用方不传 mime 时
 * 跳过第 5 步(与 Codex 在 lookup 失败时的行为一致)。
 */
import type { ComponentType, SVGProps } from 'react'
import { FILE_TYPE_ICONS } from './fileTypeIcons'

type FileTypeIconComponent = ComponentType<SVGProps<SVGSVGElement>>

/** Codex `kQi` —— 完整文件名精确匹配 */
const BY_EXACT_NAME: Record<string, string> = { 'skill.md': 'skill' }

/** Codex `AQi` —— 扩展名 → 图标 key(顺序无关,单表查询) */
const BY_EXTENSION: Record<string, string> = Object.fromEntries(
  [
    { key: 'typescript', extensions: ['ts'] },
    { key: 'react', extensions: ['tsx', 'jsx'] },
    { key: 'javascript', extensions: ['js', 'mjs', 'cjs', 'hs'] },
    { key: 'python', extensions: ['py'] },
    { key: 'java', extensions: ['java'] },
    { key: 'rust', extensions: ['rs'] },
    { key: 'php', extensions: ['php'] },
    { key: 'css', extensions: ['css', 'scss', 'less', 'sass'] },
    { key: 'cplusplus', extensions: ['cpp', 'cxx', 'cc', 'c', 'hpp', 'hh', 'h'] },
    { key: 'code', extensions: ['rb', 'go', 'kt', 'swift', 'm', 'mm', 'cs', 'sql'] },
    { key: 'json', extensions: ['json', 'jsonc'] },
    { key: 'document', extensions: ['md', 'mdx', 'markdown', 'mkd', 'mdown'] },
    { key: 'html', extensions: ['html', 'htm'] },
    { key: 'yaml', extensions: ['yaml', 'yml'] },
    { key: 'toml', extensions: ['toml'] },
    { key: 'document', extensions: ['xml'] },
    { key: 'spreadsheet', extensions: ['csv', 'tsv', 'xls', 'xlsm', 'xlsx'] },
    { key: 'artifactDocument', extensions: ['doc', 'docx'] },
    { key: 'notebook', extensions: ['ipynb'] },
    { key: 'presentation', extensions: ['ppt', 'pptx'] },
    { key: 'shell', extensions: ['sh', 'bash', 'zsh', 'fish', 'ps1'] },
    { key: 'terminal', extensions: ['dockerfile'] },
    { key: 'document', extensions: ['env', 'dotenv', 'gitignore', 'lock'] },
    { key: 'image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'] },
    { key: 'build', extensions: ['build', 'bazel', 'bzl', 'ninja', 'gradle', 'mk', 'makefile'] },
    { key: 'hashes', extensions: ['sha', 'sha1', 'sha256', 'md5', 'checksum', 'sum'] },
    { key: 'pdf', extensions: ['pdf'] },
    { key: 'folder', extensions: ['zip', 'gz', 'tgz', 'tar'] }
  ].flatMap(({ key, extensions }) => extensions.map((ext) => [ext, key]))
)

/** Codex `jQi` —— MIME 前缀 → 图标 key */
const BY_MIME_PREFIX: { prefix: string; key: string }[] = [
  { prefix: 'image/', key: 'image' },
  { prefix: 'text/', key: 'document' },
  { prefix: 'application/pdf', key: 'pdf' },
  { prefix: 'application/zip', key: 'folder' },
  { prefix: 'application/gzip', key: 'folder' }
]

/** Codex `DQi`:小写的纯文件名(去掉目录部分) */
function baseNameLower(path: string): string {
  const lower = path.toLowerCase()
  const idx = Math.max(lower.lastIndexOf('/'), lower.lastIndexOf('\\'))
  return idx >= 0 ? lower.slice(idx + 1) : lower
}

/** Codex `TQi`:取扩展名 —— `.gitignore` 这类点开头文件名整体算扩展名 */
function extensionOf(path: string): string | null {
  const name = baseNameLower(path)
  const dot = name.lastIndexOf('.')
  if (dot > 0 && dot < name.length - 1) return name.slice(dot + 1)
  if (dot === 0 && name.length > 1) return name.slice(1)
  if (dot === -1) return name
  return null
}

/** Codex `EQi` */
export function fileTypeIconKey(path?: string, mime?: string): string {
  if (!path && !mime) return 'file'
  if (path) {
    if (/[\\/]$/.test(path)) return 'folder'
    const exact = BY_EXACT_NAME[baseNameLower(path)]
    if (exact) return exact
    const ext = extensionOf(path)
    if (ext) {
      const key = BY_EXTENSION[ext]
      if (key) return key
    }
  }
  if (mime) {
    const found = BY_MIME_PREFIX.find(({ prefix }) => mime.startsWith(prefix))
    if (found) return found.key
  }
  return 'file'
}

/** Codex `MV`:路径 → 图标组件 */
export function fileTypeIcon(path?: string, mime?: string): FileTypeIconComponent {
  return FILE_TYPE_ICONS[fileTypeIconKey(path, mime)]
}
