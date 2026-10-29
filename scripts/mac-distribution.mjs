import { spawnSync } from 'node:child_process'

// Match the precedence used by electron-builder 26. Never include credential
// values in exceptions or logs (not even malformed ones).
export function validateSigningEnvironment(env, hasDeveloperId = false) {
  if (env.CSC_NAME === '-') throw new Error('正式发布禁止使用 ad-hoc 签名。')
  if (env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') throw new Error('正式发布不能禁用签名发现。')
  if (!env.CSC_LINK && !hasDeveloperId) throw new Error('缺少 Developer ID Application 证书及私钥；请配置 MAC_CSC_LINK 或本机钥匙串。')
  const required = (keys) => {
    const missing = keys.filter((key) => !env[key])
    if (missing.length) throw new Error(`Apple 公证凭据不完整，缺少：${missing.join(', ')}。`)
  }
  if (env.APPLE_ID || env.APPLE_APP_SPECIFIC_PASSWORD) {
    required(['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'])
    return { appleId: env.APPLE_ID, appleIdPassword: env.APPLE_APP_SPECIFIC_PASSWORD, teamId: env.APPLE_TEAM_ID }
  }
  if (env.APPLE_API_KEY || env.APPLE_API_KEY_ID || env.APPLE_API_ISSUER) {
    required(['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'])
    return { appleApiKey: env.APPLE_API_KEY, appleApiKeyId: env.APPLE_API_KEY_ID, appleApiIssuer: env.APPLE_API_ISSUER }
  }
  if (env.APPLE_KEYCHAIN_PROFILE) return { keychainProfile: env.APPLE_KEYCHAIN_PROFILE, ...(env.APPLE_KEYCHAIN ? { keychain: env.APPLE_KEYCHAIN } : {}) }
  throw new Error('缺少 Apple 公证凭据，请配置 Apple ID、API Key 或钥匙串公证 profile。')
}

export function runVerification(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000 })
  if (result.error || result.status !== 0) throw new Error(`${command} 校验失败：${result.error?.message || `${result.stdout || ''}${result.stderr || ''}`}`)
  return `${result.stdout || ''}${result.stderr || ''}`
}

export function verifyMacDistribution(app, dmg, run = runVerification) {
  run('codesign', ['--verify', '--deep', '--strict', app])
  const signature = run('codesign', ['-dv', '--verbose=4', app])
  if (!/^Authority=Developer ID Application:/m.test(signature) || !/\bruntime\b/.test(signature)) throw new Error('正式应用必须使用 Developer ID Application 签名并启用 Hardened Runtime。')
  run('xcrun', ['stapler', 'validate', app])
  run('spctl', ['--assess', '--type', 'execute', '--verbose=4', app])
  if (dmg) {
    run('hdiutil', ['verify', dmg])
    run('codesign', ['--verify', '--strict', dmg])
    if (!/^Authority=Developer ID Application:/m.test(run('codesign', ['-dv', '--verbose=4', dmg]))) throw new Error('DMG 缺少 Developer ID Application 签名。')
    run('xcrun', ['stapler', 'validate', dmg])
    run('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=4', dmg])
  }
}
