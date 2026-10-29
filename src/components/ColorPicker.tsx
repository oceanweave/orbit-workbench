import { Check } from 'lucide-react'
export const palette = [
  { color: '#6f8cff', name: '鸢尾蓝' },
  { color: '#32b99a', name: '薄荷绿' },
  { color: '#e4a04c', name: '暖琥珀' },
  { color: '#ad7ce1', name: '藤紫' },
  { color: '#df7890', name: '蔷薇' },
  { color: '#52a6c9', name: '湖蓝' },
  { color: '#8290a6', name: '岩灰' },
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
        <button type="button" className="color-default" onClick={() => onChange(palette[0].color)}>
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
