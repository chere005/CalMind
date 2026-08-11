import Foundation
import WatchConnectivity
import WidgetKit

struct WatchItem: Codable, Identifiable {
    let id: String
    let text: String
    let due: String?        // "YYYY-MM-DD"
    let time: String?       // "HH:MM"
    let done: Bool
    // Optional so a cache written before the wrist grouped by folder still
    // decodes — the same widening the feed has always used.
    let folderId: String?
    let sectionId: String?
}

/// A folder and a section, so the wrist can show the phone's structure.
struct WatchFolder: Codable, Identifiable {
    let id: String
    let name: String
    let color: String
}

struct WatchSection: Codable, Identifiable {
    let id: String
    let name: String
    let folderId: String
}

/// The list ALREADY GROUPED, decided in core. A nil name means the header
/// is not drawn — the watch draws what it is told rather than deciding, so
/// the three header rules live somewhere a test can reach them.
struct WatchGroup: Codable {
    struct Part: Codable {
        let sectionName: String?
        let items: [WatchItem]
    }
    let folderName: String?
    let sections: [Part]
}

struct WatchEvent: Codable, Identifiable {
    let id: String
    let text: String
    let date: String    // "YYYY-MM-DD"
    let time: String?   // "HH:MM"
    let color: String   // the calendar's hex
}

/// The day-grouped shape the home-screen WIDGET draws, decided in core
/// (widgetDays). It is in the feed already — the watch simply never read it.
/// Sean: "the first watch tab should match what is shown in the widget
/// entirely including reminders", so this page and that widget now draw the
/// same bytes rather than two lists built to resemble each other.
///
/// These structs are a deliberate second copy of HomeWidget.swift's WDay and
/// WLine: the two targets are separate binaries and neither can import the
/// other. tools/check-watch-feed.sh runs BOTH decoders against one
/// core-generated feed, which is the only thing that keeps them honest — the
/// same arrangement the clock formatters live under.
struct WatchDay: Codable {
    let date: String
    let lines: [WatchLine]
}

struct WatchLine: Codable, Identifiable {
    let id: String
    let text: String
    let time: String?
    let isReminder: Bool
    let overdue: Bool
    let color: String?
    let calendarId: String?
}

/// Receives the phone's application context ({"list": json}) and keeps the last
/// list in UserDefaults, so a cold launch shows yesterday's list instead of a
/// blank screen while the session warms up.
final class WatchStore: NSObject, ObservableObject, WCSessionDelegate {
    @Published var items: [WatchItem] = []
    @Published var events: [WatchEvent] = []
    @Published var folders: [WatchFolder] = []
    @Published var sections: [WatchSection] = []
    @Published var groups: [WatchGroup] = []
    /// The widget's day list, UNFILTERED as it arrives. `widgetCalendars` is
    /// applied at draw time by drawnWidgetDays, not here, so the rule sits in
    /// one testable place instead of in the store and the view both.
    @Published var days: [WatchDay] = []
    /// The calendars the phone's home-screen widget is configured for, mirrored
    /// so this watch shows the same events. Empty means all of them.
    @Published var widgetCalendars: [String] = []
    /// Ticked, but not yet told to the phone — drawn as done, still undoable.
    @Published var pendingTicks: Set<String> = []
    /// The scheduled sends, so tapping again can cancel one.
    private var tickWork: [String: DispatchWorkItem] = [:]
    /// Sean's two seconds, named once.
    static let tickGrace: TimeInterval = 2

    /// What this watch actually knows, so a screen can never again show the
    /// same words for 'nothing is due' and 'nothing ever arrived'. That
    /// ambiguity is what a whole evening of 'my watch is not syncing' was:
    /// the phone was delivering, the Summary page said 'Nothing due today',
    /// and neither of us could tell which of the two it meant.
    enum Feed: Equatable {
        case waiting                 // no context has ever been decoded here
        case loaded(from: String)    // "phone" or "cache"
        case failed(String)          // decode threw; the reason travels
    }
    @Published var feed: Feed = .waiting
    private let cacheKey = "watchlist.json"
    // The App Group container, because the complication is its OWN process
    // and standard defaults are invisible to it. Standard stays as the
    // fallback so a cache written before this change still shows.
    private let shared = UserDefaults(suiteName: "group.com.seancheren.calmind")

    override init() {
        super.init()
        if let data = shared?.data(forKey: cacheKey) ?? UserDefaults.standard.data(forKey: cacheKey) {
            decode(data, source: "cache")
        }
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private func decode(_ data: Data, source: String = "phone") {
        // events arrived later than items — a cache written before they
        // existed still decodes, it just has none to show.
        struct List: Codable {
            let items: [WatchItem]
            let events: [WatchEvent]?
            let folders: [WatchFolder]?
            let sections: [WatchSection]?
            let groups: [WatchGroup]?
            /// Both optional for the same reason as everything else here: a
            /// cache written by an older phone build has neither, and must
            /// still decode. The first page then falls back to its own
            /// summary rather than showing an empty widget mirror.
            let days: [WatchDay]?
            let widgetCalendars: [String]?
            /// Optional so a cache written before the setting existed still
            /// decodes — it simply reads as 12-hour, which is what it was.
            let clock24: Bool?
        }
        // try? here was the same silence that hid WCSession 7006 for a day.
        let list: List
        do {
            list = try JSONDecoder().decode(List.self, from: data)
        } catch {
            NSLog("[WatchStore] decode FAILED: %@", String(describing: error))
            // Surfaced, not just logged: a log needs a cable and a person who
            // knows to look. The wrist says it.
            let why = short(error)
            DispatchQueue.main.async { self.feed = .failed(why) }
            return
        }
        NSLog("[WatchStore] decoded items=%d events=%d folders=%d sections=%d",
              list.items.count, (list.events ?? []).count,
              (list.folders ?? []).count, (list.sections ?? []).count)
        DispatchQueue.main.async {
            self.items = list.items
            self.events = list.events ?? []
            self.folders = list.folders ?? []
            self.sections = list.sections ?? []
            self.groups = list.groups ?? []
            self.days = list.days ?? []
            self.widgetCalendars = list.widgetCalendars ?? []
            // Set before the views read it: every formatter on this device
            // asks WatchFormat, so one assignment moves the whole watch.
            WatchFormat.clock24 = list.clock24 ?? false
            self.feed = .loaded(from: source)
        }
    }

    /// A Codable error's own description is a paragraph. The wrist has room
    /// for a clause: which key, and what was wrong with it.
    private func short(_ error: Error) -> String {
        guard let e = error as? DecodingError else { return "could not read the list" }
        switch e {
        case let .keyNotFound(key, _):      return "missing '\(key.stringValue)'"
        case let .typeMismatch(type, ctx):  return "\(ctx.codingPath.last?.stringValue ?? "a field") is not \(type)"
        case let .valueNotFound(_, ctx):    return "'\(ctx.codingPath.last?.stringValue ?? "a field")' was null"
        case .dataCorrupted:                return "the list was damaged"
        @unknown default:                   return "could not read the list"
        }
    }

    private func take(_ context: [String: Any]) {
        guard let json = context["list"] as? String, let data = json.data(using: .utf8) else {
            // An EMPTY context is the ordinary case on a cold activate — the
            // phone has not pushed since this app existed. That is 'waiting',
            // not a failure, and must not overwrite a good cache.
            if !context.isEmpty {
                NSLog("[WatchStore] take: no 'list' key (context keys: %@)", context.keys.joined(separator: ","))
                DispatchQueue.main.async { self.feed = .failed("phone sent an unexpected message") }
            }
            return
        }
        NSLog("[WatchStore] take: %d bytes", data.count)
        (shared ?? UserDefaults.standard).set(data, forKey: cacheKey)
        decode(data)
        // Fresh data means the face is stale — WidgetKit rerenders on request,
        // not on a schedule of ours.
        WidgetCenter.shared.reloadAllTimelines()
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        NSLog("[WatchStore] activated state=%d error=%@ ctxKeys=%@", state.rawValue,
              error.map { String(describing: $0) } ?? "none",
              session.receivedApplicationContext.keys.joined(separator: ","))
        take(session.receivedApplicationContext)
    }

    func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        take(context)
    }

    /// Sean's reversal of the read-only rule: a tap here queues the id for the
    /// phone, which applies the SAME toggle a phone tap uses (repeats roll
    /// there, not here). transferUserInfo queues while the phone is away.
    ///
    /// TWO SECONDS TO CHANGE YOUR MIND. Sean, 2026-08-11: "when checking off a
    /// reminder in all apps, make sure to show the checked reminder for 2
    /// seconds, giving the user the ability to uncheck it if checking it was a
    /// mistake". On a 41mm screen a mis-tap is likelier than anywhere else,
    /// and the row used to vanish under the finger with nothing left to undo.
    ///
    /// WHAT IS DEFERRED HERE IS THE SEND, and that is the opposite of the
    /// phone's grace, deliberately. In the app the write happens at once and
    /// only the row lingers, because a delayed write could be lost if the app
    /// closed inside the window. Here the "write" is a message to the phone,
    /// and the phone applies reminderToggle to whatever it receives — so
    /// sending twice does not undo anything, it rolls a repeating reminder
    /// TWICE. The comment below has warned about that since the grouping moved
    /// to core. An undo therefore has to stop the message, not send another.
    ///
    /// A tick that is never confirmed cannot be lost either: the row stays on
    /// the wrist until the phone's next push says otherwise, exactly as before.
    func tick(_ id: String) {
        DispatchQueue.main.async {
            if self.pendingTicks.contains(id) {
                // Tapped again inside the window: the mistake is undone by
                // never telling the phone at all.
                self.pendingTicks.remove(id)
                self.tickWork[id]?.cancel()
                self.tickWork[id] = nil
                return
            }
            self.pendingTicks.insert(id)
            let work = DispatchWorkItem { [weak self] in
                guard let self else { return }
                guard self.pendingTicks.contains(id) else { return }
                self.pendingTicks.remove(id)
                self.tickWork[id] = nil
                self.drop(id)
                guard WCSession.isSupported() else { return }
                WCSession.default.transferUserInfo(["tick": id])
            }
            self.tickWork[id] = work
            DispatchQueue.main.asyncAfter(deadline: .now() + WatchStore.tickGrace, execute: work)
        }
    }

    /// Take the row off this wrist. Split out of tick() so the grace above has
    /// something to call when it finally commits.
    private func drop(_ id: String) {
        self.items.removeAll { $0.id == id }
        // GROUPS too, and this is why: the reminders page draws groups
        // now, not items. Removing only from items left the row sitting
        // there after a tap — so you tap again, and the phone applies a
        // SECOND toggle, which rolls a repeating reminder twice. A
        // regression I introduced when the grouping moved to core, and
        // invisible without actually tapping the thing on a watch.
        self.groups = self.groups.map { g in
            WatchGroup(
                folderName: g.folderName,
                sections: g.sections
                    .map { WatchGroup.Part(sectionName: $0.sectionName, items: $0.items.filter { $0.id != id }) }
                    .filter { !$0.items.isEmpty })
        }.filter { !$0.sections.isEmpty }
    }
}
