import { Check } from 'lucide-react'
export const palette = [
  { color: '#627e91', name: '雾蓝' },
  { color: '#5f826c', name: '鼠尾草绿' },
  { color: '#a08b59', name: '麦秆黄' },
  { color: '#8d7897', name: '灰紫' },
  { color: '#a57474', name: '陶粉' },
  { color: '#668c8b', name: '青灰' },
  { color: '#7b827a', name: '岩灰' },
]
export function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (color: string) => void
}) {
  return (
    <div className="unified-color-picker">
      <div role="group" aria-label="预设颜色">
        {palette.map(({ color, name }) => (
          <button
            type="button"
            key={color}
            title={name}
            aria-label={name}
            aria-pressed={value === color}
            style={{ background: color }}
            onClick={() => onChange(color)}
          >
            {value === color && <Check size={17} />}
          </button>
        ))}
        <button
          type="button"
          className="color-default"
          onClick={() => onChange(palette[0].color)}
        >
          默认
        </button>
      </div>
      <label>
        自选色
        <input
          type="color"
          aria-label="自选颜色"
          value={/^#[a-f0-9]{6}$/i.test(value) ? value : palette[0].color}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  )
}
