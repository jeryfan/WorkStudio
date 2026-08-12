import type { IconProps } from '../types'

/** chat.html 加号菜单插件区「Template Creator」图标 */
export function TemplateIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M14.1875 21.5H19.05C20.4875 21.5 21.5 20.4875 21.5 19.05V15.95C21.5 14.5125 20.4875 13.5 19.05 13.5H14.1875V21.5Z"
        fill="#FFD400"
      />
      <path d="M6.5 21.5H14.1875V13.5H6.5V21.5Z" fill="#FFA43D" />
      <path
        d="M15.8007 13.9601L19.2229 10.5379C20.2346 9.52621 20.2346 8.10104 19.2229 7.08934L17.0411 4.9076C16.0295 3.8959 14.6043 3.8959 13.5926 4.9076L10.1704 8.32977L15.8007 13.9601Z"
        fill="#FF8082"
      />
      <path
        d="M9.36957 20.3912L15.8006 13.9601L10.1703 8.32979L3.73926 14.7609L9.36957 20.3912Z"
        fill="#F75858"
      />
      <path
        d="M2.5 15.15V17.5C2.5 19.85 4.15 21.5 6.5 21.5C8.85 21.5 10.5 19.85 10.5 17.5V15.15H2.5Z"
        fill="#0088FF"
      />
      <path d="M10.5 15.15V8.8125H2.5V15.15H10.5Z" fill="#2E9EFF" />
      <path
        d="M10.5 8.8125V4.95C10.5 3.5125 9.4875 2.5 8.05 2.5H4.95C3.5125 2.5 2.5 3.5125 2.5 4.95V8.8125H10.5Z"
        fill="#43D0FB"
      />
    </svg>
  )
}
