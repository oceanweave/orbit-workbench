import { placeGroupedItem, reorderItems } from './ordering.mjs'

// Logical lines, including blank lines and the final newline. Never add prompts,
// trim indentation, remove comments or interpret shell continuations when copying.
export const commandLines = (content) => content.split(/\r\n|\n|\r/)
export const joinCommands = (snippets) => snippets.map((item) => item.content).join('\n\n')

export function filterCommands(library, { groupId = 'all', query = '', language = 'all' } = {}) {
  const needle = query.trim().toLocaleLowerCase()
  const groups = new Map(library.groups.map((group) => [group.id, group.name]))
  return library.snippets.filter((item) =>
    (groupId === 'all' || item.groupId === groupId) &&
    (language === 'all' || item.language === language) &&
    (!needle || [item.name, item.description, item.content, groups.get(item.groupId) ?? '未分组'].join('\n').toLocaleLowerCase().includes(needle)),
  )
}

export function moveCommands(library, ids, groupId) {
  if (groupId !== '' && !library.groups.some((group) => group.id === groupId)) throw new Error('目标分组不存在')
  const selected = new Set(ids)
  return { ...library, snippets: library.snippets.map((item) => selected.has(item.id) ? { ...item, groupId } : item) }
}

export function removeCommandFolder(library, groupId) {
  // Deleting a folder must never implicitly delete the command contents.
  return { ...moveCommands(library, library.snippets.filter((item) => item.groupId === groupId).map((item) => item.id), ''), groups: library.groups.filter((item) => item.id !== groupId) }
}

export function placeCommand(library, sourceId, targetId, position) {
  return { ...library, snippets: placeGroupedItem(library.snippets, sourceId, targetId, position) }
}

export function placeCommandFolder(library, sourceId, targetId, position) {
  return { ...library, groups: reorderItems(library.groups, sourceId, targetId, position) }
}
