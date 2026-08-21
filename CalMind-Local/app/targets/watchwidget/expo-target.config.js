/**
 * The watch-face complication — a WidgetKit extension EMBEDDED IN THE WATCH
 * APP (the plugin does that for type 'watch-widget'), showing the open-
 * reminder count and the next one up on the Modular face's accessory slots.
 *
 * It is a separate process from CalMindWatch, so it cannot read the app's
 * own UserDefaults — the two share the App Group container instead, which
 * WatchStore writes and ComplicationProvider reads. The group is the same
 * one app.json names, and it PROVED OUT on the free Personal Team
 * (BUILD SUCCEEDED with the entitlement, profile carries the group).
 */
module.exports = {
  type: 'watch-widget',
  name: 'CalMindComplication',
  displayName: 'CalMind Local',
  // A widget extension's id must extend its HOST app's — the watch app, not
  // the phone app. The default (root id + name) would parent it wrongly.
  bundleIdentifier: 'com.seancheren.calmindlocal.watchkitapp.widget',
  deploymentTarget: '10.0',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.seancheren.calmindlocal'],
  },
  colors: {},
};
