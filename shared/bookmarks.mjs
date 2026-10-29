import { reorderItems, placeGroupedItems } from './ordering.mjs'

const id = (prefix) => `${prefix}-${globalThis.crypto.randomUUID()}`
const timestamp = () => new Date().toISOString()
const palette = ['#6f8cff', '#44c7a5', '#f2ab55', '#c486ff']
const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Keep the stored collection flat and derive its tree. Old groups with no parentId
// remain roots; dangling parents and accidental cycles cannot hide any folders.
export function bookmarkGroupRows(groups) {
  const byId = new Map(groups.map((group) => [group.id, group]))
  const parents = new Map(groups.map((group) => [group.id, byId.has(group.parentId) && group.parentId !== group.id ? group.parentId : undefined]))
  for (const group of groups) {
    const seen = new Set([group.id])
    let parent = parents.get(group.id)
    while (parent) {
      if (seen.has(parent)) { parents.set(group.id, undefined); break }
      seen.add(parent)
      parent = parents.get(parent)
    }
  }
  const children = new Map()
  for (const group of groups) {
    const parent = parents.get(group.id)
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent).push(group)
  }
  const stack = [...(children.get(undefined) || [])].reverse().map((group) => ({ group, depth: 0, path: group.name, ancestors: [] }))
  const rows = []
  while (stack.length) {
    const row = stack.pop()
    rows.push({ ...row, parentId: parents.get(row.group.id), hasChildren: Boolean(children.get(row.group.id)?.length) })
    for (const group of [...(children.get(row.group.id) || [])].reverse()) {
      stack.push({ group, depth: row.depth + 1, path: `${row.path} / ${group.name}`, ancestors: [...row.ancestors, row.group.id] })
    }
  }
  return rows
}

export function bookmarkDescendantIds(groups, groupId) {
  return new Set(bookmarkGroupRows(groups).filter((row) => row.group.id === groupId || row.ancestors.includes(groupId)).map((row) => row.group.id))
}

export function bookmarkGroupPath(groups, groupId) {
  return bookmarkGroupRows(groups).find((row) => row.group.id === groupId)?.path || '未分组'
}

export function reparentBookmarkGroup(board, groupId, parentId) {
  if (!board.groups.some((group) => group.id === groupId)) throw new Error('分组不存在')
  if (parentId && !board.groups.some((group) => group.id === parentId)) throw new Error('目标分组不存在')
  if (parentId && bookmarkDescendantIds(board.groups, groupId).has(parentId)) throw new Error('不能将分组移动到自己或自己的子分组中')
  return { ...board, updatedAt: timestamp(), groups: board.groups.map((group) => group.id === groupId ? { ...group, parentId: parentId || undefined } : group) }
}

// Removing one folder preserves its descendants, promoting them one level.
// Direct bookmarks move to the parent or an available root folder.
export function deleteBookmarkGroup(board, groupId) {
  const row = bookmarkGroupRows(board.groups).find((item) => item.group.id === groupId)
  if (!row) return board
  let groups = board.groups.filter((group) => group.id !== groupId).map((group) => group.parentId === groupId ? { ...group, parentId: row.parentId } : group)
  if (!groups.length) groups = [{ id: id('group'), name: '未分组', color: palette[0] }]
  const fallbackId = row.parentId || bookmarkGroupRows(groups)[0].group.id
  return { ...board, updatedAt: timestamp(), groups, links: board.links.map((link) => link.groupId === groupId ? { ...link, groupId: fallbackId } : link) }
}

export function moveBookmarkLinks(boards, sourceBoardId, linkIds, targetBoardId, targetGroupId) {
  const source = boards.find((board) => board.id === sourceBoardId)
  const target = boards.find((board) => board.id === targetBoardId)
  if (!source || !target) throw new Error('源看板或目标看板不存在')
  const groupId = targetGroupId || target.groups[0]?.id || id('group')
  if (target.groups.length && !target.groups.some((group) => group.id === groupId)) throw new Error('目标分组不存在')
  const selected = new Set(linkIds)
  const links = source.links.filter((link) => selected.has(link.id)).map((link) => ({ ...link, groupId }))
  if (!links.length) return { boards, groupId, count: 0 }
  const updatedAt = timestamp()
  const groups = target.groups.length ? target.groups : [{ id: groupId, name: '未分组', color: palette[0] }]
  const result = boards.map((board) => {
    if (board.id === sourceBoardId && board.id === targetBoardId) return { ...board, groups, updatedAt, links: board.links.map((link) => selected.has(link.id) ? { ...link, groupId } : link) }
    if (board.id === sourceBoardId) return { ...board, updatedAt, links: board.links.filter((link) => !selected.has(link.id)) }
    if (board.id === targetBoardId) return { ...board, groups, updatedAt, links: [...links, ...board.links] }
    return board
  })
  return { boards: result, groupId, count: links.length }
}

// A folder is moved as one subtree, including its links. Edge drops adopt the
// target's parent; middle drops adopt the target itself. IDs remain stable.
export function placeBookmarkGroup(boards, sourceBoardId, groupId, targetBoardId, targetGroupId, position = 'inside') {
  if (!['before', 'after', 'inside'].includes(position)) throw new Error('放置位置无效')
  const source = boards.find((board) => board.id === sourceBoardId)
  const target = boards.find((board) => board.id === targetBoardId)
  if (!source || !target) throw new Error('源看板或目标看板不存在')
  const sourceRows = bookmarkGroupRows(source.groups)
  const root = sourceRows.find((row) => row.group.id === groupId)
  if (!root) throw new Error('源分组不存在')
  const ids = bookmarkDescendantIds(source.groups, groupId)
  if (sourceBoardId === targetBoardId && ids.has(targetGroupId)) throw new Error('不能移入自己或自己的子分组')
  const targetRow = bookmarkGroupRows(target.groups).find((row) => row.group.id === targetGroupId)
  if (targetGroupId && !targetRow) throw new Error('目标分组不存在')
  if (!targetGroupId && position !== 'inside') throw new Error('请选择目标分组')
  if (sourceBoardId !== targetBoardId && target.groups.some((group) => ids.has(group.id))) throw new Error('目标看板存在重复的分组编号')
  const parentId = position === 'inside' ? targetRow?.group.id : targetRow?.parentId
  const moving = sourceRows.filter((row) => ids.has(row.group.id)).map((row) => ({ ...row.group, parentId: row.group.id === groupId ? parentId : row.parentId }))
  const remaining = bookmarkGroupRows(target.groups).filter((row) => sourceBoardId !== targetBoardId || !ids.has(row.group.id)).map((row) => ({ ...row.group, parentId: row.parentId }))
  let index = remaining.length
  if (targetRow) {
    if (position === 'before') index = remaining.findIndex((group) => group.id === targetGroupId)
    else {
      const targetSubtree = bookmarkDescendantIds(remaining, targetGroupId)
      index = remaining.reduce((last, group, offset) => targetSubtree.has(group.id) ? offset + 1 : last, 0)
    }
  }
  const groups = [...remaining.slice(0, index), ...moving, ...remaining.slice(index)]
  const movingLinks = source.links.filter((link) => ids.has(link.groupId))
  const updatedAt = timestamp()
  return boards.map((board) => {
    if (board.id === targetBoardId) return { ...board, groups, updatedAt, links: sourceBoardId === targetBoardId ? board.links : [...board.links, ...movingLinks] }
    if (board.id === sourceBoardId) return { ...board, updatedAt, groups: board.groups.filter((group) => !ids.has(group.id)), links: board.links.filter((link) => !ids.has(link.groupId)) }
    return board
  })
}

export function placeBookmarkLink(boards, sourceBoardId, linkId, targetBoardId, targetLinkId, position) {
  const target = boards.find((board) => board.id === targetBoardId)?.links.find((link) => link.id === targetLinkId)
  if (!target) throw new Error('目标链接不存在')
  const ids = Array.isArray(linkId) ? linkId : [linkId]
  if (sourceBoardId === targetBoardId && ids.includes(targetLinkId)) return boards
  const moved = moveBookmarkLinks(boards, sourceBoardId, ids, targetBoardId, target.groupId)
  if (!moved.count) throw new Error('源链接不存在')
  return moved.boards.map((board) => board.id === targetBoardId ? { ...board, links: placeGroupedItems(board.links, ids, targetLinkId, position) } : board)
}

export function createBrowserBookmarksHtml(boards) {
  const dateAttribute = (value) => {
    const number = Math.floor(new Date(value).getTime() / 1000)
    return Number.isFinite(number) && number > 0 ? ` ADD_DATE="${number}"` : ''
  }
  const linkMarkup = (link) => `<DT><A HREF="${escape(link.url)}"${dateAttribute(link.addedAt)}>${escape(link.title || link.url)}</A>${link.description ? `\n<DD>${escape(link.description)}` : ''}`
  const folders = boards.map((board) => {
    const rows = bookmarkGroupRows(board.groups)
    const groups = new Map(), links = new Map()
    for (const row of rows) {
      if (!groups.has(row.parentId)) groups.set(row.parentId, [])
      groups.get(row.parentId).push(row.group)
    }
    for (const link of board.links) {
      if (!links.has(link.groupId)) links.set(link.groupId, [])
      links.get(link.groupId).push(link)
    }
    const renderFolder = (group) => `<DT><H3>${escape(group.name)}</H3>\n<DL><p>\n${(links.get(group.id) || []).map(linkMarkup).join('\n')}\n${(groups.get(group.id) || []).map(renderFolder).join('\n')}\n</DL><p>`
    const known = new Set(board.groups.map((group) => group.id))
    const looseLinks = board.links.filter((link) => !known.has(link.groupId)).map(linkMarkup).join('\n')
    return `<DT><H3${dateAttribute(board.updatedAt)}>${escape(board.name)}</H3>\n<DL><p>\n${looseLinks}\n${(groups.get(undefined) || []).map(renderFolder).join('\n')}\n</DL><p>`
  })
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Orbit Workbench Bookmarks</TITLE>\n<H1>Orbit Workbench Bookmarks</H1>\n<DL><p>\n${folders.join('\n')}\n</DL><p>\n`
}

export function parseBookmarksHtml(html, createDocument = (source) => new DOMParser().parseFromString(source, 'text/html')) {
  if (new TextEncoder().encode(html).length > 20 * 1024 * 1024) throw new Error('书签文件超过 20 MB，请拆分导入；当前库未改变')
  const document = createDocument(html)
  const root = document.querySelector('dl')
  if (!root) return []
  if (root.querySelectorAll('dt').length > 100000) throw new Error('书签节点超过 100000 个，请拆分导入；当前库未改变')
  // Browsers produce both DL-inside-DT and sibling-DL forms of Netscape HTML.
  const entries = (dl) => Array.from(dl.children).filter((child) => child.tagName === 'DT').map((child) => {
    let nested = child.querySelector(':scope > dl')
    let sibling = child.nextElementSibling
    while (!nested && sibling?.tagName === 'P' && !sibling.children.length) sibling = sibling.nextElementSibling
    if (!nested && sibling?.tagName === 'DL') nested = sibling
    return { heading: child.querySelector(':scope > h3'), anchor: child.querySelector(':scope > a'), nested, description: child.querySelector(':scope > dd')?.textContent || (child.nextElementSibling?.tagName === 'DD' ? child.nextElementSibling.textContent : '') }
  })
  const boards = []
  const makeBoard = (name, dl, directEntries) => {
    const board = { id: id('board'), name, description: '从浏览器书签导入', tags: ['导入'], groups: [], links: [], updatedAt: timestamp() }
    let looseGroup
    const visit = (items, parentId, depth = 0) => {
      if (depth > 64) throw new Error(`文件夹嵌套超过 64 层，位置：${board.groups.find((item) => item.id === parentId)?.name || board.name}；本次未导入`)
      for (const item of items) {
        if (item.heading) {
          const group = { id: id('group'), name: item.heading.textContent.trim() || '未命名分组', color: palette[board.groups.length % palette.length], ...(parentId ? { parentId } : {}) }
          board.groups.push(group)
          if (item.nested) visit(entries(item.nested), group.id, depth + 1)
        } else if (item.anchor) {
          const url = item.anchor.getAttribute('href') || ''
          if (!url) continue
          let groupId = parentId
          if (!groupId) {
            if (!looseGroup) { looseGroup = { id: id('group'), name: '未分组', color: palette[2] }; board.groups.push(looseGroup) }
            groupId = looseGroup.id
          }
          const seconds = Number(item.anchor.getAttribute('add_date'))
          const addedAt = Number.isFinite(seconds) && seconds > 0 && seconds < 8640000000000 ? new Date(seconds * 1000).toISOString() : timestamp()
          board.links.push({ id: id('link'), title: item.anchor.textContent.trim() || url, url, groupId, tags: [], description: item.description?.trim() || '从浏览器书签导入', addedAt })
        }
      }
    }
    visit(directEntries || (dl ? entries(dl) : []))
    return board
  }
  const top = entries(root)
  for (const item of top) if (item.heading) boards.push(makeBoard(item.heading.textContent.trim() || '导入看板', item.nested))
  const loose = top.filter((item) => item.anchor)
  if (loose.length) boards.push(makeBoard('导入书签', undefined, loose))
  return boards
}

export function bookmarkSearchBoard(results, name) {
  const board = { id: id('board'), name, description: '从搜索结果创建，保留原目录层级', tags: ['搜索结果'], groups: [], links: [], updatedAt: timestamp() }
  const sources = new Map()
  for (const { board: source, link } of results) {
    if (!sources.has(source.id)) {
      const root = { id: id('group'), name: source.name, color: palette[0] }
      board.groups.push(root)
      sources.set(source.id, { root, cloned: new Map(), rows: bookmarkGroupRows(source.groups) })
    }
    const state = sources.get(source.id)
    const row = state.rows.find((item) => item.group.id === link.groupId)
    let parentId = state.root.id
    for (const sourceId of row ? [...row.ancestors, row.group.id] : []) {
      if (!state.cloned.has(sourceId)) {
        const original = state.rows.find((item) => item.group.id === sourceId).group
        const group = { ...original, id: id('group'), parentId }
        board.groups.push(group)
        state.cloned.set(sourceId, group)
      }
      parentId = state.cloned.get(sourceId).id
    }
    board.links.push({ ...link, id: id('link'), groupId: parentId })
  }
  return board
}
