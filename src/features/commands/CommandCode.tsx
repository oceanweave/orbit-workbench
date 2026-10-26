import { memo, useMemo } from 'react'
import Prism from 'prismjs'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-powershell'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import { Copy } from 'lucide-react'
import { commandLines } from '../../../shared/commands.mjs'
import type { CommandLanguage } from './types'

type Segment = { text: string; classes: string[] }

export function highlightedLines(content: string, language: CommandLanguage): Segment[][] {
  const grammar = Prism.languages[language]
  const tokens = grammar ? Prism.tokenize(content, grammar) : [content]
  const lines: Segment[][] = [[]]
  function visit(token: string | Prism.Token, classes: string[] = []) {
    if (typeof token !== 'string') {
      const aliases = typeof token.alias === 'string' ? [token.alias] : token.alias ?? []
      const next = [...classes, token.type, ...aliases]
      if (Array.isArray(token.content)) token.content.forEach((part) => visit(part, next))
      else visit(token.content, next)
      return
    }
    token.split(/\r\n|\n|\r/).forEach((text, index) => {
      if (index) lines.push([])
      if (text) lines[lines.length - 1].push({ text, classes })
    })
  }
  tokens.forEach((token) => visit(token))
  return lines
}

export const CommandCode = memo(function CommandCode({ content, language, name, onCopy }: {
  content: string
  language: CommandLanguage
  name: string
  onCopy?: (text: string, message?: string) => void
}) {
  const highlighted = useMemo(() => highlightedLines(content, language), [content, language])
  const raw = useMemo(() => commandLines(content), [content])
  return <div className="command-code" aria-label={`${name}代码`} tabIndex={0}>
    {highlighted.map((segments, index) => <div className="command-code-line" key={index}>
      <span className="command-line-number" aria-hidden="true">{index + 1}</span>
      <code>{segments.map((segment, offset) => <span key={offset} className={segment.classes.map((type) => `syntax-${type}`).join(' ')}>{segment.text}</span>)}{!segments.length && '\u200b'}</code>
      {onCopy && <button type="button" className="command-line-copy" aria-label={`复制 ${name} 第 ${index + 1} 行`} title="复制这一行" disabled={!raw[index]} onClick={() => onCopy(raw[index], `第 ${index + 1} 行已复制`)}><Copy size={14} /></button>}
    </div>)}
  </div>
})
