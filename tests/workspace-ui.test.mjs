import { test } from 'node:test'
import assert from 'node:assert/strict'
import { act } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { mountApp } from './ui-harness.mjs'

test('workspace operations undo once, module switching preserves selection/drafts, and JSON restore validates before writing', async () => {
  const ui = await mountApp()
  try {
    const { dom } = ui
    await ui.click(ui.button('新建看板'))
    await ui.fill(document.querySelector('[role="dialog"] input'), '工作流模拟看板')
    await ui.click(ui.button('创建看板'))
    assert.equal(JSON.parse(localStorage.getItem('orbit-boards')).length, 3)
    await ui.click(ui.button('撤销库操作'))
    assert.equal(document.querySelectorAll('[data-board-id]').length, 2)
    await ui.click(ui.button('重命名看板 工程效率'))
    await ui.fill(document.querySelector('[role="dialog"] input'), '尚未保存的名称')
    await ui.click(ui.button('Kubeconfig'))
    await ui.click(ui.button('书签看板'))
    assert.equal(document.querySelector('[role="dialog"] input').value, '尚未保存的名称')
    await ui.click(ui.button('取消'))
    await ui.click(ui.button('备份 JSON'))
    assert.equal(document.querySelector('select[aria-label="导出范围"]').value, 'bookmarks', 'backup defaults must exclude cluster credentials')
    await ui.click(ui.button('清空'))
    const firstLeaf = [...document.querySelectorAll('.exchange-node')].find((item) => item.textContent === 'Google')
    await ui.click(firstLeaf.querySelector('input'))
    const checked = [...document.querySelectorAll('.exchange-tree input:checked')]
    assert.equal(checked.length, 1, 'selecting one leaf must not select sibling records')
    await ui.click(ui.button('取消'))
    const oldBoards = localStorage.getItem('orbit-boards')
    const input = document.querySelector('input[type=file][accept*="json"]')
    const importFile = async (value) => {
      const file = new dom.window.File([''], 'synthetic.backup.json', { type: 'application/json' })
      file.text = async () => JSON.stringify(value)
      Object.defineProperty(input, 'files', { configurable: true, value: [file] })
      await act(() => input.dispatchEvent(new dom.window.Event('change', { bubbles: true })))
    }
    await importFile({ version: 900, boards: [] })
    assert.equal(localStorage.getItem('orbit-boards'), oldBoards)
    assert.equal(document.querySelector('.exchange-modal'), null)
    const synthetic = { version: 2, boards: [{ id: 'imported', name: 'JSON恢复模拟', description: '', tags: [], groups: [{ id: 'g', name: '目录', color: '#123456' }], links: [], updatedAt: '2026-10-29' }] }
    await importFile(synthetic)
    assert.ok(document.querySelector('.exchange-modal'))
    assert.equal(localStorage.getItem('orbit-boards'), oldBoards, 'preview must not change the library')
    await ui.click(ui.button('确认导入 / 恢复'))
    assert.equal(JSON.parse(localStorage.getItem('orbit-boards')).length, 3)
    await ui.click(ui.button('撤销库操作'))
    assert.equal(document.querySelectorAll('[data-board-id]').length, 2)
  } finally { await ui.close() }
})

test('CodeMirror edits preserve original CRLF, mixed newline boundaries, tabs and trailing spaces', async () => {
  const ui = await mountApp()
  try {
    const { applyEditorChanges, rawEditorOffset } = await ui.server.ssrLoadModule('/src/features/commands/InlineCommandEditor.tsx')
    const raw = '# 注释\r\n\techo \'a\'  \n\r\nlast\r'
    const state = EditorState.create({ doc: raw })
    const line = state.doc.line(2)
    const changes = state.changes({ from: line.from + 1, to: line.from + 5, insert: 'printf' })
    assert.equal(applyEditorChanges(raw, changes), '# 注释\r\n\tprintf \'a\'  \n\r\nlast\r')
    assert.equal(raw.slice(rawEditorOffset(raw, line.from), rawEditorOffset(raw, line.to)), '\techo \'a\'  ')
  } finally { await ui.close() }
})

test('inline command autosave waits for composition, preserves failed drafts across tools, and copies the visible draft', async () => {
  const ui = await mountApp()
  try {
    await ui.click(ui.button('命令管理'))
    await act(async () => { await ui.server.ssrLoadModule('/src/features/commands/CommandLibraryView.tsx') })
    const content = document.querySelector('[aria-label="Pod 排查速查 命令正文"]')
    const view = EditorView.findFromDOM(content)
    assert.ok(view)
    const original = view.state.doc.toString()
    await act(async () => {
      content.dispatchEvent(new ui.dom.window.CompositionEvent('compositionstart', { bubbles: true }))
      view.dispatch({ changes: { from: view.state.doc.length, insert: '\n# 选词中' } })
      await new Promise((resolve) => setTimeout(resolve, 500))
    })
    assert.equal(localStorage.getItem('orbit-command-library'), null, 'IME intermediate text must not be committed')
    const setItem = ui.dom.window.Storage.prototype.setItem
    ui.dom.window.Storage.prototype.setItem = function (key, value) { if (key === 'orbit-command-library') throw new Error('quota'); return setItem.call(this, key, value) }
    try {
      await act(async () => { content.dispatchEvent(new ui.dom.window.CompositionEvent('compositionend', { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 500)) })
      assert.match(document.querySelector('.inline-editor-footer').textContent, /保存失败/)
      assert.equal(localStorage.getItem('orbit-command-library'), null)
      await ui.click(ui.button('书签看板'))
      await ui.click(ui.button('命令管理'))
      assert.equal(view.state.doc.toString(), original + '\n# 选词中')
      await ui.click(ui.button('复制整段 Pod 排查速查'))
      assert.equal(ui.copied.at(-1), original + '\n# 选词中')
    } finally { ui.dom.window.Storage.prototype.setItem = setItem }
    await ui.click(ui.button('保存'))
    assert.equal(JSON.parse(localStorage.getItem('orbit-command-library')).snippets[0].content, original + '\n# 选词中')
  } finally { await ui.close() }
})
