import { useCallback } from 'react'
import { APPEARANCE_SETTINGS, type AppearanceTheme } from '@shared/settings/definitions'
import { cx } from '../../../utils/cx'
import { useSetting, writeSetting } from '../../../state/settingsStore'
import { DarkThemePreview, LightThemePreview, SystemThemePreview } from './themePreviews'

/**
 * 主题选择器 —— Codex `la` / `ya` / `ba`。
 *
 * 形态不是分段控件，而是**三张缩略图卡片**：一个 `role="radiogroup"` 的三列网格，
 * 每张卡是一个 `<label>` 包着 sr-only 的 radio（`name="appearance-theme"`）、
 * 一张 17:12 的预览图、一行标签文字。选中态画在预览图的边框上
 *（`border-2 border-token-text-primary` ⇄ `border border-token-border`），
 * 焦点环通过 `peer-focus-visible:` 从隐藏的 input 传导到预览图上。
 *
 * 顺序是 system → light → dark（Codex `ja` 逐字）。
 *
 * 写入带 **`optimistic: false`**（Codex `la` 里逐字如此）：主题的可见结果是整窗
 * 换色，而换色要绕一圈宿主（settings → nativeTheme.themeSource →
 * system-theme-variant-updated → <html> 类名）。乐观回填会让选中态先跳、颜色
 * 后跟，中间那一帧像是点错了。
 */

const THEME_OPTIONS: ReadonlyArray<{ id: AppearanceTheme; label: string }> = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' }
]

/** Codex `Ma` —— 每档的底色与预览稿 */
const THEME_PREVIEWS: Record<
  AppearanceTheme,
  { background: string; Preview: (props: { className?: string }) => React.JSX.Element }
> = {
  system: {
    background: 'linear-gradient(90deg, #9f9f9f 0 50%, #5d5d5d 50% 100%)',
    Preview: SystemThemePreview
  },
  light: { background: '#f3f3f3', Preview: LightThemePreview },
  dark: { background: '#5d5d5d', Preview: DarkThemePreview }
}

export function ThemePicker(): React.JSX.Element {
  const selected = useSetting(APPEARANCE_SETTINGS.theme)

  const select = useCallback((next: AppearanceTheme) => {
    void writeSetting(APPEARANCE_SETTINGS.theme, next, { optimistic: false }).catch(
      (error: unknown) => {
        console.warn('[settings] failed to write appearance theme', error)
      }
    )
  }, [])

  return (
    <div aria-label="Theme" className="grid w-full grid-cols-3 gap-3" role="radiogroup">
      {THEME_OPTIONS.map((option) => (
        <ThemeOption
          key={option.id}
          ariaLabel={option.label}
          label={option.label}
          mode={option.id}
          selected={selected === option.id}
          onSelect={() => select(option.id)}
        />
      ))}
    </div>
  )
}

/** Codex `ya` */
function ThemeOption({
  ariaLabel,
  label,
  mode,
  selected,
  onSelect
}: {
  ariaLabel: string
  label: string
  mode: AppearanceTheme
  selected: boolean
  onSelect(): void
}): React.JSX.Element {
  return (
    <label className="group flex min-w-0 cursor-interaction flex-col items-center gap-1.5 text-center">
      <input
        aria-label={ariaLabel}
        checked={selected}
        className="peer sr-only"
        name="appearance-theme"
        onChange={onSelect}
        type="radio"
      />
      <ThemeSwatch mode={mode} selected={selected} />
      <span
        className={cx(
          'truncate text-sm group-hover:text-token-text-primary',
          selected ? 'text-token-text-primary' : 'text-token-text-secondary'
        )}
      >
        {label}
      </span>
    </label>
  )
}

/** Codex `ba` */
function ThemeSwatch({
  mode,
  selected
}: {
  mode: AppearanceTheme
  selected: boolean
}): React.JSX.Element {
  const { background, Preview } = THEME_PREVIEWS[mode]
  return (
    <span
      aria-hidden="true"
      className={cx(
        'relative isolate block aspect-[17/12] w-full overflow-hidden rounded-lg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-token-focus-border',
        selected
          ? 'border-2 border-token-text-primary'
          : 'border border-token-border group-hover:border-token-border-heavy'
      )}
      style={{ background }}
    >
      <Preview className="block size-full mix-blend-luminosity" />
    </span>
  )
}
