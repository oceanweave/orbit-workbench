import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  ListTree,
  MoreHorizontal,
  Plus,
} from 'lucide-react'
import { bookmarkGroupRows } from '../../shared/bookmarks.mjs'
import type { BookmarkBoard, BookmarkGroup, LinkItem } from '../types'
import { usePersistentState } from '../lib/workspaceStore'
import { DropGap } from './DropGap'
import {
  dropClassName,
  isSameDragItem,
  rowDropTarget,
  type WorkspaceDragItem,
  type WorkspaceDropTarget,
} from '../hooks/useWorkspaceDrag'

type Props = {
  board: BookmarkBoard
  links: LinkItem[]
  groups: BookmarkGroup[]
  search: string
  renderLink: (link: LinkItem) => React.ReactNode
  onEdit: (group: BookmarkGroup) => void
  onContext: (event: React.MouseEvent, group: BookmarkGroup) => void
  onAdd: (groupId: string) => void
  dragItem: WorkspaceDragItem | null
  dropTarget: WorkspaceDropTarget | null
  canDrop: (target: WorkspaceDropTarget) => boolean
  onTarget: (
    event: React.DragEvent<HTMLElement>,
    target: WorkspaceDropTarget | null,
  ) => void
  onLeave: (event: React.DragEvent<HTMLElement>) => void
  onDrop: (
    event: React.DragEvent<HTMLElement>,
    target: WorkspaceDropTarget,
  ) => void
  onDragStart: (
    event: React.DragEvent<HTMLElement>,
    group: BookmarkGroup,
  ) => void
  onDragEnd: () => void
}

export function BookmarkPanels({
  board,
  links,
  groups,
  search,
  renderLink,
  onEdit,
  onContext,
  onAdd,
  dragItem,
  dropTarget,
  canDrop,
  onTarget,
  onLeave,
  onDrop,
  onDragStart,
  onDragEnd,
}: Props) {
  const [collapsed, setCollapsed] = usePersistentState<Record<string, boolean>>(
    'orbit-bookmark-collapse',
    {},
  )
  const [hoverExpanded, setHoverExpanded] = useState<string | null>(null)
  const rows = useMemo(
    () =>
      bookmarkGroupRows(board.groups).filter((row) =>
        groups.some((item) => item.id === row.group.id),
      ),
    [board.groups, groups],
  )
  const prefix = `${board.id}:`
  useEffect(() => {
    if (!dragItem) {
      setHoverExpanded(null)
      return
    }
    if (
      dropTarget?.kind !== 'group' ||
      dropTarget.boardId !== board.id ||
      dropTarget.position !== 'inside'
    )
      return
    const timer = window.setTimeout(() => setHoverExpanded(dropTarget.id), 500)
    return () => clearTimeout(timer)
  }, [dragItem, dropTarget, board.id])
  const closed = (id: string) =>
    !search && collapsed[prefix + id] && hoverExpanded !== id
  const contents = useMemo(() => {
    const direct = new Map<string, LinkItem[]>(),
      totals = new Map<string, number>()
    for (const link of links) {
      if (!direct.has(link.groupId)) direct.set(link.groupId, [])
      direct.get(link.groupId)!.push(link)
      totals.set(link.groupId, (totals.get(link.groupId) ?? 0) + 1)
    }
    for (const row of [...rows].reverse())
      if (row.parentId)
        totals.set(
          row.parentId,
          (totals.get(row.parentId) ?? 0) + (totals.get(row.group.id) ?? 0),
        )
    return { direct, totals }
  }, [rows, links])
  return (
    <div className="bookmark-panels">
      {rows.map(({ group, depth, ancestors, path }) => {
        const direct = contents.direct.get(group.id) ?? [],
          total = contents.totals.get(group.id) ?? 0
        if (
          (search && !total) ||
          ancestors.some(
            (id) => groups.some((item) => item.id === id) && closed(id),
          )
        )
          return null
        const identity: WorkspaceDragItem = {
          kind: 'group',
          boardId: board.id,
          id: group.id,
        }
        const destination = (
          event: React.DragEvent<HTMLElement>,
        ): WorkspaceDropTarget =>
          dragItem?.kind === 'group'
            ? rowDropTarget(event, identity, true)
            : { ...identity, position: 'inside' }
        const gap = (position: 'before' | 'after') => (
          <DropGap
            target={{ ...identity, position }}
            current={dropTarget}
            enabled={
              dragItem?.kind === 'group' && canDrop({ ...identity, position })
            }
            onOver={onTarget}
            onLeave={onLeave}
            onDrop={onDrop}
          />
        )
        return (
          <Fragment key={group.id}>
            {gap('before')}
            <section
              className={`bookmark-group-panel ${isSameDragItem(dragItem, identity) ? 'drag-source' : ''}`}
              style={{ marginInlineStart: depth * 14 }}
              data-panel-group-id={group.id}
              onContextMenu={(event) => onContext(event, group)}
            >
              <header
                className={`group-panel-header drag-sort-row ${dropClassName(dropTarget, identity)}`}
                draggable
                onDragStart={(event) => onDragStart(event, group)}
                onDragEnd={onDragEnd}
                onDragOver={(event) => {
                  const target = destination(event)
                  onTarget(event, canDrop(target) ? target : null)
                }}
                onDragLeave={onLeave}
                onDrop={(event) => onDrop(event, destination(event))}
              >
                <button
                  className="group-panel-toggle"
                  onClick={() =>
                    setCollapsed((current) => ({
                      ...current,
                      [prefix + group.id]: !current[prefix + group.id],
                    }))
                  }
                  aria-label={`${closed(group.id) ? '展开' : '折叠'}内容分组 ${path}`}
                  aria-expanded={!closed(group.id)}
                >
                  {closed(group.id) ? (
                    <ChevronRight size={15} />
                  ) : (
                    <ChevronDown size={15} />
                  )}
                  <ListTree
                    size={17}
                    style={{
                      color: `color-mix(in srgb, ${group.color} 60%, var(--muted))`,
                    }}
                  />
                  <strong
                    onDoubleClick={(event) => {
                      event.stopPropagation()
                      onEdit(group)
                    }}
                  >
                    {group.name}
                  </strong>
                  <small>{total}</small>
                </button>
                <button
                  className="sort-drag-handle"
                  draggable
                  data-drag-handle
                  aria-label={`拖动内容分组 ${path}`}
                  title="边缘排序，中央嵌套"
                >
                  <GripVertical size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`添加链接到 ${path}`}
                  title="添加链接"
                  onClick={() => onAdd(group.id)}
                >
                  <Plus size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`分组选项 ${path}`}
                  title="分组选项"
                  onClick={(event) => onContext(event, group)}
                >
                  <MoreHorizontal size={18} />
                </button>
              </header>
              {!closed(group.id) && (
                <div
                  className={`group-panel-body ${dropTarget?.id === group.id && dropTarget.position === 'inside' ? 'accepts-drop' : ''}`}
                  onDragOver={(event) => {
                    const target: WorkspaceDropTarget = {
                      ...identity,
                      position: 'inside',
                    }
                    onTarget(event, canDrop(target) ? target : null)
                  }}
                  onDragLeave={onLeave}
                  onDrop={(event) =>
                    onDrop(event, { ...identity, position: 'inside' })
                  }
                >
                  {group.description && (
                    <p className="group-panel-note">{group.description}</p>
                  )}
                  <div className="link-list">{direct.map(renderLink)}</div>
                  {!direct.length && (
                    <button
                      className="group-panel-empty"
                      onClick={() => onAdd(group.id)}
                    >
                      {total
                        ? '链接在下方子分组中 · 点击添加链接'
                        : '暂无链接，拖入链接或点击添加'}
                    </button>
                  )}
                </div>
              )}
            </section>
            {gap('after')}
          </Fragment>
        )
      })}
    </div>
  )
}
