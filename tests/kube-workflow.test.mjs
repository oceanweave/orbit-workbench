import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mountApp } from './ui-harness.mjs'

test('explicit default namespace is retained and a failed file save retains every draft field', async () => {
  const ui = await mountApp({}, { writeKubeconfigFile: async () => { throw new Error('模拟：文件不可写') } })
  try {
    await ui.click(ui.button('Kubeconfig'))
    const namespace = [...document.querySelectorAll('.command-form label')].find((item) => item.textContent.startsWith('命名空间')).querySelector('input')
    await ui.fill(namespace, 'default')
    assert.match(document.querySelector('.command-preview pre').textContent, /-n (?:'default'|default)/, 'literal default cannot mean inherit team-a')
    await ui.click(ui.button('查看配置详情'))
    await ui.click(ui.button('编辑原始内容'))
    const dialog = document.querySelector('[role="dialog"]')
    const draft = dialog.querySelector('textarea').value.replace('https://', 'https://edited-')
    await ui.fill(dialog.querySelector('textarea'), draft)
    await ui.fill(dialog.querySelector('input'), '保留草稿名称')
    await ui.click(ui.button('保存详情'))
    assert.ok(document.querySelector('[role="dialog"]'), 'save rejection must not close the editor')
    assert.equal(document.querySelector('[role="dialog"] textarea').value, draft)
    assert.equal(document.querySelector('[role="dialog"] input').value, '保留草稿名称')
    assert.match(document.querySelector('[role="alert"]').textContent, /不可写/)
  } finally { await ui.close() }
})

test('metadata quota failure after a complete file write retains the draft and retries without writing the source twice', async () => {
  let writes = 0
  const ui = await mountApp({}, { writeKubeconfigFile: async (input) => { writes++; return input } })
  try {
    await ui.click(ui.button('Kubeconfig'))
    await ui.click(ui.button('查看配置详情'))
    await ui.click(ui.button('编辑原始内容'))
    const textarea = document.querySelector('[role="dialog"] textarea')
    const draft = textarea.value.replace('https://', 'https://modified-')
    await ui.fill(textarea, draft)
    const setItem = ui.dom.window.Storage.prototype.setItem
    ui.dom.window.Storage.prototype.setItem = function (key, value) { if (key === 'orbit-kube-configs') throw new Error('quota'); return setItem.call(this, key, value) }
    try {
      await ui.click(ui.button('保存详情'))
      assert.equal(writes, 1)
      assert.match(document.querySelector('[role="alert"]').textContent, /源文件已完整写回/)
      assert.equal(document.querySelector('[role="dialog"] textarea').value, draft)
    } finally { ui.dom.window.Storage.prototype.setItem = setItem }
    await ui.click(ui.button('保存详情'))
    assert.equal(writes, 1)
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(JSON.parse(localStorage.getItem('orbit-kube-configs'))[0].content, draft)
  } finally { await ui.close() }
})

test('single-file import is one undoable operation without a preflight write bypassing history', async () => {
  let file
  const ui = await mountApp({}, { pickKubeconfigFile: async () => file, kubeconfigDirectory: async () => '/synthetic-only' })
  try {
    const { initialKubeConfigs } = await ui.server.ssrLoadModule('/src/data.ts')
    file = { path: '/synthetic-only/example.txt', content: initialKubeConfigs[0].content }
    await ui.click(ui.button('Kubeconfig'))
    await ui.click(ui.button('导入 kubeconfig'))
    await ui.click(document.querySelector('.import-picker'))
    await ui.click(document.querySelector('[role="dialog"] .import-footer .primary-button'))
    assert.equal(JSON.parse(localStorage.getItem('orbit-kube-configs')).length, initialKubeConfigs.length + 1)
    await ui.click(ui.button('撤销库操作'))
    const restored = JSON.parse(localStorage.getItem('orbit-kube-configs') || JSON.stringify(initialKubeConfigs))
    assert.equal(restored.length, initialKubeConfigs.length)
    assert.ok(restored.every((item) => item.path !== file.path))
  } finally { await ui.close() }
})
