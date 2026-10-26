import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reorderItems, placeGroupedItem, orderVisibleItems, dropPosition } from '../shared/ordering.mjs'

test('boards and environment groups can reorder in either direction without mutating stored data', () => {
  const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
  assert.deepEqual(reorderItems(items, 'a', 'c', 'after').map((item) => item.id), ['b', 'c', 'a', 'd'])
  assert.deepEqual(reorderItems(items, 'd', 'b', 'before').map((item) => item.id), ['a', 'd', 'b', 'c'])
  assert.equal(reorderItems(items, 'b', 'b', 'before'), items)
  assert.deepEqual(items.map((item) => item.id), ['a', 'b', 'c', 'd'])
  assert.throws(() => reorderItems(items, 'missing', 'c', 'after'), /不存在/)
  assert.throws(() => reorderItems(items, 'a', 'c', 'inside'), /位置无效/)
})

test('config row insertion also adopts the target group, preserving other metadata', () => {
  const items = [{ id: 'a', groupId: 'dev', path: '/tmp/synthetic-a' }, { id: 'b', groupId: 'prod', path: '/tmp/synthetic-b' }]
  const result = placeGroupedItem(items, 'a', 'b', 'after')
  assert.deepEqual(result, [items[1], { ...items[0], groupId: 'prod' }])
  assert.equal(items[0].groupId, 'dev')
})

test('switching from automatic sorting freezes the visible order while retaining hidden rows', () => {
  const items = ['a', 'hidden', 'b', 'c'].map((id) => ({ id }))
  const manual = orderVisibleItems(items, ['c', 'b', 'a'])
  assert.deepEqual(manual.map((item) => item.id), ['c', 'hidden', 'b', 'a'])
  assert.deepEqual(reorderItems(manual, 'a', 'c', 'before').map((item) => item.id), ['a', 'c', 'hidden', 'b'])
  assert.throws(() => orderVisibleItems(items, ['a', 'a']), /无效/)
})

test('folder hit zones distinguish sibling insertion from nesting with stable boundaries', () => {
  assert.deepEqual([0, .24, .25, .5, .75, .76, 1].map((ratio) => dropPosition(ratio, true)), ['before', 'before', 'inside', 'inside', 'inside', 'after', 'after'])
  assert.deepEqual([0, .49, .5, 1].map((ratio) => dropPosition(ratio)), ['before', 'before', 'after', 'after'])
})
