/**
 * Codex 文件类型图标(bundle NV 映射,键名权威;组件名为推断名)。
 * 由 scripts/extract-file-type-icons.mjs 从 app-initial bundle 提取,请勿手改路径数据。
 */
export function CssFileIcon(props: React.SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M5.99984 2.3335L4.6665 13.6668"
        stroke="currentColor"
        strokeWidth={1.33333}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.3333 2.3335L10 13.6668"
        stroke="currentColor"
        strokeWidth={1.33333}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.6665 5.3335H13.3332"
        stroke="currentColor"
        strokeWidth={1.33333}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.6665 10.6665H13.3332"
        stroke="currentColor"
        strokeWidth={1.33333}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
