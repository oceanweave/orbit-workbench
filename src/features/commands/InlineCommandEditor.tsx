import { useEffect, useRef, useState } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  gutter,
  GutterMarker,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { powerShell } from '@codemirror/legacy-modes/mode/powershell'
import { python } from '@codemirror/legacy-modes/mode/python'
import { javascript, json } from '@codemirror/legacy-modes/mode/javascript'
import { standardSQL } from '@codemirror/legacy-modes/mode/sql'
import { yaml } from '@codemirror/legacy-modes/mode/yaml'
import type { CommandLanguage } from './types'
import { commandLines } from '../../../shared/commands.mjs'

const languages = {
  bash: shell,
  powershell: powerShell,
  python,
  javascript,
  json,
  sql: standardSQL,
  yaml,
  text: null,
}
export const rawEditorOffset = (raw: string, position: number) => {
  let index = 0,
    count = 0
  while (count < position && index < raw.length) {
    if (raw[index] === '\r' && raw[index + 1] === '\n') index++
    index++
    count++
  }
  return index
}
const highlight = HighlightStyle.define([
  { tag: tags.comment, color: '#8192a5', fontStyle: 'italic' },
  { tag: tags.string, color: '#319d81' },
  { tag: tags.keyword, color: '#9a78d3' },
  { tag: tags.number, color: '#c48d38' },
  { tag: tags.variableName, color: '#668ee2' },
])

// CodeMirror positions normalize newlines. Map changes back to the original
// string so untouched CRLF/CR/Tab/trailing whitespace are never rewritten.
export function applyEditorChanges(
  raw: string,
  changes: {
    iterChanges: (
      visit: (
        from: number,
        to: number,
        fromB: number,
        toB: number,
        inserted: { toString: () => string },
      ) => void,
    ) => void
  },
) {
  const offset = (position: number) => rawEditorOffset(raw, position)
  const separator = raw.match(/\r\n|\r|\n/)?.[0] ?? '\n'
  const edits: { from: number; to: number; text: string }[] = []
  changes.iterChanges((from, to, _fromB, _toB, inserted) =>
    edits.push({
      from: offset(from),
      to: offset(to),
      text: inserted.toString().replace(/\n/g, separator),
    }),
  )
  for (const edit of edits.reverse()) raw = raw.slice(0, edit.from) + edit.text + raw.slice(edit.to)
  return raw
}

export function InlineCommandEditor({
  content,
  language,
  name,
  onChange,
  onSave,
  onCopy,
}: {
  content: string
  language: CommandLanguage
  name: string
  onChange: (content: string) => void
  onSave: (content: string) => boolean
  onCopy: (text: string, message?: string) => void
}) {
  const mount = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView | null>(null)
  const latest = useRef({ content, onChange, onSave, onCopy, name })
  latest.current = { content, onChange, onSave, onCopy, name }
  const raw = useRef(content)
  const languageCompartment = useRef(new Compartment())
  const external = useRef(false)
  const composing = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [status, setStatus] = useState('已保存')
  const save = () => {
    clearTimeout(timer.current)
    if (composing.current) return false
    const saved = latest.current.onSave(raw.current)
    setStatus(saved ? '已保存' : '保存失败 · 草稿保留')
    return saved
  }
  useEffect(() => {
    if (!mount.current) return
    class CopyMarker extends GutterMarker {
      constructor(readonly number: number) {
        super()
      }
      toDOM() {
        const button = document.createElement('button')
        button.textContent = '⧉'
        button.type = 'button'
        button.title = '复制此行'
        button.setAttribute('aria-label', `复制 ${latest.current.name} 第 ${this.number} 行`)
        button.onclick = () =>
          latest.current.onCopy(
            commandLines(raw.current)[this.number - 1] ?? '',
            `第 ${this.number} 行已复制`,
          )
        return button
      }
    }
    const view = new EditorView({
      parent: mount.current,
      state: EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          languageCompartment.current.of(
            languages[language] ? StreamLanguage.define(languages[language]!) : [],
          ),
          syntaxHighlighting(highlight),
          EditorView.contentAttributes.of({
            'aria-label': `${name} 命令正文`,
            spellcheck: 'false',
          }),
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                save()
                return true
              },
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.domEventHandlers({
            compositionstart: () => {
              composing.current = true
              editor.current?.dom.setAttribute('data-composing', 'true')
              clearTimeout(timer.current)
            },
            compositionend: () => {
              composing.current = false
              editor.current?.dom.removeAttribute('data-composing')
              timer.current = setTimeout(save, 450)
            },
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || external.current) return
            raw.current = applyEditorChanges(raw.current, update.changes)
            latest.current.onChange(raw.current)
            setStatus('待保存')
            clearTimeout(timer.current)
            if (!composing.current) timer.current = setTimeout(save, 450)
          }),
          gutter({
            class: 'command-copy-gutter',
            lineMarker: (view, line) => new CopyMarker(view.state.doc.lineAt(line.from).number),
          }),
          EditorView.theme({
            '&': { fontSize: '12px', backgroundColor: 'var(--panel-2)', color: 'var(--text)' },
            '.cm-content': {
              fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
              padding: '12px 0',
              minHeight: '90px',
            },
            '.cm-scroller': { overflow: 'auto', maxHeight: '380px' },
            '.cm-gutters': {
              backgroundColor: 'var(--panel-2)',
              color: 'var(--faint)',
              border: 'none',
            },
            '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--panel-3)' },
            '.cm-selectionBackground': { backgroundColor: '#6f8cff44 !important' },
            '.cm-cursor': { borderLeftColor: 'var(--blue)' },
            '.cm-line': { padding: '0 12px' },
          }),
        ],
      }),
    })
    editor.current = view
    return () => {
      clearTimeout(timer.current)
      view.destroy()
      editor.current = null
    }
  }, [])
  useEffect(() => {
    const parser = languages[language]
    editor.current?.dispatch({
      effects: languageCompartment.current.reconfigure(parser ? StreamLanguage.define(parser) : []),
    })
  }, [language])
  useEffect(() => {
    if (content === raw.current) return
    raw.current = content
    const view = editor.current
    if (view) {
      external.current = true
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } })
      external.current = false
      setStatus('已保存')
    }
  }, [content])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (status !== '已保存') {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [status])
  return (
    <div className="inline-command-editor">
      <div ref={mount} />
      <div className="inline-editor-footer">
        <span role="status">{status}</span>
        <span>直接编辑 · ⌘ / Ctrl S 保存</span>
        <button
          className="inline-control"
          onClick={() => {
            const view = editor.current
            if (view) {
              const selection = view.state.selection.main
              latest.current.onCopy(
                selection.empty
                  ? commandLines(raw.current)[view.state.doc.lineAt(selection.head).number - 1]
                  : raw.current.slice(
                      rawEditorOffset(raw.current, selection.from),
                      rawEditorOffset(raw.current, selection.to),
                    ),
                selection.empty ? '当前行已复制' : '选中文字已复制',
              )
            }
          }}
        >
          复制选中 / 当前行
        </button>
        <button className="inline-control" onClick={save}>
          保存
        </button>
      </div>
    </div>
  )
}
