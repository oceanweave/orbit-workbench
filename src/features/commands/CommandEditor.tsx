import { useRef, useState } from 'react'
import { Code2, Eye, Save } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { CommandCode } from './CommandCode'
import { commandLanguages, type CommandFolder, type SavedCommand } from './types'

export function CommandEditor({ command, groups, onSave, onClose }: {
  command: SavedCommand
  groups: CommandFolder[]
  onSave: (command: SavedCommand) => boolean
  onClose: () => void
}) {
  const [draft, setDraft] = useState(command)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')
  const composing = useRef(false)
  const save = () => {
    if (!draft.name.trim() || !draft.content.trim()) { setError('请填写命令名称和内容'); return }
    if (draft.content.length > 100_000) { setError('单条命令记录最多支持 100,000 个字符，请拆分后保存'); return }
    if (onSave({ ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() })) onClose()
  }
  return <Modal title={command.name ? '编辑命令记录' : '新建命令记录'} className="modal-wide command-editor-modal" onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (!composing.current) save() }} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }} onKeyDown={(event) => {
      if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)) { event.preventDefault(); return }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save() }
    }}>
      <div className="form-row"><label>命令名称<input autoFocus required maxLength={120} placeholder="例如：检查服务运行状态" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>所属分组<select value={draft.groupId} onChange={(event) => setDraft({ ...draft, groupId: event.target.value })}><option value="">未分组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label></div>
      <label>备注<input maxLength={500} value={draft.description} placeholder="记录用途、参数说明或使用场景（可选）" onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <div className="command-editor-toolbar"><div role="group" aria-label="命令编辑模式"><button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}><Code2 size={15} />编辑</button><button type="button" aria-pressed={preview} onClick={() => setPreview(true)}><Eye size={15} />预览</button></div><label>语言<select aria-label="命令语言" value={draft.language} onChange={(event) => setDraft({ ...draft, language: event.target.value as SavedCommand['language'] })}>{commandLanguages.map((language) => <option key={language.id} value={language.id}>{language.name}</option>)}</select></label></div>
      {preview ? <div className="command-editor-preview"><CommandCode content={draft.content} language={draft.language} name={draft.name || '命令预览'} /></div> : <textarea className="command-content-editor" aria-label="命令内容" spellCheck={false} maxLength={100_000} value={draft.content} placeholder={'# 在这里记录说明和命令\nkubectl get pods -o wide'} onChange={(event) => { setDraft({ ...draft, content: event.target.value }); setError('') }} />}
      <div className="command-editor-hint"><span>保留缩进、空行和注释 · 仅记录与复制</span><span>⌘ / Ctrl + Enter 保存</span></div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button><button type="submit" className="primary-button"><Save size={15} />保存命令</button></div>
    </form>
  </Modal>
}
