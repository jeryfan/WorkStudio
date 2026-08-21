import type { ComponentType } from 'react'
import {
  DocumentsIcon,
  GoalIcon,
  PaperclipIcon,
  PdfIcon,
  PlanModeIcon,
  PresentationsIcon,
  RecordSkillIcon,
  SpreadsheetsIcon,
  TemplateIcon,
  VisualizeIcon,
  WorkProjectIcon,
  type IconProps
} from '../../icons'

interface PlusMenuItem {
  id: string
  title: string
  desc?: string
  icon: ComponentType<IconProps>
}

interface PlusMenuSection {
  heading: string
  items?: PlusMenuItem[]
  /** 无条目时的占位文案（chat.html .tm-empty） */
  emptyText?: string
}

/**
 * 菜单内容（chat.html #topMenu）：Add / Plugins / Agents / Files 四个分区。
 * 附件、目标、计划模式、技能录制等动作随 M4 会话输入（UserInput）接入，
 * 当前只有结构与本文件中声明的 id。
 */
const SECTIONS: PlusMenuSection[] = [
  {
    heading: 'Add',
    items: [
      { id: 'files', title: 'Files and folders', icon: PaperclipIcon },
      {
        id: 'work-in-project',
        title: 'Work in a project',
        desc: 'Choose project for new chats',
        icon: WorkProjectIcon
      },
      { id: 'goal', title: 'Goal', desc: 'Set a goal to keep pursuing', icon: GoalIcon },
      { id: 'plan-mode', title: 'Plan mode', desc: 'Turn plan mode on', icon: PlanModeIcon },
      { id: 'record-skill', title: 'Record a skill', icon: RecordSkillIcon }
    ]
  },
  {
    heading: 'Plugins',
    items: [
      {
        id: 'plugin-documents',
        title: 'Documents',
        desc: 'Create and edit document artifacts',
        icon: DocumentsIcon
      },
      {
        id: 'plugin-pdf',
        title: 'PDF',
        desc: 'Read, create, and verify PDF files',
        icon: PdfIcon
      },
      {
        id: 'plugin-spreadsheets',
        title: 'Spreadsheets',
        desc: 'Create and edit spreadsheet files',
        icon: SpreadsheetsIcon
      },
      {
        id: 'plugin-presentations',
        title: 'Presentations',
        desc: 'Create and edit presentations',
        icon: PresentationsIcon
      },
      {
        id: 'plugin-template',
        title: 'Template Creator',
        desc: 'Create or update reusable templates from reference content',
        icon: TemplateIcon
      },
      {
        id: 'plugin-visualize',
        title: 'Visualize',
        desc: 'Turn ideas and data into interactive visuals',
        icon: VisualizeIcon
      }
    ]
  },
  { heading: 'Agents', emptyText: 'No agents available' },
  { heading: 'Files', emptyText: 'Type to search for files' }
]

interface PlusMenuProps {
  /** 选中某个菜单项；调用方决定动作（本组件只负责结构与展示） */
  onSelect(id: string): void
}

/**
 * "+" 顶部菜单（chat.html #topMenu，320px 高、吸顶分区标题）。
 * 由 Popover 承载定位与关闭逻辑，本组件只管滚动列表内容。
 */
export function PlusMenu({ onSelect }: PlusMenuProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {SECTIONS.map((section, i) => (
        <div key={section.heading}>
          <div
            className={`sticky top-0 z-10 bg-token-dropdown-background px-2 py-1 text-[13px] leading-[18.57px] text-token-description-foreground ${
              i > 0 ? 'pt-2' : ''
            }`}
          >
            {section.heading}
          </div>
          {section.items?.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className="flex w-full items-center gap-2 rounded-[12.5px] px-2 py-[5px] text-left text-[13px] leading-[18.57px] text-token-foreground/75 hover:bg-token-list-hover-background hover:text-token-foreground"
            >
              <span className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded">
                <item.icon className="size-4" />
              </span>
              <span className="shrink-0 whitespace-nowrap">{item.title}</span>
              {item.desc && (
                <span className="min-w-0 flex-1 truncate text-token-description-foreground">
                  {item.desc}
                </span>
              )}
            </button>
          ))}
          {section.emptyText && (
            <div className="px-2 py-[5px] text-[13px] leading-[18.57px] text-token-input-placeholder-foreground">
              {section.emptyText}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
