import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, Pencil } from 'lucide-react'
import { bookmarkGroupRows } from '../../shared/bookmarks.mjs'
import type { BookmarkBoard, BookmarkGroup } from '../types'
import './bookmark-tree.css'

type Props = {
  board: BookmarkBoard
  activeGroupId: string
  dragging: boolean
  dropTarget: string | null
  onTarget: (target: string | null) => void
  onSelect: (groupId: string) => void
  onEdit: (group: BookmarkGroup) => void
  onDrop: (groupId: string) => void
}

export function BookmarkGroupTree({ board, activeGroupId, dragging, dropTarget, onTarget, onSelect, onEdit, onDrop }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const rows = useMemo(() => bookmarkGroupRows(board.groups), [board.groups])
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
    if (!dragging || !dropTarget?.startsWith(`${board.id}:`)) return
    const groupId = dropTarget.slice(board.id.length + 1)
    if (!collapsed[groupId]) return
    const timer = window.setTimeout(() => setCollapsed((current) => ({ ...current, [groupId]: false })), 500)
    return () => window.clearTimeout(timer)
  }, [dragging, dropTarget, board.id, collapsed])

  return <div className="bookmark-folder-tree" role="group" aria-label={`${board.name} 的分组树`}>
    {rows.filter((row) => !row.ancestors.some((id) => collapsed[id])).map(({ group, depth, path, hasChildren }) => {
      const targetId = `${board.id}:${group.id}`
      const isTarget = dropTarget === targetId
      return <div key={group.id} className={`bookmark-folder-row ${activeGroupId === group.id ? 'selected' : ''} ${isTarget ? 'is-drop-target' : ''} ${dragging ? 'accepts-drop' : ''}`} style={{ '--folder-depth': Math.min(depth, 8) } as React.CSSProperties} data-group-id={group.id} title={`${board.name} / ${path}`}
        onDragEnter={(event) => { if (dragging) { event.preventDefault(); onTarget(targetId) } }}
        onDragOver={(event) => { if (dragging) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; onTarget(targetId) } }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node) && isTarget) onTarget(null) }}
        onDrop={(event) => { if (dragging) { event.preventDefault(); event.stopPropagation(); onDrop(group.id) } }}>
        {hasChildren ? <button className="folder-disclosure" aria-label={`${collapsed[group.id] ? '展开' : '收起'}分组 ${path}`} aria-expanded={!collapsed[group.id]} onClick={() => setCollapsed((current) => ({ ...current, [group.id]: !current[group.id] }))}>{collapsed[group.id] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button> : <span className="folder-disclosure-spacer" />}
        <button className="folder-select" aria-label={`选择分组 ${board.name} / ${path}`} aria-current={activeGroupId === group.id ? 'true' : undefined} onClick={() => onSelect(group.id)}>
          {hasChildren && !collapsed[group.id] ? <FolderOpen size={15} style={{ color: group.color }} /> : <Folder size={15} style={{ color: group.color }} />}
          <span>{group.name}</span><small aria-label={`${counts.get(group.id) || 0} 条链接，包含子分组`}>{counts.get(group.id) || 0}</small>
        </button>
        <button className="folder-edit" onClick={() => onEdit(group)} aria-label={`编辑分组 ${board.name} / ${path}`} title="编辑名称、移动或新建子分组"><Pencil size={13} /></button>
      </div>
    })}
  </div>
}
