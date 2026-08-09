import {
  DocIcon,
  DocLinesIcon,
  DockerIcon,
  GitIcon,
  PreCommitIcon,
  StarIcon
} from '../../icons/files'

/**
 * 文件名 → 图标（panel/1.html 文件树第 329-342 行的定制彩色 SVG）。
 * 未命中用通用灰文档图标；.md 用 "M↓" 字符（原型就是这么画的）。
 */
export function FileGlyph({ name }: { name: string }): React.JSX.Element {
  if (name === 'CLAUDE.md') return <StarIcon className="size-4 shrink-0" />
  if (name.endsWith('.md')) {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center text-[10px] font-bold leading-4 tracking-[-0.5px] text-[#2da44e]">
        M↓
      </span>
    )
  }
  if (name === 'Dockerfile' || name === '.dockerignore')
    return <DockerIcon className="size-4 shrink-0" />
  if (name === '.gitignore') return <GitIcon className="size-4 shrink-0" />
  if (name.includes('pre-commit')) return <PreCommitIcon className="size-4 shrink-0" />
  if (name === '.editorconfig') return <DocLinesIcon className="size-4 shrink-0" />
  return <DocIcon className="size-4 shrink-0" />
}
