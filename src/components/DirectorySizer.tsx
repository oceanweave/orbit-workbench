import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { usePersistentState } from '../lib/workspaceStore'

export function useDirectorySize(key: string, initial = 280) {
  const [width, setWidth] = usePersistentState(`orbit-pane-${key}`, initial)
  const [collapsed, setCollapsed] = usePersistentState(`orbit-pane-${key}-collapsed`, false)
  const resize = (event: React.PointerEvent) => {
    const start = event.clientX
    const initialWidth = width
    const element = event.currentTarget as HTMLElement
    const workspace = element.closest<HTMLElement>(
      '.workspace-grid, .kube-grid, .command-workspace',
    )
    let currentWidth = width
    element.setPointerCapture(event.pointerId)
    const move = (next: PointerEvent) => {
      currentWidth = Math.round(Math.min(480, Math.max(220, initialWidth + next.clientX - start)))
      workspace?.style.setProperty('--directory-width', `${currentWidth}px`)
    }
    const cleanup = () => {
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', finish)
      element.removeEventListener('pointercancel', cancel)
    }
    const finish = () => {
      cleanup()
      setWidth(currentWidth)
    }
    const cancel = () => {
      cleanup()
      workspace?.style.setProperty('--directory-width', `${initialWidth}px`)
    }
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', finish)
    element.addEventListener('pointercancel', cancel)
  }
  return {
    style: { '--directory-width': `${collapsed ? 46 : width}px` } as React.CSSProperties,
    className: collapsed ? 'directory-collapsed' : '',
    control: (
      <>
        <button
          className="directory-toggle icon-button"
          aria-label={collapsed ? '展开目录' : '收起目录'}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
        {!collapsed && (
          <div
            className="directory-resizer"
            role="separator"
            aria-label="调整目录宽度"
            aria-orientation="vertical"
            aria-valuenow={width}
            aria-valuemin={220}
            aria-valuemax={480}
            tabIndex={0}
            onPointerDown={resize}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault()
                setWidth(
                  Math.min(480, Math.max(220, width + (event.key === 'ArrowLeft' ? -20 : 20))),
                )
              }
            }}
          />
        )}
      </>
    ),
  }
}
