import { useMemo } from 'react'
import { ChevronDown, ChevronRight, Folder } from 'lucide-react'
import { bookmarkGroupRows } from '../../shared/bookmarks.mjs'
import type { BookmarkBoard, BookmarkGroup, LinkItem } from '../types'
import { usePersistentState } from '../lib/workspaceStore'

export function BookmarkPanels({
  board,
  links,
  groups,
  search,
  renderLink,
  onEdit,
  onContext,
}: {
  board: BookmarkBoard
  links: LinkItem[]
  groups: BookmarkGroup[]
  search: string
  renderLink: (link: LinkItem) => React.ReactNode
  onEdit: (group: BookmarkGroup) => void
  onContext: (event: React.MouseEvent, group: BookmarkGroup) => void
}) {
  const [view, setView] = usePersistentState('orbit-bookmark-view', 'groups')
  const [collapsed, setCollapsed] = usePersistentState<Record<string, boolean>>(
    'orbit-bookmark-collapse',
    {},
  )
  const rows = useMemo(
    () =>
      bookmarkGroupRows(board.groups).filter((row) =>
        groups.some((item) => item.id === row.group.id),
      ),
    [board.groups, groups],
  )
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
        totals.set(row.parentId, (totals.get(row.parentId) ?? 0) + (totals.get(row.group.id) ?? 0))
    return { direct, totals }
  }, [rows, links])
  const prefix = `${board.id}:`
  return (
    <>
      <div className="content-view-switch" role="group" aria-label="链接视图">
        <button aria-pressed={view === 'groups'} onClick={() => setView('groups')}>
          分组面板
        </button>
        <button aria-pressed={view === 'flat'} onClick={() => setView('flat')}>
          平铺列表
        </button>
      </div>
      {view === 'flat' ? (
        <div className="link-list">{links.map(renderLink)}</div>
      ) : (
        <div className="bookmark-panels">
          {rows.map(({ group, depth, ancestors, path }) => {
            const direct = contents.direct.get(group.id) ?? []
            const total = contents.totals.get(group.id) ?? 0
            if (search && !total) return null
            if (
              !search &&
              ancestors.some(
                (id) => groups.some((item) => item.id === id) && collapsed[prefix + id],
              )
            )
              return null
            const closed = !search && collapsed[prefix + group.id]
            return (
              <section
                className="bookmark-group-panel"
                key={group.id}
                style={{ marginLeft: Math.min(depth, 8) * 18 }}
                onContextMenu={(event) => onContext(event, group)}
              >
                <header>
                  <button
                    className="group-panel-toggle"
                    onClick={() =>
                      setCollapsed((current) => ({
                        ...current,
                        [prefix + group.id]: !current[prefix + group.id],
                      }))
                    }
                    aria-label={`${closed ? '展开' : '折叠'}内容分组 ${path}`}
                    aria-expanded={!closed}
                  >
                    {closed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    <Folder size={16} style={{ color: group.color }} />
                    <strong
                      onDoubleClick={(event) => {
                        event.stopPropagation()
                        onEdit(group)
                      }}
                    >
                      {group.name}
                    </strong>
                    <small>
                      {direct.length} 条{total !== direct.length && ` · 含子组 ${total}`}
                    </small>
                  </button>
                  <button className="inline-control" onClick={() => onEdit(group)}>
                    管理
                  </button>
                </header>
                {!closed && (
                  <>
                    {group.description && <p className="group-panel-note">{group.description}</p>}
                    <div className="link-list">{direct.map(renderLink)}</div>
                    {!direct.length && (
                      <p className="group-panel-empty">
                        {total ? '链接位于下方子分组' : '此分组暂无链接'}
                      </p>
                    )}
                  </>
                )}
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
