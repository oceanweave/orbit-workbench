import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPackage } from '@electron/asar'
import { auditPackage } from '../scripts/audit-package.mjs'

test('release archive accepts program resources and rejects imported data regardless of filename suffix', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orbit-release-audit-'))
  const source = join(directory, 'app')
  const archive = join(directory, 'app.asar')
  try {
    await mkdir(join(source, 'dist', 'assets'), { recursive: true })
    await mkdir(join(source, 'electron'))
    await mkdir(join(source, 'shared'))
    for (const name of ['package.json', 'dist/index.html', 'dist/assets/app.js', 'dist/assets/app.css', 'electron/main.cjs', 'shared/kubeconfig.mjs']) await writeFile(join(source, name), '{}')
    await createPackage(source, archive)
    assert.equal(auditPackage(archive).checked, 6)
    for (const name of ['production', 'cluster.txt', 'config.yaml', 'bookmarks.html', 'orbit-workbench.backup.json', 'shared/cluster.txt', 'shared/cluster.mjs', 'electron/private.cjs', 'dist/assets/bookmarks.json', 'Local Storage/leveldb/000003.log']) {
      await mkdir(join(source, name, '..'), { recursive: true })
      await writeFile(join(source, name), 'synthetic fixture; contains no real user data')
      await createPackage(source, archive)
      assert.throws(() => auditPackage(archive), /禁止发布/)
      await rm(join(source, name))
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
