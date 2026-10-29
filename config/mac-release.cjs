const { build } = require('../package.json')

// No fallback to an unsigned or ad-hoc distributable. This schema is pinned to
// electron-builder 26; v27 moves signing options into mac.sign.
module.exports = {
  ...build,
  extends: null,
  forceCodeSigning: true,
  mac: {
    ...build.mac,
    type: 'distribution',
    hardenedRuntime: true,
    entitlements: 'config/entitlements.mac.plist',
    entitlementsInherit: 'config/entitlements.mac.plist',
    notarize: true,
    target: [{ target: 'dmg', arch: ['arm64', 'x64'] }],
  },
  dmg: { sign: true },
}
