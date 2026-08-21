/** The watch app target — prebuild generates it from here (README: apps/watch). */
module.exports = {
  type: 'watch',
  icon: './icon.png',
  name: 'CalMindWatch',
  // The parent app's watch app is also on this wrist. Two identical icons
  // is a trap, so this one says which it is.
  displayName: 'CalMind Local',
  bundleIdentifier: 'com.seancheren.calmindlocal.watchkitapp',
  deploymentTarget: '10.0',
  // The complication reads the list from the shared container, so the watch
  // app must be in the same group to write it there.
  entitlements: {
    'com.apple.security.application-groups': ['group.com.seancheren.calmindlocal'],
  },
  colors: {},
};
