import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// Make the precise failure visible in the job annotations even when GitHub
// requires sign-in to read full logs. All tests run with synthetic local data.
const files = readdirSync('tests').filter((name) => name.endsWith('.test.mjs')).sort().map((name) => join('tests', name))
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
if (result.status !== 0 && process.env.GITHUB_ACTIONS === 'true') {
  const failures = result.stdout?.match(/^not ok[^\n]*\n(?:[\s\S]*?^  \.\.\.$)?/gm) ?? [result.error?.message ?? 'Test runner failed; inspect the job log.']
  const escape = (value) => value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
  for (const failure of failures) console.log(`::error title=Regression test failure::${escape(failure.slice(0, 6000))}`)
}
process.exitCode = result.status ?? 1
