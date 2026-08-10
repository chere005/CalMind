/**
 * The iPHONE home-screen widget — today's reminders with a working check-off,
 * and a tap anywhere else opens the app (WidgetKit's default for a widget
 * tap; no scheme needed).
 *
 * A widget is its own process: it reads the same App Group cache the watch
 * complication reads ("watchlist.json"). WatchBridge writes that key on the
 * PHONE on every store change — it did not until 2026-08-10, which is why
 * this widget showed its waiting state forever: the only writer was the
 * WATCH app, filling the watch's own container on another device. Its
 * check-offs queue in the group as "pendingTicks"
 * for the app to apply through the same toggle a phone tap uses — the watch
 * tick pattern, one transport over.
 *
 * Directory name matters: apple-targets embeds by directory sort order, and
 * 'appwidget' sorting before 'watch' is what lands this in the PHONE app.
 * The complication got embedded into the phone once for exactly this reason
 * (it was named 'complication' then; it is 'watchwidget' now).
 *
 * deploymentTarget 17.0: an interactive Button(intent:) in a widget is
 * iOS 17's feature — below that a widget is a poster, not a control.
 */
module.exports = {
  type: 'widget',
  name: 'CalMindWidget',
  displayName: 'CalMind',
  bundleIdentifier: 'com.seancheren.calmind.appwidget',
  deploymentTarget: '17.0',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.seancheren.calmind'],
  },
  colors: {},
};
