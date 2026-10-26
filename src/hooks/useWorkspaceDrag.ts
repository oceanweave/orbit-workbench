import { useEffect, useRef, useState } from 'react'
import { dropPosition, type DropPosition } from '../../shared/ordering.mjs'
import '../components/workspace-drag.css'

export type WorkspaceDragItem = { kind: 'board' | 'group' | 'link' | 'config' | 'kube-group'; id: string; boardId?: string }
export type WorkspaceDropTarget = WorkspaceDragItem & { position: DropPosition }

export function rowDropTarget(event: React.DragEvent<HTMLElement>, item: WorkspaceDragItem, nested = false): WorkspaceDropTarget {
  const bounds = event.currentTarget.getBoundingClientRect()
  return { ...item, position: dropPosition((event.clientY - bounds.top) / bounds.height, nested) }
}

export const isSameDragItem = (a: WorkspaceDragItem | null, b: WorkspaceDragItem) => a?.kind === b.kind && a.id === b.id && a.boardId === b.boardId
export const dropClassName = (target: WorkspaceDropTarget | null, item: WorkspaceDragItem) => isSameDragItem(target, item) ? `drop-${target!.position}` : ''

export function useWorkspaceDrag() {
  const [item, setItem] = useState<WorkspaceDragItem | null>(null)
  const [target, setTarget] = useState<WorkspaceDropTarget | null>(null)
  const preview = useRef<HTMLDivElement | null>(null)
  const endedAt = useRef(0)
  const scrollAt = useRef(0)
  useEffect(() => () => preview.current?.remove(), [])

  const start = (event: React.DragEvent<HTMLElement>, source: WorkspaceDragItem, title: string) => {
    event.stopPropagation()
    if ((event.target as HTMLElement).closest('input, textarea, select, button:not([data-drag-handle]):not([data-drag-source])')) { event.preventDefault(); return }
    preview.current?.remove()
    const element = document.createElement('div')
    element.className = 'drag-preview'
    element.textContent = title
    document.body.appendChild(element)
    preview.current = element
    // Keep the compact ghost to the bottom-right of the pointer so the exact
    // insertion line or destination folder remains visible.
    event.dataTransfer.setDragImage(element, -12, -12)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-orbit-workbench', JSON.stringify(source))
    setItem(source)
    setTarget(null)
  }
  const finish = () => {
    preview.current?.remove()
    preview.current = null
    setItem(null)
    setTarget(null)
    endedAt.current = Date.now()
  }
  const over = (event: React.DragEvent<HTMLElement>, next: WorkspaceDropTarget | null) => {
    if (!item) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = next ? 'move' : 'none'
    setTarget((current) => current?.kind === next?.kind && current?.id === next?.id && current?.boardId === next?.boardId && current?.position === next?.position ? current : next)
    // Native drag autoscroll can skip nested panels. Scroll the closest list
    // near its edges, without changing the size of any potential drop target.
    if (Date.now() - scrollAt.current > 40) {
      const panel = event.currentTarget.closest<HTMLElement>('.board-tree, .config-list, .kube-groups')
      if (panel && panel.scrollHeight > panel.clientHeight) {
        const bounds = panel.getBoundingClientRect()
        if (event.clientY < bounds.top + 28) panel.scrollTop -= 18
        else if (event.clientY > bounds.bottom - 28) panel.scrollTop += 18
      }
      scrollAt.current = Date.now()
    }
  }
  const leave = (event: React.DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(null)
  }
  const suppressClick = (event: React.MouseEvent) => {
    if (Date.now() - endedAt.current < 200) { event.preventDefault(); event.stopPropagation() }
  }
  return { item, target, start, finish, over, leave, suppressClick }
}
