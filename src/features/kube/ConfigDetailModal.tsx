import { useEffect, useRef, useState } from 'react'
import { Copy, FolderOpen, Save } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { displayEnvName, deriveEnvName } from '../../lib/presentation'
import {
  inspectKubeconfig,
  setKubeCurrentContext,
} from '../../../shared/kubeconfig.mjs'
import type { KubeConfig, KubeGroup } from '../../types'

export function ConfigDetailModal({
  config,
  groups,
  onClose,
  onSave,
  onCopy,
}: {
  config: KubeConfig
  groups: KubeGroup[]
  onClose: () => void
  onSave: (config: KubeConfig, expectedContent?: string) => Promise<boolean>
  onCopy: (value: string, label?: string) => void
}) {
  const [draft, setDraft] = useState({
    name: config.name,
    envName: displayEnvName(config),
    path: config.path,
    groupId: config.groupId,
    context: config.context,
    contexts: (config.contexts ?? [config.context]).join(', '),
    server: config.server,
    content: config.content ?? '',
  })
  const [editingContent, setEditingContent] = useState(false)
  const source = useRef(config.content)
  const [loadingSource, setLoadingSource] = useState(
    Boolean(window.orbitDesktop?.readKubeconfig),
  )
  const [sourceError, setSourceError] = useState('')
  useEffect(() => {
    let active = true
    const read = window.orbitDesktop?.readKubeconfig
    if (!read) return
    void read(config.path)
      .then((file) => {
        if (!active) return
        const parsed = inspectKubeconfig(file.content)
        source.current = file.content
        const sourceFields = {
          content: file.content,
          context: parsed.context,
          contexts: parsed.contexts.join(', '),
          server: parsed.server,
        }
        originalDraft.current = JSON.stringify({
          ...JSON.parse(originalDraft.current),
          ...sourceFields,
        })
        setDraft((current) => ({ ...current, ...sourceFields }))
      })
      .catch((error) => {
        if (active)
          setSourceError(
            error instanceof Error
              ? error.message
              : '源文件无法读取。下方保留工作区缓存，可复制草稿。',
          )
      })
      .finally(() => {
        if (active) setLoadingSource(false)
      })
    return () => {
      active = false
    }
  }, [])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const requestClose = () => {
    if (
      !saving &&
      (JSON.stringify(draft) === originalDraft.current ||
        window.confirm('有未保存的修改，确定放弃草稿？'))
    )
      onClose()
  }
  const originalDraft = useRef(JSON.stringify(draft))
  const parseList = (value: string) =>
    Array.from(
      new Set(
        value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    )
  const save = async () => {
    if (saving || loadingSource) return
    setSaving(true)
    setSaveError('')
    try {
      const activeContext = inspectKubeconfig(draft.content).context
      const nextName = draft.name.trim() || config.name
      const envName = deriveEnvName(draft.envName.trim() || nextName)
      const parsed = inspectKubeconfig(draft.content)
      const detectedContexts = parsed.contexts
      const saved = await onSave(
        {
          ...config,
          name: nextName,
          envName,
          alias: envName,
          path: draft.path.trim() || config.path,
          metaName: envName,
          groupId: draft.groupId,
          context: activeContext,
          contexts: detectedContexts,
          server: parsed.server,
          content: draft.content,
          updatedAt: '刚刚',
        },
        source.current,
      )
      if (saved) onClose()
    } catch (error) {
      if (
        error instanceof Error &&
        'writtenContent' in error &&
        typeof error.writtenContent === 'string'
      )
        source.current = error.writtenContent
      setSaveError(
        error instanceof Error
          ? error.message
          : '保存失败，请检查源文件权限。草稿已保留',
      )
    } finally {
      setSaving(false)
    }
  }
  const contextOptions = Array.from(
    new Set([draft.context, ...parseList(draft.contexts)].filter(Boolean)),
  )
  return (
    <Modal
      title="kubeconfig 详情"
      className="modal-wide config-detail-modal"
      onClose={requestClose}
    >
      <div className="form-stack">
        <div className="form-row">
          <label>
            配置名称
            <input
              autoFocus
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>
          <label>
            环境变量名称
            <input
              value={draft.envName}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  envName: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            所属分组
            <select
              value={draft.groupId}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  groupId: event.target.value,
                }))
              }
            >
              {groups.map((group) => (
                <option value={group.id} key={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            源文件路径
            <input
              readOnly={!!window.orbitDesktop}
              value={draft.path}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  path: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <div className="source-editor-heading">
          <h3>原始配置</h3>
          <button
            className="toolbar-button"
            onClick={() => setEditingContent(!editingContent)}
            disabled={loadingSource}
          >
            {editingContent ? '查看原始内容' : '编辑原始内容'}
          </button>
          <button
            className="icon-button"
            aria-label="复制原始正文"
            title="复制原始正文"
            onClick={() => onCopy(draft.content, '配置正文已复制')}
          >
            <Copy size={17} />
          </button>
          {window.orbitDesktop && (
            <button
              className="icon-button"
              aria-label="定位源文件"
              title="定位源文件"
              onClick={() => {
                void window.orbitDesktop
                  ?.revealKubeconfig(config.path)
                  .catch((error) => setSourceError(error.message))
              }}
            >
              <FolderOpen size={17} />
            </button>
          )}
        </div>
        {loadingSource && <p role="status">正在读取源文件…</p>}
        {sourceError && (
          <p className="form-error" role="alert">
            {sourceError}
          </p>
        )}
        <label>
          <span className="sr-only">原始 kubeconfig 内容</span>
          <textarea
            aria-label="原始 kubeconfig 内容"
            readOnly={!editingContent}
            disabled={loadingSource}
            className="yaml-editor"
            spellCheck={false}
            value={draft.content}
            onChange={(event) => {
              const content = event.target.value
              try {
                const parsed = inspectKubeconfig(content)
                setDraft((current) => ({
                  ...current,
                  content,
                  context: parsed.context,
                  contexts: parsed.contexts.join(', '),
                  server: parsed.server,
                }))
              } catch {
                setDraft((current) => ({ ...current, content }))
              }
            }}
          />
        </label>
        <details className="source-metadata">
          <summary>配置中的 Context 与文件信息</summary>
          <div className="form-row">
            <label>
              文件 current-context
              <select
                disabled={!editingContent || loadingSource}
                value={draft.context}
                onChange={(event) => {
                  try {
                    const content = setKubeCurrentContext(
                      draft.content,
                      event.target.value,
                    )
                    setDraft((current) => ({
                      ...current,
                      content,
                      context: event.target.value,
                    }))
                  } catch (error) {
                    setSaveError(
                      error instanceof Error ? error.message : 'Context 无效',
                    )
                  }
                }}
              >
                {contextOptions.map((item) => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
                {!contextOptions.length && (
                  <option value="">未读取 Context</option>
                )}
              </select>
            </label>
            <label>
              集群地址
              <input readOnly value={draft.server} />
            </label>
          </div>
          <dl>
            <dt>可用 Context</dt>
            <dd>{draft.contexts || '未设置'}</dd>
            <dt>创建时间</dt>
            <dd>
              {config.createdAt
                ? new Date(config.createdAt).toLocaleString('zh-CN')
                : '未记录'}
            </dd>
            <dt>来源</dt>
            <dd>
              {config.source === 'clipboard' || config.source === 'managed'
                ? 'Orbit 托管文件'
                : '引用本机原文件'}
            </dd>
          </dl>
        </details>
        <p className="form-hint">
          {window.orbitDesktop
            ? '修改正文并保存后，写回此源文件并保留备份。'
            : '浏览器模式：修改仅保存到本地站点数据。'}
        </p>
        {saveError && (
          <p className="form-error" role="alert">
            {saveError}
          </p>
        )}
        <div className="modal-actions">
          <button
            className="ghost-button"
            disabled={saving || loadingSource}
            onClick={requestClose}
          >
            取消
          </button>
          <button
            className="primary-button"
            disabled={saving || loadingSource}
            onClick={() => void save()}
          >
            <Save size={15} />
            {saving ? '正在保存…' : '保存详情'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
