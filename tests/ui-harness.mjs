import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import { createElement, act } from 'react'

export async function mountApp(seed = {}, desktop) {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true, url: 'https://workflow-test.invalid/' })
  for (const [key, value] of Object.entries(seed)) dom.window.localStorage.setItem(key, JSON.stringify(value))
  const copied = []
  Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async (text) => { copied.push(text) } } })
  dom.window.orbitDesktop = desktop
  dom.window.Range.prototype.getClientRects = () => []
  dom.window.Range.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 })
  const originals = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, Window: dom.window.Window, navigator: dom.window.navigator, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
  const { default: App } = await server.ssrLoadModule('/src/App.tsx')
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(document.getElementById('root'))
  await act(async () => root.render(createElement(App)))
  const button = (name) => {
    const match = [...document.querySelectorAll('button')].find((item) => !item.closest('[hidden]') && (item.getAttribute('aria-label') === name || item.textContent.trim() === name))
    assert.ok(match, `Missing button ${name}`)
    return match
  }
  return { dom, server, copied, button,
    click: async (element) => { await act(async () => { element.click(); await Promise.resolve() }) },
    fill: async (element, value) => {
      assert.ok(element, 'Missing input')
      const prototype = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
      await act(() => { Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value); element.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
    },
    select: async (element, value) => { await act(() => { element.value = value; element.dispatchEvent(new dom.window.Event('change', { bubbles: true })) }) },
    close: async () => {
      await act(() => root.unmount()); await server.close(); dom.window.close()
      for (const [key, value] of originals) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key] }
    },
  }
}
