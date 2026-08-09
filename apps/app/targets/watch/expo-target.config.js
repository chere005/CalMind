/** The watch app target — prebuild generates it from here (README: apps/watch). */
module.exports = {
  type: 'watch',
  icon: './icon.png',
  name: 'CalMindWatch',
  bundleIdentifier: 'com.seancheren.calmind.watchkitapp',
  deploymentTarget: '10.0',
  // The complication reads the list from the shared container, so the watch
  // app must be in the same group to write it there.
  entitlements: {
    'com.apple.security.application-groups': ['group.com.seancheren.calmind'],
  },
  colors: {},
};
