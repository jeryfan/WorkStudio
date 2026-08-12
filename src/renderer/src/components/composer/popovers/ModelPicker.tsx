import { useRef } from 'react'
import { useSession } from '../../../state/SessionContext'
import { CheckIcon } from '../../icons'

interface EffortSliderProps {
  /** 当前模型支持的档位，从低到高 */
  efforts: string[]
  value: string | null
  onChange(effort: string): void
}

/**
 * effort 滑块（chat.html #popModel .mp-slider）：
 * 轨道上均匀分布圆点（已达成档实心），旋钮吸附到最近档位；
 * 点击轨道或拖拽旋钮都可调整（pointer capture）。
 */
function EffortSlider({ efforts, value, onChange }: EffortSliderProps): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)
  const count = efforts.length
  const index = Math.max(0, value ? efforts.indexOf(value) : 0)
  const pct = (i: number): number => (count > 1 ? (i / (count - 1)) * 100 : 0)

  const setFromClientX = (clientX: number): void => {
    const track = trackRef.current
    if (!track || count === 0) return
    const rect = track.getBoundingClientRect()
    const ratio = (clientX - rect.left) / rect.width
    const i = Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))))
    if (efforts[i] !== value) onChange(efforts[i])
  }

  return (
    <div className="flex h-9 items-center px-2.5 pb-2">
      <div
        ref={trackRef}
        role="slider"
        aria-label="Reasoning effort"
        aria-valuemin={0}
        aria-valuemax={count - 1}
        aria-valuenow={index}
        aria-valuetext={value ?? undefined}
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setFromClientX(e.clientX)
        }}
        onPointerMove={(e) => {
          if ((e.buttons & 1) === 1) setFromClientX(e.clientX)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' && index > 0) onChange(efforts[index - 1])
          if (e.key === 'ArrowRight' && index < count - 1) onChange(efforts[index + 1])
        }}
        className="relative h-4 flex-1 cursor-pointer touch-none outline-none"
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-sm bg-ink/[0.12]" />
        {efforts.map((effort, i) => (
          <span
            key={effort}
            className={`absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full ${
              i <= index ? 'bg-ink' : 'bg-ink/25'
            }`}
            style={{ left: `${pct(i)}%` }}
          />
        ))}
        <span
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-[0_1px_3px_rgb(0_0_0/0.25)]"
          style={{ left: `${pct(index)}%` }}
        />
      </div>
    </div>
  )
}

/**
 * 模型选择弹层（chat.html #popModel，224px + 设计文档 §5.4 的 model/list）：
 * 上半部分是模型单选列表，下半部分是当前模型的 effort 滑块；
 * 选择结果存入 SessionContext，随 turn/start 下发。
 * 点选后不自动关闭——用户通常接着调 effort；点遮罩 / Escape 关闭。
 */
export function ModelPicker(): React.JSX.Element {
  const { models, model, effort, selectModel, selectEffort } = useSession()

  return (
    <>
      {models.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => selectModel(m.id)}
          className="flex w-full items-center gap-1.5 rounded-[12.5px] px-2 py-[5px] text-left text-[13px] leading-[18.57px] text-ink hover:bg-row-hover"
        >
          <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
          {m.id === model?.id && <CheckIcon className="size-4 shrink-0 opacity-75" />}
        </button>
      ))}

      {model && model.efforts.length > 0 && (
        <>
          <div className="px-2 py-1">
            <div className="h-px w-full bg-menu-line" />
          </div>
          <div className="flex items-center justify-between px-2 pb-1 pt-2 text-xs text-desc">
            <span>Faster</span>
            <span>Smarter</span>
          </div>
          <EffortSlider efforts={model.efforts} value={effort} onChange={selectEffort} />
        </>
      )}
    </>
  )
}
