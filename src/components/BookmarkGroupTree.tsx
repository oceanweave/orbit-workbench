import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, GripVertical, Pencil } from 'lucide-react'
import { bookmarkGroupRows } from '../../shared/bookmarks.mjs'
import { dropClassName, isSameDragItem, rowDropTarget, type WorkspaceDragItem, type WorkspaceDropTarget } from '../hooks/useWorkspaceDrag'
import type { BookmarkBoard, BookmarkGroup } from '../types'
import './bookmark-tree.css'

type Props = {
  board: BookmarkBoard
  activeGroupId: string
  dragItem: WorkspaceDragItem | null
  dropTarget: WorkspaceDropTarget | null
  canDrop: (target: WorkspaceDropTarget) => boolean
  onTarget: (event: React.DragEvent<HTMLElement>, target: WorkspaceDropTarget | null) => void
  onLeave: (event: React.DragEvent<HTMLElement>) => void
  onDragStart: (event: React.DragEvent<HTMLElement>, group: BookmarkGroup) => void
  onDragEnd: () => void
  onSelect: (groupId: string) => void
  onEdit: (group: BookmarkGroup) => void
  onDrop: (event: React.DragEvent<HTMLElement>, target: WorkspaceDropTarget) => void
}

export function BookmarkGroupTree({ board, activeGroupId, dragItem, dropTarget, canDrop, onTarget, onLeave, onDragStart, onDragEnd, onSelect, onEdit, onDrop }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const rows = useMemo(() => bookmarkGroupRows(board.groups), [board.groups])
  const lastSiblingIds = useMemo(() => {
    const last = new Map<string | undefined, string>()
    rows.forEach((row) => last.set(row.parentId, row.group.id))
    return new Set(last.values())
  }, [rows])
  const counts = useMemo(() => {
    const values = new Map<string, number>()
    board.links.forEach((link) => values.set(link.groupId, (values.get(link.groupId) || 0) + 1))
    for (const row of [...rows].reverse()) if (row.parentId) values.set(row.parentId, (values.get(row.parentId) || 0) + (values.get(row.group.id) || 0))
    return values
  }, [board.links, rows])

  useEffect(() => {
    const selected = rows.find((row) => row.group.id === activeGroupId)
    if (selected) setCollapsed((current) => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, selected.ancestors.includes(id) ? false : value])))
  }, [activeGroupId, rows])

  // Hover a collapsed target to reveal its children without obscuring the drop.
  useEffect(() => {
    if (!dragItem || dropTarget?.kind !== 'group' || dropTarget.boardId !== board.id || dropTarget.position !== 'inside') return
    const groupId = dropTarget.id
    if (!collapsed[groupId]) return
    const timer = window.setTimeout(() => setCollapsed((current) => ({ ...current, [groupId]: false })), 500)
    return () => window.clearTimeout(timer)
  }, [dragItem, dropTarget, board.id, collapsed])

  return <div className="bookmark-folder-tree" role="group" aria-label={`${board.name} 的分组树`}>
    {rows.filter((row) => !row.ancestors.some((id) => collapsed[id])).map(({ group, depth, path, hasChildren, ancestors }) => {
      const identity: WorkspaceDragItem = { kind: 'group', boardId: board.id, id: group.id }
      const destination = (event: React.DragEvent<HTMLElement>): WorkspaceDropTarget => dragItem?.kind === 'link' ? { ...identity, position: 'inside' } : rowDropTarget(event, identity, true)
      const accepts = Boolean(dragItem && canDrop({ ...identity, position: 'inside' }))
      return <div key={group.id} className={`bookmark-folder-row drag-sort-row ${activeGroupId === group.id ? 'selected' : ''} ${dropClassName(dropTarget, identity)} ${accepts ? 'accepts-drop' : ''} ${isSameDragItem(dragItem, identity) ? 'drag-source' : ''}`} style={{ '--folder-depth': depth } as React.CSSProperties} data-group-id={group.id} data-folder-depth={depth} title={`${board.name} / ${path}`} draggable onDragStart={(event) => onDragStart(event, group)} onDragEnd={onDragEnd}
        onDragOver={(event) => { const target = destination(event); onTarget(event, canDrop(target) ? target : null) }}
        onDragLeave={onLeave}
        onDrop={(event) => onDrop(event, destination(event))}>
        <span className="folder-tree-guides" aria-hidden="true">{ancestors.map((id, level) => !lastSiblingIds.has(id) && <i key={id} className="folder-ancestor-guide" style={{ '--guide-level': level } as React.CSSProperties} />)}<i className={`folder-current-guide ${lastSiblingIds.has(group.id) ? 'is-last' : ''}`} /><i className="folder-branch-connector" /></span>
        {hasChildren ? <button className="folder-disclosure" aria-label={`${collapsed[group.id] ? '展开' : '收起'}分组 ${path}`} aria-expanded={!collapsed[group.id]} onClick={() => setCollapsed((current) => ({ ...current, [group.id]: !current[group.id] }))}>{collapsed[group.id] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button> : <span className="folder-disclosure-spacer" />}
        <button className="folder-select" data-drag-source aria-label={`选择分组 ${board.name} / ${path}`} aria-current={activeGroupId === group.id ? 'true' : undefined} onClick={() => onSelect(group.id)}>
          {hasChildren && !collapsed[group.id] ? <FolderOpen size={15} style={{ color: group.color }} /> : <Folder size={15} style={{ color: group.color }} />}
          <span>{group.name}</span><small aria-label={`${counts.get(group.id) || 0} 条链接，包含子分组`}>{counts.get(group.id) || 0}</small>
        </button>
        <button className="folder-edit" onClick={() => onEdit(group)} aria-label={`编辑分组 ${board.name} / ${path}`} title="编辑名称、移动或新建子分组"><Pencil size={13} /></button>
        <button className="sort-drag-handle" draggable data-drag-handle aria-label={`拖动分组 ${board.name} / ${path}`} title="边缘排序，中央移入"><GripVertical size={14} /></button>
      </div>
    })}
  </div>
}
