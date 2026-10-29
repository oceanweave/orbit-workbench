import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { validateSigningEnvironment, verifyMacDistribution } from '../scripts/mac-distribution.mjs'

const require = createRequire(import.meta.url)
const credentials = { CSC_LINK: 'synthetic-certificate', APPLE_ID: 'test@example.invalid', APPLE_APP_SPECIFIC_PASSWORD: 'synthetic-secret', APPLE_TEAM_ID: 'TESTTEAM01' }

test('macOS releases reject missing signing or notarization credentials without exposing secrets', () => {
  assert.throws(() => validateSigningEnvironment({}), /Developer ID/)
  assert.throws(() => validateSigningEnvironment({ CSC_LINK: 'synthetic-secret' }), /公证/)
  assert.throws(() => validateSigningEnvironment({ ...credentials, CSC_NAME: '-' }), /ad-hoc/)
  assert.throws(() => validateSigningEnvironment({ ...credentials, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }), /签名/)
  assert.throws(() => validateSigningEnvironment({ ...credentials, APPLE_ID: '' }), (error) => /APPLE_ID/.test(error.message) && !error.message.includes('synthetic-secret'))
  assert.doesNotThrow(() => validateSigningEnvironment(credentials))
  assert.doesNotThrow(() => validateSigningEnvironment({ APPLE_KEYCHAIN_PROFILE: 'test-profile' }, true))
  assert.throws(() => validateSigningEnvironment({ CSC_LINK: 'test', APPLE_API_KEY: 'test' }), /APPLE_API_KEY_ID/)
})

test('local ad-hoc packages cannot accidentally use the release artifact location or policy', () => {
  const local = require('../config/mac-local.cjs')
  const release = require('../config/mac-release.cjs')
  assert.notEqual(local.directories.output, release.directories.output)
  assert.match(local.mac.artifactName, /-local/)
  assert.equal(local.mac.identity, '-')
  assert.equal(release.forceCodeSigning, true)
  assert.equal(release.mac.type, 'distribution')
  assert.equal(release.mac.hardenedRuntime, true)
  assert.equal(release.mac.notarize, true)
  assert.notEqual(release.mac.identity, '-')
  assert.deepEqual(release.mac.target[0].arch, ['arm64', 'x64'])
})

test('both macOS profiles conform to the locked builder schema and release resolves both architectures', async () => {
  const { validateConfiguration } = require('app-builder-lib/out/util/config/config.js')
  const { DebugLogger } = require('builder-util')
  const { computeArchToTargetNamesMap } = require('app-builder-lib/out/targets/targetFactory.js')
  const { Platform, Arch } = require('electron-builder')
  const release = require('../config/mac-release.cjs')
  for (const config of [release, require('../config/mac-local.cjs')]) await validateConfiguration(config, new DebugLogger())
  const targets = computeArchToTargetNamesMap(new Map(), { platformSpecificBuildOptions: release.mac }, Platform.MAC)
  assert.deepEqual(targets.get(Arch.arm64), ['dmg'])
  assert.deepEqual(targets.get(Arch.x64), ['dmg'])
})

test('distribution verifier rejects invalid bundles, missing tickets, and Gatekeeper denial', () => {
  const app = '/synthetic/Orbit.app', dmg = '/synthetic/Orbit.dmg'
  for (const failure of ['codesign', 'stapler', 'spctl', 'hdiutil']) {
    assert.throws(() => verifyMacDistribution(app, dmg, (command, args) => {
      if (command === failure || args.includes(failure)) throw new Error(`synthetic ${failure} rejection`)
      return command === 'codesign' && args.includes('-dv') ? 'Authority=Developer ID Application: Synthetic\nTeamIdentifier=TESTTEAM01\nflags=0x10000(runtime)' : ''
    }), new RegExp(failure))
  }
  assert.throws(() => verifyMacDistribution(app, dmg, (command, args) => command === 'codesign' && args.includes('-dv') ? 'Signature=adhoc' : ''), /Developer ID/)
})

test('distribution verifier checks app and image integrity plus app trust and stapled ticket', () => {
  const calls = []
  verifyMacDistribution('/synthetic/Orbit.app', '/synthetic/Orbit.dmg', (command, args) => {
    calls.push([command, ...args])
    return command === 'codesign' && args.includes('-dv') ? 'Authority=Developer ID Application: Synthetic\nTeamIdentifier=TESTTEAM01\nflags=0x10000(runtime)' : ''
  })
  assert.ok(calls.some((call) => call[0] === 'spctl' && call.includes('/synthetic/Orbit.app')))
  assert.ok(calls.some((call) => call[0] === 'xcrun' && call[1] === 'stapler' && call.includes('/synthetic/Orbit.app')))
  assert.ok(calls.some((call) => call[0] === 'hdiutil' && call.includes('/synthetic/Orbit.dmg')))
})
