import {
  PlusFilesAndFoldersIcon,
  PlusGoalIcon,
  PlusPlanModeIcon,
  PlusRecordSkillIcon
} from '../../icons'
import type { ComposerMenuSection } from '../ComposerTopMenuShell'
import documentsUrl from '../../../assets/codex/plugin-icons/documents.png'
import pdfUrl from '../../../assets/codex/plugin-icons/pdf.png'
import spreadsheetsUrl from '../../../assets/codex/plugin-icons/spreadsheets.png'
import presentationsUrl from '../../../assets/codex/plugin-icons/presentations.png'
import templateCreatorUrl from '../../../assets/codex/plugin-icons/template-creator.png'
import computerUrl from '../../../assets/codex/plugin-icons/computer.png'
import visualizeUrl from '../../../assets/codex/plugin-icons/visualize.svg'

/**
 * "+" 菜单(Add files and more)的分区数据 —— Codex 运行时实测(见
 * docs/codex-alignment-progress.md C 块):
 *
 * - **不是 portal 弹层**:与 slash/@ 菜单共用 `_ComposerTopMenuShell`
 *   (内联锚在 composer 上方,`mb-1`),焦点留在输入框,输入即查询。
 * - 三个吸顶分区(sticky):Add / Plugins / Files;Files 空态文案
 *   "Type to search for files"。
 * - Add:Files and folders / Goal / Plan mode / Record a skill(21×21 svg 图标)
 * - Plugins:Documents / PDF / Spreadsheets / Presentations / Template Creator /
 *   Computer / Visualize(官方插件的打包位图图标,已提取到 assets/codex/plugin-icons)
 *
 * Codex 里没有 "Work in a project"(项目归属走工具条的项目 pill)
 * 也没有 "Agents" 分区 —— 旧实现里的这两处是自创,已删。
 */
export function buildPlusMenuSections(): ComposerMenuSection[] {
  return [
    {
      heading: 'Add',
      items: [
        {
          id: 'files',
          title: 'Files and folders',
          icon: <PlusFilesAndFoldersIcon className="icon-xs shrink-0" />
        },
        {
          id: 'goal',
          title: 'Goal',
          description: 'Set a goal to keep pursuing',
          icon: <PlusGoalIcon className="icon-xs shrink-0" />
        },
        {
          id: 'plan-mode',
          title: 'Plan mode',
          description: 'Turn plan mode on',
          icon: <PlusPlanModeIcon className="icon-xs shrink-0" />
        },
        {
          id: 'record-skill',
          title: 'Record a skill',
          icon: <PlusRecordSkillIcon className="icon-xs shrink-0" />
        }
      ]
    },
    {
      heading: 'Plugins',
      items: [
        {
          id: 'plugin-documents',
          title: 'Documents',
          description: 'Create and edit documents',
          icon: pluginIcon(documentsUrl)
        },
        {
          id: 'plugin-pdf',
          title: 'PDF',
          description: 'Read, create, and verify PDFs',
          icon: pluginIcon(pdfUrl)
        },
        {
          id: 'plugin-spreadsheets',
          title: 'Spreadsheets',
          description: 'Create and edit spreadsheets',
          icon: pluginIcon(spreadsheetsUrl)
        },
        {
          id: 'plugin-presentations',
          title: 'Presentations',
          description: 'Create and edit presentations',
          icon: pluginIcon(presentationsUrl)
        },
        {
          id: 'plugin-template',
          title: 'Template Creator',
          description: 'Create or update reusable templates from reference content',
          icon: pluginIcon(templateCreatorUrl)
        },
        {
          id: 'plugin-computer',
          title: 'Computer',
          description: 'Control Mac apps from ChatGPT',
          icon: pluginIcon(computerUrl)
        },
        {
          id: 'plugin-visualize',
          title: 'Visualize',
          description: 'Turn ideas and data into interactive visuals',
          icon: pluginIcon(visualizeUrl, true)
        }
      ]
    },
    { heading: 'Files', items: [], emptyText: 'Type to search for files' }
  ]
}

/** 插件位图图标(Codex:`span.block.overflow-hidden.rounded-2xs.icon-xs.shrink-0 > img`) */
function pluginIcon(src: string, contain?: boolean): React.JSX.Element {
  return (
    <span className="block overflow-hidden rounded-2xs icon-xs shrink-0">
      <img
        alt=""
        src={src}
        draggable={false}
        className={
          contain ? 'object-contain rounded-2xs icon-xs shrink-0' : 'h-full w-full object-cover'
        }
      />
    </span>
  )
}
