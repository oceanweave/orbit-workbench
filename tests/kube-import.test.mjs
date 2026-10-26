import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { stringify } from 'yaml'
import { inspectKubeconfig, prepareKubeImports, MAX_KUBECONFIG_BYTES } from '../shared/kubeconfig.mjs'
import kubeFiles from '../electron/kube-files.cjs'

// Entirely synthetic. Fixtures are generated in OS temp folders, never in the repo.
const fixture = () => ({
  apiVersion: 'v1', kind: 'Config',
  clusters: [{ name: 'first', cluster: { server: 'https://first.invalid' } }, { name: 'second', cluster: { server: 'https://second.invalid' } }],
  contexts: [{ context: { cluster: 'first', user: 'demo' }, name: 'context-first' }, { context: { cluster: 'second', user: 'demo' }, name: 'context-second' }],
  users: [{ name: 'demo', user: {} }], 'current-context': 'context-second',
})
const yaml = () => stringify(fixture())
const sandbox = async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-kube-test-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return root
}

test('parses actual context-first YAML ordering and resolves the selected cluster', () => {
  assert.deepEqual(inspectKubeconfig(yaml()), { context: 'context-second', contexts: ['context-first', 'context-second'], server: 'https://second.invalid' })
  assert.equal(inspectKubeconfig(JSON.stringify(fixture())).context, 'context-second')
  assert.equal(inspectKubeconfig('\ufeff' + yaml().replace(/\n/g, '\r\n')).context, 'context-second')
})

test('rejects unrelated YAML, binary, malformed YAML and oversized files without leaking source snippets', () => {
  for (const content of ['', 'hello', 'kind: Deployment\napiVersion: apps/v1', '\0binary', 'private-token: [SYNTHETIC-DO-NOT-LOG', 'x'.repeat(MAX_KUBECONFIG_BYTES + 1)]) {
    assert.throws(() => inspectKubeconfig(content), (error) => !error.message.includes('SYNTHETIC-DO-NOT-LOG'))
  }
})

test('single-file import accepts every extension, preserves the source bytes and never executes auth plugins', async (t) => {
  const root = await sandbox(t)
  const config = fixture()
  const sentinel = path.join(root, 'must-not-exist')
  config.users[0].user = { exec: { command: 'touch', args: [sentinel], apiVersion: 'client.authentication.k8s.io/v1' } }
  const content = stringify(config)
  for (const filename of ['config', 'production.txt', 'dev.yaml', 'stage.yml', 'lab.config', 'another.conf', 'custom.anything', '中文环境']) {
    const target = path.join(root, filename)
    await fs.writeFile(target, content)
    const before = await fs.stat(target)
    const imported = await kubeFiles.readKubeFile(target)
    assert.equal(imported.content, content)
    assert.equal(imported.context, 'context-second')
    assert.equal((await fs.stat(target)).mtimeMs, before.mtimeMs)
    assert.equal(await fs.readFile(target, 'utf8'), content)
  }
  await assert.rejects(fs.access(sentinel))
})

test('recursive directory scan finds nested extensionless/txt/JSON configs, ignores invalid files and symlink loops', async (t) => {
  const root = await sandbox(t)
  await fs.mkdir(path.join(root, 'nested', 'deep'), { recursive: true })
  await fs.mkdir(path.join(root, '.git'))
  await fs.mkdir(path.join(root, 'node_modules'))
  await fs.writeFile(path.join(root, 'config'), yaml())
  await fs.writeFile(path.join(root, 'nested', 'prod.txt'), yaml())
  await fs.writeFile(path.join(root, 'nested', 'deep', 'json.custom'), JSON.stringify(fixture()))
  await fs.writeFile(path.join(root, '.git', 'ignored'), yaml())
  await fs.writeFile(path.join(root, 'node_modules', 'ignored'), yaml())
  await fs.writeFile(path.join(root, 'readme.txt'), 'not a kubeconfig')
  await fs.writeFile(path.join(root, 'binary'), Buffer.from([0, 255, 12]))
  await fs.writeFile(path.join(root, 'too-large'), 'x'.repeat(MAX_KUBECONFIG_BYTES + 1))
  if (process.platform !== 'win32') await fs.symlink(root, path.join(root, 'nested', 'loop'))
  const result = await kubeFiles.scanKubeDirectory(root)
  assert.deepEqual(result.files.map((item) => item.relativePath).sort(), ['config', path.join('nested', 'deep', 'json.custom'), path.join('nested', 'prod.txt')])
  assert.equal(result.truncated, false)
  assert.ok(result.skipped.length >= 3)
  const shallow = await kubeFiles.scanKubeDirectory(root, { recursive: false })
  assert.deepEqual(shallow.files.map((item) => item.relativePath), ['config'])
})

test('deduplicates file paths, allocates distinct env names, and preserves grouping and original text', () => {
  const content = yaml()
  const existing = [{ path: '/clusters/config', envName: 'CONFIG', name: 'existing' }]
  const { configs, duplicateCount } = prepareKubeImports([
    { path: '/clusters/config', content }, { path: '/a/config', content }, { path: '/b/config', content }, { path: '/b/config', content },
  ], existing, { source: 'directory', groupId: 'test-group', tags: ['demo'] })
  assert.equal(duplicateCount, 2)
  assert.deepEqual(configs.map((item) => item.envName), ['CONFIG_2', 'CONFIG_3'])
  assert.equal(new Set(configs.map((item) => item.id)).size, 2)
  assert.ok(configs.every((item) => item.groupId === 'test-group' && item.content === content && item.context === 'context-second'))
  assert.equal(prepareKubeImports([{ path: 'C:\\Clusters\\PROD.txt', content }], [{ path: 'c:/clusters/prod.txt', name: 'prod' }], { source: 'file', groupId: '' }).duplicateCount, 1)
})

test('clipboard import saves privately, supports Unicode, and refuses to overwrite or escape the target folder', async (t) => {
  const root = await sandbox(t)
  const directory = path.join(root, 'private', 'configs')
  const input = { directoryPath: directory, fileName: '生产.txt', content: yaml() }
  const result = await kubeFiles.saveManagedKubeFile(input)
  assert.equal(await fs.readFile(result.path, 'utf8'), input.content)
  if (process.platform !== 'win32') assert.equal((await fs.stat(result.path)).mode & 0o777, 0o600)
  await assert.rejects(kubeFiles.saveManagedKubeFile(input), /同名文件已存在/)
  assert.equal(await fs.readFile(result.path, 'utf8'), input.content)
  for (const fileName of ['../escape', '..', 'bad/name', 'bad\\name', 'trailing.', 'CON.txt', 'NUL']) {
    await assert.rejects(kubeFiles.saveManagedKubeFile({ ...input, fileName }), /有效的文件名/)
  }
})

test('bounded chunk reader preserves a large configuration exactly', async (t) => {
  const root = await sandbox(t)
  const content = yaml() + '# ' + 'synthetic-comment '.repeat(12000) + '\n'
  const target = path.join(root, 'large.txt')
  await fs.writeFile(target, content)
  assert.equal((await kubeFiles.readKubeFile(target)).content, content)
})

test('clipboard import refuses Git repository directories, including symlinked parents', async (t) => {
  const root = await sandbox(t)
  const repo = path.join(root, 'fake-repo')
  await fs.mkdir(repo)
  await fs.writeFile(path.join(repo, '.git'), 'gitdir: /synthetic-only')
  const input = { directoryPath: path.join(repo, 'private', 'new'), fileName: 'config', content: yaml() }
  await assert.rejects(kubeFiles.saveManagedKubeFile(input), /代码仓库以外/)
  await assert.rejects(fs.access(path.join(repo, 'private')))
  if (process.platform !== 'win32') {
    const linked = path.join(root, 'linked')
    await fs.symlink(repo, linked)
    await assert.rejects(kubeFiles.saveManagedKubeFile({ ...input, directoryPath: path.join(linked, 'nested') }), /代码仓库以外/)
  }
})
