import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commandLines, filterCommands, joinCommands, moveCommands, placeCommand, placeCommandFolder, removeCommandFolder } from '../shared/commands.mjs'

const fixture = () => ({ version: 1, groups: [{ id: 'a', name: '开发' }, { id: 'b', name: '数据库' }], snippets: [
  { id: 'one', name: '工作区', content: '# 查看改动\ngit diff\n', description: '提交之前', language: 'bash', groupId: 'a' },
  { id: 'two', name: '资源列表', content: 'SELECT * FROM demo;', description: '', language: 'sql', groupId: 'b' },
  { id: 'three', name: '网络', content: '  Get-NetAdapter', description: '', language: 'powershell', groupId: 'a' },
] })

test('line copying keeps indentation, comments, blank lines, continuations and CRLF boundaries', () => {
  assert.deepEqual(commandLines('# comment\r\nprintf "%s" \\\r\n  "$HOME"\r\n\r\n'), ['# comment', 'printf "%s" \\', '  "$HOME"', '', ''])
  const snippets = fixture().snippets
  assert.equal(joinCommands(snippets), snippets.map((item) => item.content).join('\n\n'))
  assert.equal(joinCommands([]), '')
})
test('search matches command contents, notes and groups, and combines language and folder filters', () => {
  const library = fixture()
  assert.deepEqual(filterCommands(library, { query: '提交之前' }).map((item) => item.id), ['one'])
  assert.deepEqual(filterCommands(library, { query: 'select' }).map((item) => item.id), ['two'])
  assert.deepEqual(filterCommands(library, { query: '开发', language: 'powershell' }).map((item) => item.id), ['three'])
  assert.deepEqual(filterCommands(library, { groupId: 'a', language: 'sql' }), [])
  assert.equal(filterCommands(library, { groupId: '' }).length, 0)
})
test('bulk moves and folder deletion retain all command content and leave the original untouched', () => {
  const library = fixture()
  const moved = moveCommands(library, ['one', 'three'], 'b')
  assert.ok(moved.snippets.every((item) => item.groupId === 'b'))
  const removed = removeCommandFolder(moved, 'b')
  assert.equal(removed.groups.length, 1)
  assert.deepEqual(removed.snippets.map((item) => item.content), library.snippets.map((item) => item.content))
  assert.ok(removed.snippets.every((item) => item.groupId === ''))
  assert.equal(library.snippets[0].groupId, 'a')
  assert.throws(() => moveCommands(library, ['one'], 'missing'), /不存在/)
})
test('drag sorting persists array order and cross-folder insertion adopts the target group', () => {
  const library = fixture()
  const sorted = placeCommand(library, 'three', 'two', 'before')
  assert.deepEqual(sorted.snippets.map((item) => item.id), ['one', 'three', 'two'])
  assert.equal(sorted.snippets[1].groupId, 'b')
  assert.deepEqual(placeCommandFolder(library, 'b', 'a', 'before').groups.map((item) => item.id), ['b', 'a'])
  assert.deepEqual(library.groups.map((item) => item.id), ['a', 'b'])
})
