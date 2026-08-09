import Foundation
import WatchConnectivity
import WidgetKit

struct WatchItem: Codable, Identifiable {
    let id: String
    let text: String
    let due: String?    // "YYYY-MM-DD"
    let time: String?   // "HH:MM"
    let done: Bool
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
    private let cacheKey = "watchlist.json"
    // The App Group container, because the complication is its OWN process
    // and standard defaults are invisible to it. Standard stays as the
    // fallback so a cache written before this change still shows.
    private let shared = UserDefaults(suiteName: "group.com.seancheren.calmind")

    override init() {
        super.init()
        if let data = shared?.data(forKey: cacheKey) ?? UserDefaults.standard.data(forKey: cacheKey) { decode(data) }
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private func decode(_ data: Data) {
        // events arrived later than items — a cache written before they
        // existed still decodes, it just has none to show.
        struct List: Codable { let items: [WatchItem]; let events: [WatchEvent]? }
        guard let list = try? JSONDecoder().decode(List.self, from: data) else { return }
        DispatchQueue.main.async {
            self.items = list.items
            self.events = list.events ?? []
        }
    }

    private func take(_ context: [String: Any]) {
        guard let json = context["list"] as? String, let data = json.data(using: .utf8) else { return }
        (shared ?? UserDefaults.standard).set(data, forKey: cacheKey)
        decode(data)
        // Fresh data means the face is stale — WidgetKit rerenders on request,
        // not on a schedule of ours.
        WidgetCenter.shared.reloadAllTimelines()
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
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
