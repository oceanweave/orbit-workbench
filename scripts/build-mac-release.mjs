import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { validateSigningEnvironment, runVerification, verifyMacDistribution } from './mac-distribution.mjs'
import { auditPackage } from './audit-package.mjs'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = require('../package.json')
const { build, Platform } = require('electron-builder')
const { notarize } = require('@electron/notarize')

try {
  if (process.platform !== 'darwin') throw new Error('macOS 签名与公证必须在 macOS 上运行。')
  const identities = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })
  const credentials = validateSigningEnvironment(process.env, identities.status === 0 && /"Developer ID Application:/.test(identities.stdout))
  if (credentials.appleApiKey && !existsSync(credentials.appleApiKey)) throw new Error('APPLE_API_KEY 必须指向本机 .p8 文件；不要直接传入 base64 内容。')
  if (process.argv.includes('--preflight')) {
    console.log('签名及公证配置预检通过；正式构建仍需由 Apple 验证凭据。')
  } else {
    if (!process.env.npm_execpath) throw new Error('请通过 npm run app:release:mac 执行正式构建。')
    const compile = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'build'], { cwd: root, stdio: 'inherit' })
    if (compile.status !== 0) throw new Error('前端构建失败。请通过 npm run app:release:mac 执行。')
    const config = require('../config/mac-release.cjs')
    // Fresh outputs prevent a failed build from being mistaken for an older success.
    for (const arch of ['arm64', 'x64']) {
      rmSync(join(root, 'release', `Orbit-Workbench-${version}-${arch}.dmg`), { force: true })
    }
    await build({ projectDir: root, config, publish: 'never', targets: Platform.MAC.createTarget() })
    for (const arch of ['arm64', 'x64']) {
      const app = join(root, 'release', arch === 'arm64' ? 'mac-arm64' : 'mac', 'Orbit Workbench.app')
      const dmg = join(root, 'release', `Orbit-Workbench-${version}-${arch}.dmg`)
      auditPackage(join(app, 'Contents/Resources/app.asar'))
      // electron-builder notarizes/staples the app; notarize the final signed
      // container too, so both the image and app can be assessed offline.
      await notarize({ appPath: dmg, ...credentials })
      verifyMacDistribution(app, dmg)
      const mount = mkdtempSync(join(tmpdir(), 'orbit-distribution-'))
      let attached = false
      try {
        runVerification('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg])
        attached = true
        const installed = join(mount, 'Orbit Workbench.app')
        verifyMacDistribution(installed)
        auditPackage(join(installed, 'Contents/Resources/app.asar'))
        const digest = (bundle) => createHash('sha256').update(readFileSync(join(bundle, 'Contents/Resources/app.asar'))).digest('hex')
        if (digest(app) !== digest(installed)) throw new Error('DMG 中的应用与已验证构建不一致。')
      } finally {
        if (attached) runVerification('hdiutil', ['detach', mount])
        rmSync(mount, { recursive: true, force: true })
      }
      console.log(`${arch} DMG：签名、公证票据、Gatekeeper、挂载及隐私检查通过。`)
    }
  }
} catch (error) {
  let message = error.message
  for (const key of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_API_KEY']) {
    if (process.env[key]) message = message.replaceAll(process.env[key], '<REDACTED>')
  }
  console.error(message)
  process.exitCode = 1
}
