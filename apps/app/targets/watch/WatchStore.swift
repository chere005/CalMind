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

/// Receives the phone's application context ({"list": json}) and keeps the last
/// list in UserDefaults, so a cold launch shows yesterday's list instead of a
/// blank screen while the session warms up.
final class WatchStore: NSObject, ObservableObject, WCSessionDelegate {
    @Published var items: [WatchItem] = []
    @Published var events: [WatchEvent] = []
    @Published var folders: [WatchFolder] = []
    @Published var sections: [WatchSection] = []
    @Published var groups: [WatchGroup] = []

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
    /// Locally the row just leaves the list — the next push is the truth.
    func tick(_ id: String) {
        DispatchQueue.main.async { self.items.removeAll { $0.id == id } }
        guard WCSession.isSupported() else { return }
        WCSession.default.transferUserInfo(["tick": id])
    }
}
