import type { IconProps } from '../types'

export function DockerIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16">
      <path
        fill="#2496ed"
        d="M13.6 7.2c-.35-.24-1.2-.3-1.87-.14-.09-.63-.42-1.18-1-1.7l-.33-.3-.27.37c-.34.5-.44 1.32-.25 1.94.06.22.16.44.3.62-.23.13-.6.25-.78.25H1.06c-.3.86-.16 2.5.74 3.66.86 1.1 2.13 1.66 3.78 1.66 3.4 0 6.23-1.57 7.55-4.44.52.01 1.63.02 2.2-.94.04-.06.18-.3.3-.56l-.03-.1c-.35-.24-1.05-.36-1.72-.2z"
      />
      <path
        fill="#2496ed"
        d="M2.2 6.6h1.9v1.9H2.2zM4.4 6.6h1.9v1.9H4.4zM6.6 6.6h1.9v1.9H6.6zM8.8 6.6h1.9v1.9H8.8zM4.4 4.4h1.9v1.9H4.4zM6.6 4.4h1.9v1.9H6.6z"
      />
    </svg>
  )
}
