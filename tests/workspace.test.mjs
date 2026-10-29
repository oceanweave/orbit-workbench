import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateBackup, selectBookmarks, mergeBackup, independentGroup } from '../shared/workspace.mjs'
const board = { id: 'board', name: '模拟资料', description: '', tags: ['test'], updatedAt: '2026-10-29', groups: [{ id: 'root', name: '根', color: '#123456' }, { id: 'child', name: '子', parentId: 'root', color: '#345678' }, { id: 'other', name: '同名', color: '#456789' }], links: [{ id: 'a', title: 'a', url: 'https://a.invalid', groupId: 'child', tags: ['test'], description: 'notes', addedAt: '2026-10-29' }, { id: 'b', title: 'b', url: 'https://b.invalid', groupId: 'other', tags: [], addedAt: '2026-10-29' }] }
test('selection keeps necessary ancestors and excludes unchecked siblings', () => {
  const selected = selectBookmarks([board], ['a'])[0]
  assert.deepEqual(selected.groups.map((group) => group.id), ['root', 'child'])
  assert.deepEqual(selected.links.map((link) => link.id), ['a'])
  assert.deepEqual(selectBookmarks([board], ['other'])[0].groups.map((group) => group.id), ['other'])
  assert.equal(selectBookmarks([board], []).length, 0)
})
test('version and references are validated before restore; malicious fields and cycles are rejected', () => {
  assert.ok(validateBackup({ version: 1, boards: [board] }))
  for (const value of [{ version: 99, boards: [] }, { version: 2, boards: [{ ...board, links: [{ ...board.links[0], groupId: 'missing' }] }] }, { version: 2, boards: [{ ...board, groups: board.groups.map((group) => group.id === 'root' ? { ...group, parentId: 'child' } : group) }] }, JSON.parse('{"version":2,"boards":[],"__proto__":{}}')]) assert.throws(() => validateBackup(value))
})
test('merge remaps IDs and group references; moving a subtree keeps IDs and metadata', () => {
  const current = { version: 2, boards: [board] }
  const merged = mergeBackup(current, current)
  const copy = merged.boards[1]
  assert.notEqual(copy.id, board.id)
  assert.ok(copy.links.every((link) => copy.groups.some((group) => group.id === link.groupId)))
  assert.equal(copy.links[0].description, 'notes')
  assert.deepEqual(current.boards[0], board)
  const moved = independentGroup(board, 'root', { name: '新看板', categoryId: 'category' })
  assert.deepEqual(moved.board.groups.map((group) => group.id), ['root', 'child'])
  assert.equal(moved.board.categoryId, 'category')
  assert.equal(moved.board.links[0].id, 'a')
  assert.deepEqual(moved.source.links.map((link) => link.id), ['b'])
  const copied = independentGroup(board, 'root', { name: '副本', copy: true })
  assert.equal(copied.source, board)
  assert.notEqual(copied.board.links[0].id, 'a')
})
