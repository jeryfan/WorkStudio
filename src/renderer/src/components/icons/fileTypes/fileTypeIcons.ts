/**
 * Codex 文件类型图标(bundle NV 映射,键名权威;组件名为推断名)。
 * 由 scripts/extract-file-type-icons.mjs 从 app-initial bundle 提取,请勿手改路径数据。
 */
import type { ComponentType, SVGProps } from 'react'
import { ArtifactDocumentFileIcon } from './ArtifactDocumentFileIcon'
import { CodeFileIcon } from './CodeFileIcon'
import { DocumentFileIcon } from './DocumentFileIcon'
import { FileFileIcon } from './FileFileIcon'
import { CssFileIcon } from './CssFileIcon'
import { CplusplusFileIcon } from './CplusplusFileIcon'
import { FolderFileIcon } from './FolderFileIcon'
import { HtmlFileIcon } from './HtmlFileIcon'
import { JavaFileIcon } from './JavaFileIcon'
import { JavascriptFileIcon } from './JavascriptFileIcon'
import { ImageFileIcon } from './ImageFileIcon'
import { JsonFileIcon } from './JsonFileIcon'
import { NotebookFileIcon } from './NotebookFileIcon'
import { PdfFileIcon } from './PdfFileIcon'
import { PhpFileIcon } from './PhpFileIcon'
import { PythonFileIcon } from './PythonFileIcon'
import { ReactFileIcon } from './ReactFileIcon'
import { RustFileIcon } from './RustFileIcon'
import { ShellFileIcon } from './ShellFileIcon'
import { SkillFileIcon } from './SkillFileIcon'
import { SpreadsheetFileIcon } from './SpreadsheetFileIcon'
import { BuildFileIcon } from './BuildFileIcon'
import { PresentationFileIcon } from './PresentationFileIcon'
import { HashesFileIcon } from './HashesFileIcon'
import { TerminalFileIcon } from './TerminalFileIcon'
import { TypescriptFileIcon } from './TypescriptFileIcon'
import { TomlFileIcon } from './TomlFileIcon'

type FileTypeIconComponent = ComponentType<SVGProps<SVGSVGElement>>

/** Codex `NV`:图标 key → 组件 */
export const FILE_TYPE_ICONS: Record<string, FileTypeIconComponent> = {
  artifactDocument: ArtifactDocumentFileIcon,
  code: CodeFileIcon,
  document: DocumentFileIcon,
  file: FileFileIcon,
  css: CssFileIcon,
  cplusplus: CplusplusFileIcon,
  folder: FolderFileIcon,
  html: HtmlFileIcon,
  java: JavaFileIcon,
  javascript: JavascriptFileIcon,
  image: ImageFileIcon,
  yaml: FileFileIcon,
  json: JsonFileIcon,
  notebook: NotebookFileIcon,
  pdf: PdfFileIcon,
  php: PhpFileIcon,
  python: PythonFileIcon,
  react: ReactFileIcon,
  rust: RustFileIcon,
  shell: ShellFileIcon,
  skill: SkillFileIcon,
  spreadsheet: SpreadsheetFileIcon,
  build: BuildFileIcon,
  presentation: PresentationFileIcon,
  hashes: HashesFileIcon,
  terminal: TerminalFileIcon,
  typescript: TypescriptFileIcon,
  toml: TomlFileIcon
}
