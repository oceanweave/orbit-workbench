import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { generateKubeCommand, validateEnvName } from '../shared/kube-command.mjs'

test('default context/namespace are omitted, literal default is explicit', () => {
  const base = { path: '~/.kube/demo', envName: 'DEMO', command: 'get pods' }
  assert.equal(generateKubeCommand(base).text, 'DEMO="$HOME/.kube/demo"\nKUBECONFIG="$DEMO" kubectl get pods')
  assert.match(generateKubeCommand({ ...base, context: 'default', namespace: 'default' }).text, /--context 'default' -n 'default'$/)
  for (const format of ['variable', 'once', 'session']) {
    const result = generateKubeCommand({ ...base, format })
    assert.ok(result.text.includes('kubectl get pods'))
    assert.equal(result.text.split('\n').length, format === 'once' ? 1 : 2)
  }
})

const bashPath = process.platform === 'win32' ? join(process.env.ProgramFiles || 'C:\Program Files', 'Git', 'bin', 'bash.exe') : 'bash'
test('generated bash commands roundtrip special paths and arguments without executing their contents', { skip: process.platform === 'win32' && !existsSync(bashPath) ? 'Git Bash is required for a real shell roundtrip' : false }, () => {
  for (const format of ['variable', 'once', 'session']) {
    const path = '/tmp/a b/引号\'"$HOME`whoami`$(whoami).txt'
    const context = 'team\'a $(echo hacked)'
    const namespace = 'default'
    const { text } = generateKubeCommand({ path, envName: 'DEMO', command: 'get pods', context, namespace, format })
    const output = execFileSync(bashPath, ['-c', 'kubectl() { printf "%s\\n" "$KUBECONFIG" "$@"; };\n' + text], { encoding: 'utf8' })
    assert.deepEqual(output.trimEnd().split('\n'), [path, 'get', 'pods', '--context', context, '-n', namespace])
  }
})

test('PowerShell uses its own quoting and one-off format restores the previous environment', () => {
  const options = { path: "C:\\team's\\config.txt", envName: 'DEMO', command: 'get pods', shell: 'powershell' }
  assert.match(generateKubeCommand(options).text, /^\$DEMO = 'C:\\team''s\\config.txt'/)
  assert.match(generateKubeCommand({ ...options, format: 'once' }).text, /finally/)
  assert.match(generateKubeCommand({ ...options, format: 'session' }).text, /^\$env:KUBECONFIG/)
  for (const name of ['PATH', 'HOME', 'KUBECONFIG', '1ABC', 'A-B']) assert.ok(validateEnvName(name))
  assert.ok(validateEnvName('DEMO', ['DEMO']))
  assert.equal(validateEnvName('DEMO_2', ['DEMO']), '')
})
