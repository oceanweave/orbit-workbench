import { ConfigDetailModal } from './ConfigDetailModal'
import { CommandManagerModal } from './CommandManagerModal'
import { Fragment, useEffect, useMemo, useState } from 'react'

import {
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  Copy,
  FileUp,
  FolderOpen,
  GripVertical,
  Info,
  KeyRound,
  ListTree,
  MoreHorizontal,
  Plus,
  Search,
  Save,
  SlidersHorizontal,
  Server,
  Trash2,
  X,
} from 'lucide-react'

import { ColorPicker } from '../../components/ColorPicker'

import { useContextMenu } from '../../components/ContextMenu'

import { DropGap } from '../../components/DropGap'

import { useDirectorySize } from '../../components/DirectorySizer'

import { usePersistentState, commitStorage } from '../../lib/workspaceStore'

import { Modal } from '../../components/Modal'

import { KubeImportPanel } from '../../components/KubeImportPanel'

import {
  useWorkspaceDrag,
  rowDropTarget,
  dropClassName,
  isSameDragItem,
  type WorkspaceDropTarget,
} from '../../hooks/useWorkspaceDrag'

import {
  reorderItems,
  placeGroupedItems,
  orderVisibleItems,
} from '../../../shared/ordering.mjs'

import {
  generateKubeCommand,
  validateEnvName,
  type CommandFormat,
  type CommandShell,
} from '../../../shared/kube-command.mjs'

import {
  inspectKubeconfig,
  prepareKubeImports,
} from '../../../shared/kubeconfig.mjs'

import type { CommandTemplate, KubeConfig, KubeGroup } from '../../types'

import {
  isCommittedEnter,
  kubeGroupPalette,
  deriveEnvName,
  displayEnvName,
  uid,
} from '../../lib/presentation'

type ConfigSort = 'manual' | 'created' | 'name'
export function KubeconfigView({
  configs,
  setConfigs,
  groups,
  setGroups,
  commands,
  setCommands,
  defaultCommandId,
  onDefaultCommandChange,
  query,
  onClearQuery,
  onCopy,
  notify,
}: {
  configs: KubeConfig[]
  setConfigs: React.Dispatch<React.SetStateAction<KubeConfig[]>>
  groups: KubeGroup[]
  setGroups: React.Dispatch<React.SetStateAction<KubeGroup[]>>
  commands: CommandTemplate[]
  setCommands: React.Dispatch<React.SetStateAction<CommandTemplate[]>>
  defaultCommandId: string
  onDefaultCommandChange: React.Dispatch<React.SetStateAction<string>>
  query: string
  onClearQuery: () => void
  onCopy: (value: string, label?: string) => void
  notify: (message: string) => void
}) {
  const directory = useDirectorySize('kubeconfig', 300)
  const menu = useContextMenu()
  const [selectionMode, setSelectionMode] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = usePersistentState<
    Record<string, boolean>
  >('orbit-kube-group-collapse', {})
  const [hoverGroup, setHoverGroup] = useState<string | null>(null)
  const initialSelectedId = configs[0]?.id ?? ''
  const [selectedId, setSelectedId] = useState(initialSelectedId)
  const [selectedGroup, setSelectedGroup] = useState('all')
  const [templateId, setTemplateId] = useState(
    defaultCommandId && commands.some((item) => item.id === defaultCommandId)
      ? defaultCommandId
      : (commands[0]?.id ?? ''),
  )
  const [context, setContext] = useState('')
  const [namespace, setNamespace] = useState('')
  const [commandFormat, setCommandFormat] = usePersistentState<CommandFormat>(
    'orbit-copy-format',
    'variable',
  )
  const [commandShell, setCommandShell] = usePersistentState<CommandShell>(
    'orbit-command-shell',
    'bash',
  )
  const [extraArgs, setExtraArgs] = useState('')
  const [sortMode, setSortMode] = usePersistentState<ConfigSort>(
    'orbit-kube-sort',
    'manual',
  )
  const [showAdd, setShowAdd] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [showGroupAdd, setShowGroupAdd] = useState(false)
  const [showCommandManager, setShowCommandManager] = useState(false)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [newGroup, setNewGroup] = useState({
    name: '',
    color: kubeGroupPalette[2],
  })
  const drag = useWorkspaceDrag()
  const [envNameDraft, setEnvNameDraft] = useState('')
  const [envNameError, setEnvNameError] = useState('')
  const [selectedConfigIds, setSelectedConfigIds] = useState<string[]>([])
  const [groupEditor, setGroupEditor] = useState<KubeGroup | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    type: 'configs' | 'group'
    groupId?: string
  } | null>(null)
  const filteredConfigs = configs.filter((config) => {
    const text =
      `${config.name} ${displayEnvName(config)} ${config.path} ${config.context} ${(config.contexts ?? []).join(' ')} ${config.server}`.toLowerCase()
    return !query || text.includes(query.toLowerCase())
  })
  const displayedConfigs = useMemo(
    () =>
      [...filteredConfigs].sort((a, b) => {
        if (sortMode === 'manual') return 0
        if (sortMode === 'name') return a.name.localeCompare(b.name, 'zh-CN')
        return (
          (b.createdAt ? new Date(b.createdAt).getTime() : 0) -
          (a.createdAt ? new Date(a.createdAt).getTime() : 0)
        )
      }),
    [filteredConfigs, sortMode],
  )
  const selected =
    filteredConfigs.find((config) => config.id === selectedId) ??
    filteredConfigs[0]
  const clearConfigFilters = () => {
    setSelectedGroup('all')
    onClearQuery()
  }
  const template =
    commands.find((item) => item.id === templateId) ?? commands[0]
  const contextOptions = selected
    ? Array.from(
        new Set(
          [...(selected.contexts ?? []), selected.context].filter(Boolean),
        ),
      )
    : []
  let generatedCommand = '',
    variableDefinition = '',
    commandError = ''
  if (selected && template) {
    try {
      const result = generateKubeCommand({
        path: selected.path,
        envName: displayEnvName(selected),
        command: template.command,
        context,
        namespace,
        extraArgs,
        format: commandFormat,
        shell: commandShell,
      })
      generatedCommand = result.text
      variableDefinition = result.definition
    } catch (error) {
      commandError = error instanceof Error ? error.message : '生成失败'
    }
  }

  useEffect(() => {
    if (!filteredConfigs.some((item) => item.id === selectedId))
      setSelectedId(filteredConfigs[0]?.id ?? configs[0]?.id ?? '')
  }, [filteredConfigs, selectedId, configs])

  useEffect(() => {
    if (!selected) {
      setContext('')
      return
    }
    setContext('')
    setEnvNameDraft(displayEnvName(selected))
    setEnvNameError('')
  }, [selectedId])

  useEffect(() => {
    if (!commands.some((item) => item.id === templateId))
      setTemplateId(
        defaultCommandId &&
          commands.some((item) => item.id === defaultCommandId)
          ? defaultCommandId
          : (commands[0]?.id ?? ''),
      )
  }, [commands, defaultCommandId, templateId])

  useEffect(() => {
    setSelectedConfigIds((current) =>
      current.filter((id) => configs.some((config) => config.id === id)),
    )
  }, [configs])

  useEffect(() => {
    if (!drag.item) {
      setHoverGroup(null)
      return
    }
    if (drag.target?.kind !== 'kube-group' || drag.target.position !== 'inside')
      return
    const id = drag.target.id
    const timer = window.setTimeout(() => setHoverGroup(id), 500)
    return () => clearTimeout(timer)
  }, [drag.item, drag.target])

  const updateConfig = (
    id: string,
    updater: (config: KubeConfig) => KubeConfig,
  ) =>
    setConfigs((current) =>
      current.map((item) => (item.id === id ? updater(item) : item)),
    )

  const addKubeGroup = () => {
    setNewGroup({ name: '', color: kubeGroupPalette[2] })
    setShowGroupAdd(true)
  }

  const saveKubeGroup = () => {
    const name = newGroup.name.trim()
    if (!name) {
      notify('请填写分组名称')
      return
    }
    setGroups((current) => [
      ...current,
      { id: uid('kube-group'), name, color: newGroup.color },
    ])
    setShowGroupAdd(false)
    notify('分组已创建')
  }

  const saveGroupEdit = () => {
    if (!groupEditor) return
    const name = groupEditor.name.trim()
    if (!name) {
      notify('请填写分组名称')
      return
    }
    setGroups((current) =>
      current.map((group) =>
        group.id === groupEditor.id
          ? { ...group, name, color: groupEditor.color }
          : group,
      ),
    )
    setGroupEditor(null)
    notify('分组已更新')
  }

  const deleteGroup = (groupId: string) => {
    if (!groups.some((group) => group.id === groupId)) return
    if (groups.length <= 1) {
      setConfirmAction(null)
      notify('至少保留一个分组')
      return
    }
    const fallbackGroupId =
      groups.find((group) => group.id !== groupId)?.id ?? ''
    try {
      commitStorage({
        'orbit-kube-groups': groups.filter((group) => group.id !== groupId),
        'orbit-kube-configs': configs.map((config) =>
          config.groupId === groupId
            ? {
                ...config,
                groupId: fallbackGroupId,
                updatedAt: new Date().toISOString(),
              }
            : config,
        ),
      })
      window.dispatchEvent(new window.CustomEvent('orbit:restore'))
    } catch {
      notify('分组未删除：本机保存失败，请检查存储空间')
      return
    }
    if (selectedGroup === groupId) setSelectedGroup('all')
    setConfirmAction(null)
    notify('分组已删除，配置已移入其他分组')
  }

  const canDrop = (target: WorkspaceDropTarget) => {
    if (!drag.item || isSameDragItem(drag.item, target)) return false
    return drag.item.kind === 'kube-group'
      ? target.kind === 'kube-group' && target.position !== 'inside'
      : drag.item.kind === 'config' &&
          (target.kind === 'config' || target.kind === 'kube-group')
  }
  const applyDrop = (
    event: React.DragEvent<HTMLElement>,
    target: WorkspaceDropTarget,
  ) => {
    if (!drag.item) return
    event.preventDefault()
    event.stopPropagation()
    const source = drag.item
    if (!canDrop(target)) {
      drag.finish()
      return
    }
    try {
      if (source.kind === 'kube-group' && target.position !== 'inside') {
        setGroups(reorderItems(groups, source.id, target.id, target.position))
        notify('环境分组顺序已更新')
      } else if (source.kind === 'config') {
        const groupId =
          target.kind === 'kube-group'
            ? target.id
            : configs.find((item) => item.id === target.id)?.groupId
        if (!groupId || !groups.some((group) => group.id === groupId))
          throw new Error('目标分组不存在')
        if (target.kind === 'config' && target.position !== 'inside') {
          const ordered = orderVisibleItems(
            configs,
            displayedConfigs.map((item) => item.id),
          )
          setConfigs(
            placeGroupedItems(
              ordered,
              selectedConfigIds.includes(source.id)
                ? selectedConfigIds
                : [source.id],
              target.id,
              target.position,
            ),
          )
          setSortMode('manual')
          notify(
            sortMode === 'manual'
              ? '配置顺序已更新'
              : '配置顺序已更新，已切换为手动排序',
          )
        } else {
          setConfigs((current) =>
            current.map((config) =>
              (
                selectedConfigIds.includes(source.id)
                  ? selectedConfigIds.includes(config.id)
                  : config.id === source.id
              )
                ? { ...config, groupId, updatedAt: new Date().toISOString() }
                : config,
            ),
          )
          setSelectedGroup(groupId)
          setCollapsedGroups((current) => ({ ...current, [groupId]: false }))
          notify('配置已移入目标分组')
        }
        setSelectedId(source.id)
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法移动')
    }
    drag.finish()
  }
  const dropTargetName =
    drag.target?.kind === 'kube-group'
      ? groups.find((group) => group.id === drag.target?.id)?.name
      : configs.find((config) => config.id === drag.target?.id)?.name
  const dropHint = drag.target
    ? `${drag.target.position === 'inside' ? '移入' : drag.target.position === 'before' ? '插入到前面' : '插入到后面'}：${dropTargetName}`
    : '分组之间可排序；配置可排序或拖到分组归类'

  const toggleConfigSelection = (id: string) => {
    setSelectedConfigIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    )
  }

  const toggleVisibleSelection = () => {
    const visibleIds = displayedConfigs.map((config) => config.id)
    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedConfigIds.includes(id))
    setSelectedConfigIds((current) =>
      allSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds])),
    )
  }

  const moveSelectedConfigs = (groupId: string) => {
    if (!selectedConfigIds.length) return
    const selectedCount = selectedConfigIds.length
    const ids = new Set(selectedConfigIds)
    setConfigs((current) =>
      current.map((config) =>
        ids.has(config.id) ? { ...config, groupId, updatedAt: '刚刚' } : config,
      ),
    )
    setSelectedConfigIds([])
    notify(`${selectedCount} 个配置已移动`)
  }

  const deleteSelectedConfigs = () => {
    if (!selectedConfigIds.length) return
    setConfirmAction({ type: 'configs' })
  }

  const confirmDeleteAction = () => {
    if (!confirmAction) return
    if (confirmAction.type === 'configs') {
      const ids = new Set(selectedConfigIds)
      const remaining = configs.filter((config) => !ids.has(config.id))
      setConfigs(remaining)
      setSelectedConfigIds([])
      if (selected && ids.has(selected.id))
        setSelectedId(remaining[0]?.id ?? '')
      notify('已删除选中的 kubeconfig')
    } else if (confirmAction.groupId) {
      deleteGroup(confirmAction.groupId)
      return
    }
    setConfirmAction(null)
  }

  const changeContext = (value: string) => {
    setContext(value)
  }

  const commitEnvName = () => {
    if (!selected) return
    const envName = deriveEnvName(envNameDraft.trim() || selected.name)
    const error = validateEnvName(
      envName,
      configs.filter((item) => item.id !== selected.id).map(displayEnvName),
    )
    if (error) {
      setEnvNameError(error)
      notify(error)
      return
    }
    setEnvNameError('')
    setEnvNameDraft(envName)
    updateConfig(selected.id, (item) => ({
      ...item,
      envName,
      alias: envName,
      metaName: envName,
      updatedAt: '刚刚',
    }))
  }

  const saveDetails = async (
    updated: KubeConfig,
    expectedContent?: string,
  ): Promise<boolean> => {
    const previous = configs.find((item) => item.id === updated.id)
    const error = validateEnvName(
      displayEnvName(updated),
      configs.filter((item) => item.id !== updated.id).map(displayEnvName),
    )
    if (error) throw new Error(error)
    if (updated.content !== undefined) inspectKubeconfig(updated.content)
    let fileWritten = false
    if (
      updated.content !== (expectedContent ?? previous?.content) &&
      window.orbitDesktop &&
      updated.path
    ) {
      await window.orbitDesktop.writeKubeconfigFile({
        path: updated.path,
        content: updated.content ?? '',
        expectedContent: expectedContent ?? previous?.content,
      })
      fileWritten = true
    }
    try {
      updateConfig(updated.id, () => updated)
    } catch (error) {
      if (!fileWritten) throw error
      const failure = new Error(
        '源文件已完整写回并保留备份，但本机记录保存失败。草稿已保留，请检查空间后重试',
      ) as Error & { writtenContent: string | undefined }
      failure.writtenContent = updated.content
      throw failure
    }
    if (updated.id === selected?.id) setEnvNameDraft(displayEnvName(updated))
    notify('配置详情已保存')
    return true
  }

  const configActions = (config: KubeConfig) => [
    { label: '查看与编辑配置…', run: () => setDetailsId(config.id) },
    { label: '复制源文件路径', run: () => onCopy(config.path, '路径已复制') },
    {
      label: '选择多个配置',
      run: () => {
        setSelectionMode(true)
        setSelectedConfigIds([config.id])
      },
    },
    {
      label: '移除配置记录',
      danger: true,
      run: () => {
        setSelectedConfigIds([config.id])
        setConfirmAction({ type: 'configs' })
      },
    },
  ]
  const configRow = (config: KubeConfig) => (
    <Fragment key={config.id}>
      <DropGap
        target={{ kind: 'config', id: config.id, position: 'before' }}
        current={drag.target}
        enabled={
          !!drag.item &&
          canDrop({ kind: 'config', id: config.id, position: 'before' })
        }
        onOver={drag.over}
        onLeave={drag.leave}
        onDrop={applyDrop}
      />
      <div
        className={`config-row drag-sort-row ${selected?.id === config.id ? 'active' : ''} ${selectedConfigIds.includes(config.id) ? 'checked' : ''} ${isSameDragItem(drag.item, { kind: 'config', id: config.id }) ? 'drag-source' : ''} ${dropClassName(drag.target, { kind: 'config', id: config.id })}`}
        data-config-id={config.id}
        draggable
        onDragStart={(event) =>
          drag.start(
            event,
            { kind: 'config', id: config.id },
            selectedConfigIds.includes(config.id) &&
              selectedConfigIds.length > 1
              ? `选中的 ${selectedConfigIds.length} 个配置`
              : config.name,
          )
        }
        onDragEnd={drag.finish}
        onDragOver={(event) => {
          const target = rowDropTarget(event, { kind: 'config', id: config.id })
          drag.over(event, canDrop(target) ? target : null)
        }}
        onDragLeave={drag.leave}
        onDrop={(event) =>
          applyDrop(
            event,
            rowDropTarget(event, { kind: 'config', id: config.id }),
          )
        }
        onContextMenu={(event) => menu.open(event, configActions(config))}
      >
        {selectionMode && (
          <input
            className="config-select-checkbox"
            type="checkbox"
            checked={selectedConfigIds.includes(config.id)}
            onChange={() => toggleConfigSelection(config.id)}
            aria-label={`选择 ${config.name}`}
          />
        )}
        <button
          className="config-select-main"
          data-drag-source
          aria-current={selected?.id === config.id ? 'true' : undefined}
          onClick={() => setSelectedId(config.id)}
          onDoubleClick={() => setDetailsId(config.id)}
          title={`${config.path}\nContext: ${config.context || '未设置'}\n双击查看与编辑`}
        >
          <KeyRound size={16} />
          <span>
            <strong>{config.name}</strong>
            <small title={config.path}>{config.path}</small>
          </span>
        </button>
        <button
          className="config-detail-button icon-button"
          onClick={() => setDetailsId(config.id)}
          aria-label={`查看 ${config.name} 详情`}
          title="查看配置详情"
        >
          <Info size={16} />
        </button>
        <button
          className="sort-drag-handle"
          draggable
          data-drag-handle
          aria-label={`拖动配置 ${config.name}`}
          title="拖动排序或移入分组"
        >
          <GripVertical size={15} />
        </button>
      </div>
      <DropGap
        target={{ kind: 'config', id: config.id, position: 'after' }}
        current={drag.target}
        enabled={
          !!drag.item &&
          canDrop({ kind: 'config', id: config.id, position: 'after' })
        }
        onOver={drag.over}
        onLeave={drag.leave}
        onDrop={applyDrop}
      />
    </Fragment>
  )
  return (
    <div
      className="content-wrap kube-page simple-workspace"
      onClickCapture={drag.suppressClick}
    >
      {menu.node}
      <div
        className={`kube-grid ${directory.className}`}
        style={directory.style}
      >
        <aside
          className={`kube-groups panel ${drag.item ? 'is-dragging' : ''}`}
        >
          {directory.control}
          <div className="side-section-header">
            <span>
              <Server size={17} />
              集群配置 <b>{configs.length}</b>
            </span>
            <button
              className="icon-button"
              aria-label="导入 kubeconfig"
              title="导入 kubeconfig"
              onClick={() => setShowAdd(true)}
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="simple-directory-options">
            <span>
              {query
                ? `${filteredConfigs.length} 个搜索结果`
                : `${groups.length} 个分组`}
            </span>
            <label className="sort-control">
              <ArrowDownUp size={13} />
              <select
                aria-label="配置排序"
                value={sortMode}
                onChange={(event) =>
                  setSortMode(event.target.value as ConfigSort)
                }
              >
                <option value="manual">手动排序</option>
                <option value="created">创建时间</option>
                <option value="name">名称</option>
              </select>
            </label>
          </div>
          {selectionMode && (
            <div
              className="simple-bulk-bar config-selection-toolbar"
              role="toolbar"
              aria-label="批量管理配置"
            >
              <label className="select-all-control">
                <input
                  type="checkbox"
                  checked={
                    displayedConfigs.length > 0 &&
                    displayedConfigs.every((config) =>
                      selectedConfigIds.includes(config.id),
                    )
                  }
                  onChange={toggleVisibleSelection}
                  aria-label="全选当前配置"
                />
                已选 {selectedConfigIds.length}
              </label>
              <select
                aria-label="批量移动配置"
                value=""
                disabled={!selectedConfigIds.length}
                onChange={(event) => {
                  if (event.target.value)
                    moveSelectedConfigs(event.target.value)
                }}
              >
                <option value="">移动到…</option>
                {groups.map((group) => (
                  <option value={group.id} key={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <button
                className="icon-button danger-action"
                disabled={!selectedConfigIds.length}
                onClick={deleteSelectedConfigs}
                aria-label="删除选中配置"
              >
                <Trash2 size={16} />
              </button>
              <button
                className="icon-button"
                onClick={() => {
                  setSelectionMode(false)
                  setSelectedConfigIds([])
                }}
                aria-label="退出配置选择"
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="kube-directory-tree">
            {[
              ...groups,
              ...(displayedConfigs.some(
                (config) =>
                  !groups.some((group) => group.id === config.groupId),
              )
                ? [{ id: '', name: '未分组', color: '#71877f' }]
                : []),
            ].map((group) => {
              const items = displayedConfigs.filter((config) =>
                group.id
                  ? config.groupId === group.id
                  : !groups.some((item) => item.id === config.groupId),
              )
              const closed =
                !query && collapsedGroups[group.id] && hoverGroup !== group.id
              const identity = { kind: 'kube-group' as const, id: group.id }
              const destination = (
                event: React.DragEvent<HTMLElement>,
              ): WorkspaceDropTarget =>
                drag.item?.kind === 'kube-group'
                  ? rowDropTarget(event, identity)
                  : { ...identity, position: 'inside' }
              if (query && !items.length) return null
              return (
                <section className="kube-directory-group" key={group.id}>
                  <DropGap
                    target={{ ...identity, position: 'before' }}
                    current={drag.target}
                    enabled={
                      drag.item?.kind === 'kube-group' &&
                      canDrop({ ...identity, position: 'before' })
                    }
                    onOver={drag.over}
                    onLeave={drag.leave}
                    onDrop={applyDrop}
                  />
                  <div
                    className={`kube-directory-heading drag-sort-row ${isSameDragItem(drag.item, identity) ? 'drag-source' : ''} ${dropClassName(drag.target, identity)}`}
                    data-kube-group-id={group.id}
                    draggable
                    onDragStart={(event) =>
                      drag.start(event, identity, group.name)
                    }
                    onDragEnd={drag.finish}
                    onDragOver={(event) => {
                      const target = destination(event)
                      drag.over(event, canDrop(target) ? target : null)
                    }}
                    onDragLeave={drag.leave}
                    onDrop={(event) => applyDrop(event, destination(event))}
                    onContextMenu={(event) =>
                      menu.open(event, [
                        {
                          label: '编辑分组…',
                          run: () => setGroupEditor(group),
                        },
                        {
                          label: '导入配置到此分组',
                          run: () => {
                            setSelectedGroup(group.id)
                            setShowAdd(true)
                          },
                        },
                        {
                          label: '删除分组（保留配置）',
                          danger: true,
                          disabled: groups.length <= 1 || !group.id,
                          run: () =>
                            setConfirmAction({
                              type: 'group',
                              groupId: group.id,
                            }),
                        },
                      ])
                    }
                  >
                    <button
                      className="kube-directory-toggle"
                      data-drag-source
                      aria-label={`${closed ? '展开' : '收起'}环境分组 ${group.name}`}
                      aria-expanded={!closed}
                      onClick={() =>
                        setCollapsedGroups((current) => ({
                          ...current,
                          [group.id]: !current[group.id],
                        }))
                      }
                    >
                      {closed ? (
                        <ChevronRight size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                      <span className="group-icon">
                        <ListTree
                          size={16}
                          style={{
                            color: `color-mix(in srgb, ${group.color} 60%, var(--muted))`,
                          }}
                        />
                      </span>
                      <span onDoubleClick={() => setGroupEditor(group)}>
                        {group.name}
                      </span>
                      <b>{items.length}</b>
                    </button>
                    <button
                      className="sort-drag-handle"
                      draggable
                      data-drag-handle
                      aria-label={`拖动环境分组 ${group.name}`}
                      title="拖动调整分组顺序"
                    >
                      <GripVertical size={14} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`环境分组选项 ${group.name}`}
                      onClick={(event) =>
                        menu.open(event, [
                          {
                            label: '编辑分组…',
                            run: () => setGroupEditor(group),
                          },
                          {
                            label: '导入配置到此分组',
                            run: () => {
                              setSelectedGroup(group.id)
                              setShowAdd(true)
                            },
                          },
                          {
                            label: '删除分组（保留配置）',
                            danger: true,
                            disabled: groups.length <= 1 || !group.id,
                            run: () =>
                              setConfirmAction({
                                type: 'group',
                                groupId: group.id,
                              }),
                          },
                        ])
                      }
                    >
                      <MoreHorizontal size={17} />
                    </button>
                  </div>
                  {!closed && (
                    <div className="kube-directory-items">
                      {items.map(configRow)}
                      {!items.length && (
                        <button
                          className="directory-group-empty"
                          onClick={() => {
                            setSelectedGroup(group.id)
                            setShowAdd(true)
                          }}
                        >
                          拖入配置，或点击导入
                        </button>
                      )}
                    </div>
                  )}
                  <DropGap
                    target={{ ...identity, position: 'after' }}
                    current={drag.target}
                    enabled={
                      drag.item?.kind === 'kube-group' &&
                      canDrop({ ...identity, position: 'after' })
                    }
                    onOver={drag.over}
                    onLeave={drag.leave}
                    onDrop={applyDrop}
                  />
                </section>
              )
            })}
            {!displayedConfigs.length && query && (
              <div className="panel-empty">
                <Search size={22} />
                <p>没有匹配的配置</p>
                <button className="inline-control" onClick={clearConfigFilters}>
                  清除搜索
                </button>
              </div>
            )}
          </div>
          <div className="directory-footer">
            <button className="toolbar-button" onClick={() => setShowAdd(true)}>
              <FileUp size={15} />
              导入配置
            </button>
            <button
              className="icon-button"
              aria-label="配置管理选项"
              onClick={(event) =>
                menu.open(event, [
                  { label: '新建分组', run: addKubeGroup },
                  { label: '选择多个配置', run: () => setSelectionMode(true) },
                  { label: '展开所有分组', run: () => setCollapsedGroups({}) },
                  {
                    label: '折叠所有分组',
                    run: () =>
                      setCollapsedGroups(
                        Object.fromEntries(
                          groups.map((group) => [group.id, true]),
                        ),
                      ),
                  },
                ])
              }
            >
              <MoreHorizontal size={19} />
            </button>
          </div>
          {drag.item && (
            <div className="drag-status simple-drag-status" role="status">
              {dropHint}
            </div>
          )}
        </aside>
        <section className="command-panel panel simple-config-content">
          {selected ? (
            <>
              <header className="simple-stage-header">
                <div className="simple-stage-title">
                  <KeyRound size={20} />
                  <h1 onDoubleClick={() => setDetailsId(selected.id)}>
                    {selected.name}
                  </h1>
                </div>
                <div className="simple-stage-actions">
                  <button
                    className="toolbar-button"
                    onClick={() => setDetailsId(selected.id)}
                    aria-label="查看配置详情"
                  >
                    <Info size={16} />
                    查看配置
                  </button>
                  <button
                    className="icon-button"
                    aria-label="当前配置选项"
                    onClick={(event) =>
                      menu.open(event, configActions(selected))
                    }
                  >
                    <MoreHorizontal size={20} />
                  </button>
                </div>
              </header>
              <div className="config-source-line">
                <span>
                  {selected.source === 'directory'
                    ? '目录引用'
                    : selected.source === 'clipboard' ||
                        selected.source === 'managed'
                      ? '托管文件'
                      : '文件引用'}
                </span>
                <code title={selected.path}>{selected.path}</code>
                <button
                  className="icon-button"
                  aria-label="复制配置路径"
                  title="复制配置路径"
                  onClick={() => onCopy(selected.path, '路径已复制')}
                >
                  <Copy size={16} />
                </button>
                {window.orbitDesktop && (
                  <button
                    className="icon-button"
                    aria-label="定位配置源文件"
                    title="定位源文件"
                    onClick={() => {
                      void window.orbitDesktop
                        ?.revealKubeconfig(selected.path)
                        .catch((error) => notify(error.message))
                    }}
                  >
                    <FolderOpen size={16} />
                  </button>
                )}
              </div>
              <div className="simple-config-metadata form-row">
                <label>
                  环境变量名称
                  <input
                    aria-label="环境变量名称"
                    aria-invalid={!!envNameError}
                    value={envNameDraft}
                    onChange={(event) => setEnvNameDraft(event.target.value)}
                    onBlur={commitEnvName}
                    onKeyDown={(event) => {
                      if (isCommittedEnter(event)) event.currentTarget.blur()
                    }}
                  />
                </label>
                <label>
                  所属分组
                  <select
                    aria-label="当前配置所属分组"
                    value={selected.groupId}
                    onChange={(event) =>
                      updateConfig(selected.id, (item) => ({
                        ...item,
                        groupId: event.target.value,
                        updatedAt: new Date().toISOString(),
                      }))
                    }
                  >
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {envNameError && (
                <p className="form-error" role="alert">
                  {envNameError}
                </p>
              )}
              <div className="simple-command-section">
                <div className="command-label-row">
                  <h2>生成命令</h2>
                  <button
                    className="inline-control"
                    onClick={() => setShowCommandManager(true)}
                  >
                    <SlidersHorizontal size={15} />
                    管理常用命令
                  </button>
                </div>
                <div className="command-form">
                  <label>
                    常用命令
                    <select
                      id="command-template"
                      aria-label="常用命令"
                      value={templateId}
                      onChange={(event) => setTemplateId(event.target.value)}
                    >
                      {commands.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.command}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-row">
                    <label>
                      Context
                      <select
                        aria-label="Context"
                        value={context}
                        onChange={(event) => changeContext(event.target.value)}
                      >
                        <option value="">
                          使用配置默认（{selected.context || '未设置'}）
                        </option>
                        {contextOptions.map((item) => (
                          <option value={item} key={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      命名空间
                      <input
                        aria-label="命名空间"
                        value={namespace}
                        onChange={(event) => setNamespace(event.target.value)}
                        placeholder="使用配置默认"
                      />
                    </label>
                  </div>
                  <div className="form-row copy-options">
                    <label>
                      复制格式
                      <select
                        aria-label="复制格式"
                        value={commandFormat}
                        onChange={(event) =>
                          setCommandFormat(event.target.value as CommandFormat)
                        }
                      >
                        <option value="variable">命名变量 + 命令</option>
                        <option value="once">仅本次命令</option>
                        <option value="session">当前终端会话</option>
                      </select>
                    </label>
                    <label>
                      终端
                      <select
                        aria-label="终端类型"
                        value={commandShell}
                        onChange={(event) =>
                          setCommandShell(event.target.value as CommandShell)
                        }
                      >
                        <option value="bash">Bash / Zsh</option>
                        <option value="powershell">PowerShell</option>
                      </select>
                    </label>
                  </div>
                  <details className="simple-advanced">
                    <summary>附加参数</summary>
                    <label>
                      <span className="sr-only">附加参数</span>
                      <input
                        aria-label="附加参数"
                        value={extraArgs}
                        onChange={(event) => setExtraArgs(event.target.value)}
                        placeholder="例如 --watch 或 -l app=web"
                      />
                    </label>
                  </details>
                </div>
                <div className="command-preview">
                  <div className="preview-header">
                    <span>命令预览</span>
                    <button
                      className="inline-control"
                      disabled={!!commandError || !variableDefinition}
                      onClick={() =>
                        onCopy(variableDefinition, '变量定义已复制')
                      }
                    >
                      复制变量
                    </button>
                    <button
                      className="copy-command"
                      disabled={!!commandError || !generatedCommand}
                      onClick={() => onCopy(generatedCommand, '命令已复制')}
                    >
                      <Copy size={16} />
                      复制命令
                    </button>
                  </div>
                  <pre aria-label="命令预览">
                    <code>
                      {commandError ? (
                        <span role="alert">{commandError}</span>
                      ) : (
                        generatedCommand
                      )}
                    </code>
                  </pre>
                </div>
                <p className="command-note">
                  {commandFormat === 'session'
                    ? '影响粘贴命令的当前终端会话。'
                    : '仅复制文本，不执行命令，不修改配置文件。'}
                </p>
              </div>
            </>
          ) : (
            <div className="panel-empty">
              <KeyRound size={28} />
              <h2>{query ? '没有匹配的配置' : '选择一个集群配置'}</h2>
              <p>从左侧选择配置，或导入文件、目录及剪贴板内容。</p>
              <button
                className="toolbar-button"
                onClick={() => setShowAdd(true)}
              >
                <Plus size={16} />
                导入配置
              </button>
            </div>
          )}
        </section>
      </div>
      {showAdd && (
        <Modal
          title="导入 kubeconfig"
          className="modal-wide kube-import-modal"
          onClose={() => {
            if (!importBusy) setShowAdd(false)
          }}
        >
          <KubeImportPanel
            onBusyChange={setImportBusy}
            configs={configs}
            groups={groups}
            initialGroupId={selectedGroup}
            onClose={() => setShowAdd(false)}
            onImport={(files, options) => {
              const groupId =
                options.groupId || groups[0]?.id || uid('kube-group')
              const { configs: imported, duplicateCount } = prepareKubeImports(
                files,
                configs,
                { ...options, groupId },
              )
              if (!imported.length) {
                notify('选中的配置已存在，无需重复导入')
                return
              }
              try {
                const values: Record<string, unknown> = {
                  'orbit-kube-configs': [...imported, ...configs],
                }
                if (!groups.length)
                  values['orbit-kube-groups'] = [
                    {
                      id: groupId,
                      name: '导入配置',
                      color: kubeGroupPalette[0],
                    },
                  ]
                commitStorage(values)
                window.dispatchEvent(new window.CustomEvent('orbit:restore'))
              } catch {
                throw new Error(
                  '本地工作区空间不足，请减少本次导入数量。源文件未修改；粘贴内容若已保存，可用单个文件入口再次导入。',
                )
              }
              setSelectedGroup(groupId)
              onClearQuery()
              setSelectedId(imported[0].id)
              setShowAdd(false)
              notify(
                `已导入 ${imported.length} 个配置${duplicateCount ? `，跳过 ${duplicateCount} 个重复文件` : ''}`,
              )
            }}
          />
        </Modal>
      )}
      {showGroupAdd && (
        <Modal title="新建环境分组" onClose={() => setShowGroupAdd(false)}>
          <div className="form-stack">
            <label>
              分组名称
              <input
                autoFocus
                value={newGroup.name}
                onChange={(event) =>
                  setNewGroup((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (isCommittedEnter(event)) saveKubeGroup()
                }}
                placeholder="例如：生产集群"
              />
            </label>
            <label>
              分组颜色
              <ColorPicker
                value={newGroup.color}
                onChange={(color) =>
                  setNewGroup((current) =>
                    current ? { ...current, color } : current,
                  )
                }
              />
            </label>
            <div className="modal-actions">
              <button
                className="ghost-button"
                onClick={() => setShowGroupAdd(false)}
              >
                取消
              </button>
              <button className="primary-button" onClick={saveKubeGroup}>
                <Save size={14} />
                创建分组
              </button>
            </div>
          </div>
        </Modal>
      )}
      {groupEditor && (
        <Modal title="编辑环境分组" onClose={() => setGroupEditor(null)}>
          <div className="form-stack">
            <label>
              分组名称
              <input
                autoFocus
                value={groupEditor.name}
                onChange={(event) =>
                  setGroupEditor((current) =>
                    current
                      ? { ...current, name: event.target.value }
                      : current,
                  )
                }
                onKeyDown={(event) => {
                  if (isCommittedEnter(event)) saveGroupEdit()
                }}
                placeholder="例如：生产集群"
              />
            </label>
            <label>
              分组颜色
              <ColorPicker
                value={groupEditor.color}
                onChange={(color) =>
                  setGroupEditor((current) =>
                    current ? { ...current, color } : current,
                  )
                }
              />
            </label>
            <div className="modal-actions">
              <button
                className="ghost-button"
                onClick={() => setGroupEditor(null)}
              >
                取消
              </button>
              <button className="primary-button" onClick={saveGroupEdit}>
                <Save size={14} />
                保存分组
              </button>
            </div>
          </div>
        </Modal>
      )}
      {detailsId && configs.find((config) => config.id === detailsId) && (
        <ConfigDetailModal
          config={configs.find((config) => config.id === detailsId)!}
          groups={groups}
          onClose={() => setDetailsId(null)}
          onSave={saveDetails}
          onCopy={onCopy}
        />
      )}
      {showCommandManager && (
        <CommandManagerModal
          commands={commands}
          defaultCommandId={defaultCommandId}
          setCommands={setCommands}
          onDefaultCommandChange={onDefaultCommandChange}
          onClose={() => setShowCommandManager(false)}
          notify={notify}
        />
      )}
      {confirmAction && (
        <Modal
          title={
            confirmAction.type === 'configs'
              ? '删除 kubeconfig'
              : '删除环境分组'
          }
          onClose={() => setConfirmAction(null)}
        >
          <div className="confirm-dialog">
            <p>
              {confirmAction.type === 'configs'
                ? `确定删除选中的 ${selectedConfigIds.length} 个 kubeconfig 吗？此操作只会移除 Orbit 中的记录，不会删除磁盘上的源文件。`
                : '确定删除这个环境分组吗？组内配置会自动移动到其他分组。'}
            </p>
            <div className="modal-actions">
              <button
                className="ghost-button"
                onClick={() => setConfirmAction(null)}
              >
                取消
              </button>
              <button
                className="primary-button danger-button"
                onClick={confirmDeleteAction}
              >
                <Trash2 size={14} />
                确认删除
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
