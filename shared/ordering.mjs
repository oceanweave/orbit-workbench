// Array order is the persisted manual order. Moving one visible row leaves
// filtered-out rows in place relative to one another.
export function reorderItems(items, sourceId, targetId, position) {
  if (!['before', 'after'].includes(position)) throw new Error('排序位置无效')
  if (!items.some((item) => item.id === sourceId) || !items.some((item) => item.id === targetId)) throw new Error('排序条目不存在')
  if (sourceId === targetId) return items
  const source = items.find((item) => item.id === sourceId)
  const remaining = items.filter((item) => item.id !== sourceId)
  const index = remaining.findIndex((item) => item.id === targetId) + (position === 'after' ? 1 : 0)
  return [...remaining.slice(0, index), source, ...remaining.slice(index)]
}

export function placeGroupedItem(items, sourceId, targetId, position) {
  const target = items.find((item) => item.id === targetId)
  const ordered = reorderItems(items, sourceId, targetId, position)
  return ordered.map((item) => item.id === sourceId ? { ...item, groupId: target.groupId } : item)
}

export function placeGroupedItems(items, sourceIds, targetId, position) {
  if (!['before', 'after'].includes(position)) throw new Error('排序位置无效')
  const ids = new Set(sourceIds)
  if (ids.has(targetId)) return items
  const target = items.find((item) => item.id === targetId)
  if (!target) throw new Error('目标条目不存在')
  const moving = items.filter((item) => ids.has(item.id)).map((item) => ({ ...item, groupId: target.groupId }))
  if (!moving.length) throw new Error('源条目不存在')
  const remaining = items.filter((item) => !ids.has(item.id))
  const index = remaining.findIndex((item) => item.id === targetId) + (position === 'after' ? 1 : 0)
  return [...remaining.slice(0, index), ...moving, ...remaining.slice(index)]
}

// Materialize a sorted/filtered view before the first manual drag. Hidden rows
// keep their slots; the rows the user can see start in their on-screen order.
export function orderVisibleItems(items, visibleIds) {
  const byId = new Map(items.map((item) => [item.id, item]))
  const ids = new Set(visibleIds)
  if (ids.size !== visibleIds.length || visibleIds.some((id) => !byId.has(id))) throw new Error('可见条目无效')
  let offset = 0
  return items.map((item) => ids.has(item.id) ? byId.get(visibleIds[offset++]) : item)
}

// Folder edges insert siblings; its middle creates a child. Flat collections
// use two halves. Kept independent of DOM coordinates for boundary tests.
export function dropPosition(fraction, nested = false) {
  if (nested) return fraction < .25 ? 'before' : fraction > .75 ? 'after' : 'inside'
  return fraction < .5 ? 'before' : 'after'
}
