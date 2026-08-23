import type { AppShellTabDescriptorInput } from '../../state/AppShellContext'
import { fileTabId } from '../../state/AppShellContext'
import { FileCodeIcon } from '../icons'
import { FileTab } from './file/FileTab'

export interface FilesTabState {
  path: string | null
}

/**
 * Files tab 描述符工厂 —— Codex tabId 规则 `file:local:<path>`(空 path 即 `file:local:`,
 * 实测)。从 launcher/「+」打开时空 path、标题 "Open file";选中文件后 tab 的
 * id 与标题跟随路径(FileTab 里 updateTab,实测行为)。
 *
 * 实测注意:从 launcher 打开的 Files tab **不是 preview**(标题不斜体);
 * preview 只发生在外部打开文件的场景(如会话里的行内文件引用 → InlineAnchor)。
 */
export function createFilesTabDescriptor(
  path = ''
): AppShellTabDescriptorInput<FilesTabState> {
  return {
    tabId: fileTabId(path),
    title: path === '' ? 'Open file' : path.split('/').pop() || path,
    icon: <FileCodeIcon className="icon-xs shrink-0" />,
    defaultState: () => ({ path: path === '' ? null : path }),
    renderPanel: (props) => <FileTab {...props} />
  }
}
