import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
export type MenuAction = {
  label: string
  run: () => void
  danger?: boolean
  disabled?: boolean
}
export function useContextMenu() {
  const [menu, setMenu] = useState<{
    x: number
    y: number
    actions: MenuAction[]
  } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    ref.current
      ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      ?.focus()
    const close = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) setMenu(null)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', key)
    }
  }, [menu])
  return {
    open: (event: React.MouseEvent, actions: MenuAction[]) => {
      event.preventDefault()
      event.stopPropagation()
      const anchor = event.currentTarget.getBoundingClientRect()
      const x = event.clientX || anchor.left
      const y = event.clientY || anchor.bottom
      setMenu({
        x: Math.max(8, Math.min(x, window.innerWidth - 240)),
        y: Math.max(
          8,
          Math.min(y, window.innerHeight - actions.length * 35 - 20),
        ),
        actions,
      })
    },
    node:
      menu &&
      createPortal(
        <div
          className="context-actions"
          ref={ref}
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const buttons = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  'button:not(:disabled)',
                ),
              ]
              const index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              )
              buttons[
                (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) %
                  buttons.length
              ]?.focus()
            }
          }}
        >
          {menu.actions.map((action) => (
            <button
              key={action.label}
              role="menuitem"
              className={action.danger ? 'danger-action' : ''}
              disabled={action.disabled}
              onClick={() => {
                setMenu(null)
                action.run()
              }}
            >
              {action.label}
            </button>
          ))}
        </div>,
        document.body,
      ),
  }
}
