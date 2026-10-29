import { useState } from 'react'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { uid } from '../../lib/presentation'
import type { CommandTemplate } from '../../types'

export function CommandManagerModal({
  commands,
  defaultCommandId,
  setCommands,
  onDefaultCommandChange,
  onClose,
  notify,
}: {
  commands: CommandTemplate[]
  defaultCommandId: string
  setCommands: React.Dispatch<React.SetStateAction<CommandTemplate[]>>
  onDefaultCommandChange: React.Dispatch<React.SetStateAction<string>>
  onClose: () => void
  notify: (message: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', command: '', description: '' })
  const startEdit = (item?: CommandTemplate) => {
    setEditingId(item?.id ?? null)
    setDraft({
      name: item?.name ?? '',
      command: item?.command ?? '',
      description: item?.description ?? '',
    })
  }
  const save = () => {
    if (!draft.name.trim() || !draft.command.trim()) {
      notify('请填写命令名称和命令内容')
      return
    }
    if (editingId)
      setCommands((current) =>
        current.map((item) =>
          item.id === editingId
            ? {
                ...item,
                name: draft.name.trim(),
                command: draft.command.trim(),
                description: draft.description.trim(),
              }
            : item,
        ),
      )
    else
      setCommands((current) => [
        ...current,
        {
          id: uid('command'),
          name: draft.name.trim(),
          command: draft.command.trim(),
          description: draft.description.trim() || '自定义命令',
          createdAt: new Date().toISOString(),
        },
      ])
    setEditingId(null)
    setDraft({ name: '', command: '', description: '' })
    notify(editingId ? '命令已更新' : '命令已添加')
  }
  const remove = (item: CommandTemplate) => {
    if (item.builtin) return
    setCommands((current) =>
      current.filter((command) => command.id !== item.id),
    )
    if (defaultCommandId === item.id)
      onDefaultCommandChange(
        commands.find((command) => command.id !== item.id)?.id ?? '',
      )
    notify('自定义命令已删除')
  }
  return (
    <Modal
      title="管理常用命令"
      className="modal-wide command-manager-modal"
      onClose={onClose}
    >
      <div className="command-manager">
        <div className="command-manager-list">
          {commands.map((item) => (
            <div className="command-manager-row" key={item.id}>
              <div className="command-manager-main">
                <strong>{item.name}</strong>
                <code>{item.command}</code>
                <small>{item.description}</small>
              </div>
              <div className="command-manager-actions">
                <button
                  className={`command-default-button ${defaultCommandId === item.id ? 'active' : ''}`}
                  onClick={() => onDefaultCommandChange(item.id)}
                >
                  {defaultCommandId === item.id ? '默认' : '设为默认'}
                </button>
                <button
                  className="icon-button tiny"
                  onClick={() => startEdit(item)}
                  aria-label={`编辑 ${item.name}`}
                >
                  <Pencil size={13} />
                </button>
                {!item.builtin && (
                  <button
                    className="icon-button tiny danger-hover"
                    onClick={() => remove(item)}
                    aria-label={`删除 ${item.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="command-manager-form">
          <div className="command-manager-form-header">
            <strong>{editingId ? '编辑命令' : '添加自定义命令'}</strong>
            {editingId && (
              <button className="inline-control" onClick={() => startEdit()}>
                <Plus size={13} />
                新建
              </button>
            )}
          </div>
          <div className="form-row">
            <label>
              名称
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="例如：Pod 按创建时间排序"
              />
            </label>
            <label>
              命令
              <input
                value={draft.command}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    command: event.target.value,
                  }))
                }
                placeholder="get pods --sort-by=.metadata.creationTimestamp"
              />
            </label>
          </div>
          <label>
            说明
            <input
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="说明这条命令的用途"
            />
          </label>
          <button className="primary-button manager-save-button" onClick={save}>
            <Save size={14} />
            {editingId ? '保存修改' : '添加命令'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
