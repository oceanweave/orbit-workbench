import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import { createElement, act } from 'react'

test('command library: CRUD, exact copy, composition-safe submission, drag, bulk actions, persistence and failed save recovery', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true, url: 'https://command-library-test.invalid/' })
  dom.window.Range.prototype.getClientRects = () => []
  dom.window.Range.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 })
  const saved = new Map()
  const copied = []
  Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async (text) => { copied.push(text) } } })
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, Window: dom.window.Window, navigator: dom.window.navigator, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
  let root
  try {
    const { default: App } = await server.ssrLoadModule('/src/App.tsx')
    const { highlightedLines } = await server.ssrLoadModule('/src/features/commands/CommandCode.tsx')
    // Multiline grammar tokens must survive splitting into line-copy controls.
    for (const language of ['bash', 'powershell', 'python', 'sql', 'javascript', 'yaml', 'json', 'text']) {
      const text = '# note\n  echo "line one\nline two"\n<script>alert(1)</script>\n'
      assert.equal(highlightedLines(text, language).map((line) => line.map((segment) => segment.text).join('')).join('\n'), text)
    }
    const { createRoot } = await import('react-dom/client')
    root = createRoot(document.getElementById('root'))
    await act(async () => root.render(createElement(App)))
    const button = (name) => {
      const result = [...document.querySelectorAll('button')].find((item) => !item.closest('[hidden]') && (item.getAttribute('aria-label') === name || item.textContent.trim() === name))
      assert.ok(result, `Missing button: ${name}`)
      return result
    }
    const click = async (element) => { await act(async () => { element.click(); await Promise.resolve() }) }
    const fill = async (element, value) => {
      assert.ok(element)
      const prototype = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
      await act(() => { Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value); element.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
    }
    const submit = async () => { await act(() => document.querySelector('[role="dialog"] form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))) }
    const store = () => JSON.parse(localStorage.getItem('orbit-command-library'))
    const drag = async (source, target, fraction = .5) => {
      const transfer = { setData() {}, setDragImage(element, x, y) { assert.equal(element.className, 'drag-preview'); assert.equal(x, -12); assert.equal(y, -12) } }
      const event = (type, element) => {
        const value = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientY: 100 + fraction * 100 })
        Object.defineProperty(value, 'dataTransfer', { value: transfer })
        element.dispatchEvent(value)
      }
      target.getBoundingClientRect = () => ({ top: 100, bottom: 200, height: 100 })
      await act(() => event('dragstart', source))
      await act(() => event('dragover', target))
      assert.ok(target.matches('.drop-before, .drop-after, .drop-inside'))
      assert.equal(document.querySelectorAll('.drag-preview').length, 1)
      await act(() => event('drop', target))
      assert.equal(document.querySelectorAll('.drag-preview').length, 0)
      await act(() => new Promise((resolve) => setTimeout(resolve, 210)))
    }
    await click(button('命令管理'))
    await act(async () => {
      // The feature and syntax grammars load only when its route is opened.
      await server.ssrLoadModule('/src/features/commands/CommandLibraryView.tsx')
    })
    await click(button('复制 Pod 排查速查 第 2 行'))
    assert.equal(copied.at(-1), 'kubectl get pods -A -o wide')
    await click(button('复制整段 Pod 排查速查'))
    assert.ok(copied.at(-1).startsWith('# 查看所有命名空间中的 Pod\n'))
    await click(button('新建分组'))
    await fill(document.querySelector('[role="dialog"] input'), '中文输入法测试')
    const imeEnter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })
    await act(() => document.querySelector('[role="dialog"] input').dispatchEvent(imeEnter))
    assert.equal(imeEnter.defaultPrevented, true)
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 1)
    const committedEnter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    await act(() => document.querySelector('[role="dialog"] input').dispatchEvent(committedEnter))
    assert.equal(committedEnter.defaultPrevented, false, 'English/committed Enter keeps normal form submission')
    await submit()
    assert.ok(button('命令分组 中文输入法测试'))
    const newGroup = store().groups.at(-1)
    await click(button('命令分组 中文输入法测试'))
    await click(button('新建命令'))
    await fill(document.querySelector('[role="dialog"] input'), '测试多行')
    const content = '# 本地模拟命令\nprintf "%s" \\\n  "$HOME"\n\n# <script>alert(1)</script>\n'
    await fill(document.querySelector('textarea[aria-label="命令内容"]'), content)
    await click(button('预览'))
    assert.equal(document.querySelectorAll('.command-editor-preview script').length, 0)
    assert.ok(document.querySelector('.command-editor-preview .syntax-comment'))
    await click(button('保存命令'))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    let custom = store().snippets.find((item) => item.name === '测试多行')
    assert.equal(custom.groupId, newGroup.id)
    assert.equal(custom.content, content)
    await click(button('复制 测试多行 第 3 行'))
    assert.equal(copied.at(-1), '  "$HOME"')
    await click(button('复制整段 测试多行'))
    assert.equal(copied.at(-1), content)
    await click(button('编辑命令 测试多行'))
    await fill(document.querySelector('textarea'), content + 'echo "updated"')
    // Simulate full/disabled storage: the draft and editor must remain available.
    const setItem = dom.window.Storage.prototype.setItem
    dom.window.Storage.prototype.setItem = function (key, value) { if (key === 'orbit-command-library') throw new Error('quota'); return setItem.call(this, key, value) }
    await click(button('保存命令'))
    assert.ok(document.querySelector('[role="dialog"] textarea'))
    assert.equal(store().snippets.find((item) => item.id === custom.id).content, content)
    dom.window.Storage.prototype.setItem = setItem
    await click(button('保存命令'))
    custom = store().snippets.find((item) => item.id === custom.id)
    assert.equal(custom.content, content + 'echo "updated"')
    await drag(button('拖动命令 测试多行'), document.querySelector('[data-command-group-id="commands-development"]'))
    assert.equal(store().snippets.find((item) => item.id === custom.id).groupId, 'commands-development')
    assert.equal(document.querySelectorAll('[data-command-id]').length, 0)
    await click(button('命令分组 日常开发'))
    await drag(button('拖动命令 测试多行'), document.querySelector('[data-command-id="snippet-git"]'), .1)
    assert.equal(document.querySelector('[data-command-id]').dataset.commandId, custom.id)
    await drag(button('拖动命令分组 中文输入法测试'), document.querySelector('[data-command-group-id="commands-kubernetes"]'), .1)
    assert.equal(store().groups[0].id, newGroup.id)
    // Copy and move act on precisely the selected records, not hidden records.
    await click(document.querySelector(`input[aria-label="选择命令 测试多行"]`))
    await click(document.querySelector('input[aria-label="选择命令 Git 工作区检查"]'))
    await click(button('复制'))
    assert.equal(copied.at(-1), [custom.content, store().snippets.find((item) => item.id === 'snippet-git').content].join('\n\n'))
    const moveSelect = document.querySelector('select[aria-label="批量移动命令"]')
    await act(() => { moveSelect.value = newGroup.id; moveSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
    assert.ok(store().snippets.filter((item) => [custom.id, 'snippet-git'].includes(item.id)).every((item) => item.groupId === newGroup.id))
    await click(button('命令分组 中文输入法测试'))
    await click(button('复制当前列表'))
    assert.equal(copied.at(-1), [custom.content, store().snippets.find((item) => item.id === 'snippet-git').content].join('\n\n'))
    await click(button('编辑命令分组 中文输入法测试'))
    await fill(document.querySelector('[role="dialog"] input'), '改名后分组')
    await submit()
    assert.ok(button('命令分组 改名后分组'))
    await click(button('编辑命令分组 改名后分组'))
    await click(button('删除分组'))
    await click(button('确认删除'))
    assert.equal(store().snippets.length, 4, 'deleting a folder preserves commands')
    assert.ok(store().snippets.filter((item) => [custom.id, 'snippet-git'].includes(item.id)).every((item) => item.groupId === ''))
    await fill(document.querySelector('.global-search input'), 'updated')
    assert.equal(document.querySelectorAll('[data-command-id]').length, 1)
    await click(document.querySelector('input[aria-label="选择命令 测试多行"]'))
    await click(button('删除'))
    await click(button('确认删除'))
    assert.equal(store().snippets.length, 3)
    assert.equal(store().snippets.some((item) => item.id === custom.id), false)
    await fill(document.querySelector('input[aria-label="搜索所有命令、分组、备注"]'), 'NetAdapter')
    assert.equal(document.querySelectorAll('[data-command-id]').length, 1, 'topbar search reaches records outside the selected folder')
    assert.equal(document.querySelector('[data-command-id]').dataset.commandId, 'snippet-powershell')
    await act(() => document.querySelector('input[aria-label="搜索所有命令、分组、备注"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    assert.ok(document.querySelector('.command-library-page'), 'Enter must retain command search results')
    await click(button('清空搜索'))
    await act(() => root.unmount())
    root = createRoot(document.getElementById('root'))
    await act(async () => root.render(createElement(App)))
    await click(button('命令管理'))
    assert.equal(document.querySelectorAll('[data-command-id]').length, 3)
    assert.deepEqual([...document.querySelectorAll('[data-command-id]')].map((item) => item.dataset.commandId), ['snippet-pods', 'snippet-git', 'snippet-powershell'])
    assert.equal(document.querySelector('[data-command-id="snippet-git"] select').value, '')
    assert.ok(button('命令分组 未分组'))
  } finally {
    if (root) await act(() => root.unmount())
    await server.close()
    dom.window.close()
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
