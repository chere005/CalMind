import ExpoModulesCore
import WatchConnectivity
import WidgetKit

/**
 The JS side calls WatchBridge.push(json) after every store change (src/watch.ts);
 this keeps the latest list and ships it as the application context — the suite's
 phone→watch pattern: the watch always gets the newest full list, never a queue.

 The RETURN path (Sean's reversal of the read-only rule, 2026-08-09): the watch
 queues {tick: id} as transferUserInfo — it survives the phone being away — and
 it lands here as an "onTick" event. JS applies it through the same
 reminderToggle the phone's own tap uses, so repeats roll, sync runs, and the
 next push closes the loop by refreshing the watch. Two-device conflicts keep
 the suite's existing rule: last writer wins through the ordinary store.
 */
public class WatchBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchBridge")

    Events("onTick")

    OnCreate {
      WatchSession.shared.activate()
      WatchSession.shared.onTick = { [weak self] id in
        self?.sendEvent("onTick", ["id": id])
      }
    }

    Function("push") { (json: String) in
      WatchSession.shared.push(json: json)
    }

    /// The widget's queued check-offs, handed to JS to apply through the
    /// same toggle as everything else. Returns and clears in one step.
    Function("drainWidgetTicks") { () -> [String] in
      WatchSession.drainWidgetTicks()
    }

    /// Which calendars the widgets are set to — the UNION of every
    /// instance's selection (Sean's word, 2026-08-19), each written into the
    /// App Group as its widget renders, because a WidgetKit configuration is
    /// private to its own instance and there is no API that hands it to the
    /// containing app. Before the union, two differently-configured widgets
    /// overwrote one shared key and the watch mirrored whichever rendered
    /// last — an extra widget could silently HIDE a calendar from the wrist.
    /// A union can only add. Empty when no widget has ever rendered — which
    /// reads as "all calendars", the same as an empty selection.
    Function("widgetCalendars") { () -> [String] in
      let store = UserDefaults(suiteName: "group.com.seancheren.calmindlocal")
      let sets = (store?.dictionary(forKey: "widgetCalSets") as? [String: [String: Any]]) ?? [:]
      return unionWidgetSelections(sets, legacy: store?.stringArray(forKey: "widgetCalendars"),
                                   now: Date().timeIntervalSince1970)
    }
  }
}

/// The union rule, pure so tools/check-widget-feed.sh can run it against the
/// writer in HomeWidget.swift — the same seam-checker arrangement every other
/// cross-process rule here lives under.
///
///  - Entries older than 48 hours are a DELETED widget's ghost, not a voice:
///    live instances re-render at least daily (the midnight timeline), so a
///    stale stamp means nobody holds that configuration any more. The ghost's
///    only possible sin while it lasts is showing EXTRA calendars — the union
///    can never hide one, which is the property Sean asked for.
///  - Any fresh EMPTY selection means that widget shows every calendar, so
///    the union is every calendar — said as [], the rule the watch and the
///    widget already share.
///  - Sorted, because the phone's moved-detector compares stringified lists
///    and a dictionary's iteration order is noise, not a configuration
///    change.
///  - No fresh entries at all falls back to the legacy single-selection key,
///    so the first launch after this update mirrors yesterday's selection
///    rather than nothing while the widgets wake up and write theirs.
func unionWidgetSelections(_ sets: [String: [String: Any]], legacy: [String]?, now: Double) -> [String] {
  let fresh = sets.values.filter { ((($0["at"] as? Double)) ?? 0) > now - 48 * 3600 }
  if fresh.isEmpty { return legacy ?? [] }
  var out = Set<String>()
  for entry in fresh {
    let cals = (entry["cals"] as? [String]) ?? []
    if cals.isEmpty { return [] }
    out.formUnion(cals)
  }
  return out.sorted()
}

/// Owns the WCSession: activates once, remembers the latest list, and re-sends on
/// (re)activation so a push made while the session was cold still arrives.
final class WatchSession: NSObject, WCSessionDelegate {
  static let shared = WatchSession()
  private var pending: String?
  var onTick: ((String) -> Void)?

  func activate() {
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  func push(json: String) {
    pending = json
    // The PHONE's home-screen widget reads this, and until now nothing wrote
    // it. HomeWidget.swift reads "watchlist.json" out of the App Group, and
    // the only writer of that key was WatchStore.swift — which runs on the
    // WATCH, writing the watch's own container on a different device. So the
    // complication had data and the phone widget never could: it showed its
    // waiting state forever, however many times the app was opened.
    //
    // The target's own config comment said "written by WatchBridge on every
    // store change". It was not. A comment describing a thing nobody
    // implemented reads exactly like a thing that works.
    //
    // Written FIRST and unconditionally: the widget's data must not depend on
    // whether a watch is paired, activated or reachable — every guard below
    // this point is about WCSession, and a phone with no watch at all should
    // still fill its widget.
    Self.cacheForWidget(json)

    guard WCSession.isSupported() else {
      NSLog("[WatchBridge] WCSession not supported on this device")
      return
    }
    let s = WCSession.default
    guard s.activationState == .activated else {
      NSLog("[WatchBridge] not activated yet (state=%d) — holding %d bytes", s.activationState.rawValue, json.count)
      return
    }
    // The three preconditions WCSession enforces before it will carry
    // anything. A sideloaded watch app (devicectl straight to the wrist,
    // which is how this one got there) is the case where isWatchAppInstalled
    // comes back false while everything LOOKS right — pairing fine, both
    // apps open, and no delivery. Say which one is false.
    NSLog("[WatchBridge] paired=%@ watchAppInstalled=%@ reachable=%@ bytes=%d",
          s.isPaired ? "yes" : "NO",
          s.isWatchAppInstalled ? "yes" : "NO",
          s.isReachable ? "yes" : "no",
          json.count)
    // Whether the feed carries events at all, without putting Sean's data in
    // a log: an empty array is a distinct substring. 'No events on the watch'
    // is either the phone sending none or the watch not drawing them, and
    // those have opposite fixes.
    NSLog("[WatchBridge] events empty=%@", json.contains("\"events\":[]") ? "YES" : "no")
    do {
      try s.updateApplicationContext(["list": json])
      pending = nil
      NSLog("[WatchBridge] context delivered")
    } catch {
      // Failure was a silent `try?` here while Sean spent a day on 'my watch
      // is not syncing' — the .catch(() => {}) pattern in Swift form. The
      // list stays in `pending`; reachability and re-activation both retry
      // it, and the log finally says what happened.
      NSLog("[WatchBridge] updateApplicationContext failed: %@", String(describing: error))
    }
  }

  /// The watch coming into range is the moment a failed push becomes
  /// possible again — retry the one we are holding.
  func sessionReachabilityDidChange(_ session: WCSession) {
    if let json = pending { push(json: json) }
  }

  func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
    if let error { NSLog("[WatchBridge] activation failed: %@", String(describing: error)) }
    if let json = pending { push(json: json) }
  }

  /// The watch's queued ticks arrive here — including a batch at once if the
  /// phone was away a while. Main queue: the handler reaches React state.
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    guard let id = userInfo["tick"] as? String else { return }
    DispatchQueue.main.async { self.onTick?(id) }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }
}

/**
 The home-screen widget's check-offs.

 The widget is its own process and cannot reach the store, so a tap queues
 the id in the shared App Group and the app drains it here on foreground.
 Same destination as a watch tick: reminderToggle, so repeats roll and sync
 runs exactly as a tap in the app would.

 Drained ATOMICALLY — read and clear together — so a tick cannot be applied
 twice if the app is foregrounded twice in quick succession, and cannot be
 lost between the read and the clear.
 */
extension WatchSession {
  static func drainWidgetTicks() -> [String] {
    let d = UserDefaults(suiteName: "group.com.seancheren.calmindlocal")
    let ticks = d?.stringArray(forKey: "pendingTicks") ?? []
    if !ticks.isEmpty {
      d?.removeObject(forKey: "pendingTicks")
      // The queued ticks are gone, so the widget's own "already ticked" list
      // is stale — the app owns those rows now. Ask for a redraw so the
      // widget does not keep showing a tick it has already handed over.
      WidgetCenter.shared.reloadAllTimelines()
    }
    return ticks
  }

  /// The phone-side write of the cache the home-screen widget reads, plus the
  /// nudge that makes it redraw. Both halves are needed: WidgetKit will not
  /// re-read the group on its own schedule quickly enough to feel connected
  /// to the app, and a widget that updates an hour later reads as broken.
  static func cacheForWidget(_ json: String) {
    guard let d = UserDefaults(suiteName: "group.com.seancheren.calmindlocal") else {
      NSLog("[WatchBridge] no App Group — the widget cannot be fed")
      return
    }
    d.set(Data(json.utf8), forKey: "watchlist.json")
    WidgetCenter.shared.reloadAllTimelines()
  }
}
