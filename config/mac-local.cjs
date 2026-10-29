const { build } = require('../package.json')

// Local development only. A valid ad-hoc signature seals the renamed bundle,
// but does not establish Developer ID trust on another Mac.
module.exports = {
  ...build,
  extends: null,
  directories: { ...build.directories, output: 'release/local-macos' },
  mac: {
    ...build.mac,
    identity: '-',
    hardenedRuntime: false,
    notarize: false,
    artifactName: 'Orbit-Workbench-${version}-${arch}-local.${ext}',
  },
}
