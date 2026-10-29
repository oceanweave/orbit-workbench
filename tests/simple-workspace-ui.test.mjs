import test from 'node:test'
import assert from 'node:assert/strict'
import { act } from 'react'
import { mountApp } from './ui-harness.mjs'

test('compact links open once, double-click edits without opening, and retain hidden legacy metadata', async () => {
  const ui = await mountApp()
  try {
    const opened = []
    ui.dom.window.open = (...args) => {
      opened.push(args)
      return null
    }
    const original = await ui.server.ssrLoadModule('/src/data.ts')
    const originalTags = original.initialBoards[0].links.find(
      (link) => link.id === 'link-google',
    ).tags
    const row = () => document.querySelector('[data-link-id="link-google"]')
    assert.equal(
      row().querySelector('input, select, textarea'),
      null,
      'normal browsing rows must not contain editing controls',
    )
    assert.equal(
      document.querySelector(
        '.tag-filter-dropdown, .config-tag-filter, .tag-trigger',
      ),
      null,
    )
    await act(async () => {
      const main = row().querySelector('.simple-link-main')
      main.dispatchEvent(
        new ui.dom.window.MouseEvent('click', { bubbles: true, detail: 1 }),
      )
      main.dispatchEvent(
        new ui.dom.window.MouseEvent('click', { bubbles: true, detail: 2 }),
      )
      main.dispatchEvent(
        new ui.dom.window.MouseEvent('dblclick', { bubbles: true, detail: 2 }),
      )
      await new Promise((resolve) => setTimeout(resolve, 310))
    })
    assert.equal(
      opened.length,
      0,
      'editing must cancel the first click browser launch',
    )
    assert.equal(
      document.querySelector('[role="dialog"]').getAttribute('aria-label'),
      '编辑链接',
    )
    await ui.fill(
      document.querySelector('input[aria-label="链接名称"]'),
      '模拟资料入口',
    )
    await ui.fill(
      document.querySelector('input[aria-label="链接地址"]'),
      'https://example.invalid/new',
    )
    await ui.fill(
      document.querySelector('textarea[aria-label="链接备注"]'),
      '完整备注\n第二行',
    )
    await act(() =>
      document
        .querySelector('input[aria-label="链接名称"]')
        .dispatchEvent(
          new ui.dom.window.KeyboardEvent('keydown', {
            bubbles: true,
            key: 'Enter',
            ctrlKey: true,
            isComposing: true,
          }),
        ),
    )
    assert.ok(
      document.querySelector('[role="dialog"]'),
      'IME confirmation cannot save the dialog',
    )
    await ui.click(ui.button('保存修改'))
    const saved = JSON.parse(
      localStorage.getItem('orbit-boards'),
    )[0].links.find((link) => link.id === 'link-google')
    assert.equal(saved.title, '模拟资料入口')
    assert.equal(saved.url, 'https://example.invalid/new')
    assert.equal(saved.description, '完整备注\n第二行')
    assert.deepEqual(
      saved.tags,
      originalTags,
      'removing tag management must not delete existing data',
    )
    await ui.click(ui.button('展开 模拟资料入口 信息'))
    assert.match(row().textContent, /完整备注\n第二行/)
    await ui.click(ui.button('复制链接 模拟资料入口'))
    assert.equal(ui.copied.at(-1), saved.url)
    assert.equal(opened.length, 0)
    await act(async () => {
      row()
        .querySelector('.simple-link-main')
        .dispatchEvent(
          new ui.dom.window.MouseEvent('click', { bubbles: true, detail: 1 }),
        )
      await new Promise((resolve) => setTimeout(resolve, 310))
    })
    assert.equal(opened.length, 1)
    assert.equal(opened[0][0], saved.url)
  } finally {
    await ui.close()
  }
})

test('group panels and config groups share real drag destinations; selecting a config drives its command', async () => {
  const ui = await mountApp()
  const drag = async (source, target, fraction = 0.5) => {
    const transfer = { setData() {}, setDragImage() {} }
    const fire = (type, element) => {
      const event = new ui.dom.window.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100 + fraction * 100,
      })
      Object.defineProperty(event, 'dataTransfer', { value: transfer })
      element.dispatchEvent(event)
    }
    target.getBoundingClientRect = () => ({
      top: 100,
      bottom: 200,
      left: 0,
      right: 300,
      width: 300,
      height: 100,
    })
    await act(() => fire('dragstart', source))
    await act(() => fire('dragover', target))
    assert.ok(
      target.className.includes('drop-'),
      'the destination must display a drop indicator',
    )
    await act(() => fire('drop', target))
    await act(() => fire('dragend', source))
    await new Promise((resolve) => setTimeout(resolve, 210))
  }
  try {
    await drag(
      ui.button('拖动内容分组 学习资料'),
      document.querySelector('[data-panel-group-id="group-tools"] > header'),
      0.1,
    )
    assert.equal(
      JSON.parse(localStorage.getItem('orbit-boards'))[0].groups[0].id,
      'group-learning',
    )
    await ui.click(ui.button('Kubeconfig'))
    assert.equal(
      document.querySelector('.config-list'),
      null,
      'there must not be a third config list column',
    )
    const local = [...document.querySelectorAll('[data-config-id]')].find(
      (row) => row.textContent.includes('local-kind'),
    )
    await ui.click(local.querySelector('.config-select-main'))
    assert.match(
      document.querySelector('.command-preview pre').textContent,
      /kind\.config/,
    )
    assert.equal(
      document.querySelector('input[aria-label="环境变量名称"]').value,
      'KIND',
    )
    const workGroup = [
      ...document.querySelectorAll('[data-kube-group-id]'),
    ].find((row) => row.textContent.includes('工作集群'))
    await drag(local.querySelector('[data-drag-handle]'), workGroup)
    const saved = JSON.parse(localStorage.getItem('orbit-kube-configs')).find(
      (config) => config.name === 'local-kind',
    )
    assert.equal(saved.groupId, workGroup.dataset.kubeGroupId)
    assert.ok(
      document
        .querySelector(`[data-kube-group-id="${saved.groupId}"]`)
        .parentElement.querySelector(`[data-config-id="${saved.id}"]`),
    )
    await ui.click(ui.button('导入 kubeconfig'))
    const dialog = document.querySelector('[role="dialog"]')
    assert.equal(dialog.querySelector('[aria-label="导入配置标签"]'), null)
    assert.equal(dialog.querySelectorAll('[role="tab"]').length, 3)
  } finally {
    await ui.close()
  }
})

test('search ignores legacy tag values while bookmark backup metadata stays intact', async () => {
  const boards = [
    {
      id: 'b',
      name: '模拟看板',
      description: '',
      tags: ['private-legacy-marker'],
      updatedAt: '',
      groups: [{ id: 'g', name: '模拟分组', color: '#527a66' }],
      links: [
        {
          id: 'l',
          title: '测试链接',
          url: 'https://example.invalid/',
          description: '可搜索备注',
          groupId: 'g',
          tags: ['private-legacy-marker'],
          addedAt: '',
        },
      ],
    },
  ]
  const ui = await mountApp({ 'orbit-boards': boards })
  try {
    const search = document.querySelector('.global-search input')
    await ui.fill(search, 'private-legacy-marker')
    assert.equal(document.querySelectorAll('[data-link-id]').length, 0)
    await act(() =>
      search.dispatchEvent(
        new ui.dom.window.KeyboardEvent('keydown', {
          bubbles: true,
          key: 'Enter',
        }),
      ),
    )
    assert.equal(document.querySelectorAll('.search-result-card').length, 0)
    assert.equal(
      JSON.parse(localStorage.getItem('orbit-boards'))[0].links[0].tags[0],
      'private-legacy-marker',
    )
  } finally {
    await ui.close()
  }
})

test('removing a kubeconfig group preserves records and can be undone as one operation', async () => {
  const ui = await mountApp()
  try {
    await ui.click(ui.button('Kubeconfig'))
    const { initialKubeConfigs } = await ui.server.ssrLoadModule('/src/data.ts')
    const readConfigs = () => JSON.parse(localStorage.getItem('orbit-kube-configs') || JSON.stringify(initialKubeConfigs))
    const before = readConfigs()
    await ui.click(ui.button('环境分组选项 工作集群'))
    await ui.click(ui.button('删除分组（保留配置）'))
    await ui.click(ui.button('确认删除'))
    assert.equal(
      document.querySelectorAll('[data-config-id]').length,
      before.length,
    )
    assert.equal(
      JSON.parse(localStorage.getItem('orbit-kube-groups')).length,
      1,
    )
    await ui.click(ui.button('撤销库操作'))
    assert.equal(document.querySelectorAll('[data-kube-group-id]').length, 2)
    assert.deepEqual(
      readConfigs(),
      before,
    )
    for (const config of before) {
      const header = document.querySelector(`[data-kube-group-id="${config.groupId}"]`)
      assert.ok(header.parentElement.querySelector(`[data-config-id="${config.id}"]`))
    }
  } finally {
    await ui.close()
  }
})
