import Foundation
import WatchConnectivity

struct WatchItem: Codable, Identifiable {
    let id: String
    let text: String
    let due: String?    // "YYYY-MM-DD"
    let time: String?   // "HH:MM"
    let done: Bool
}

/// Receives the phone's application context ({"list": json}) and keeps the last
/// list in UserDefaults, so a cold launch shows yesterday's list instead of a
/// blank screen while the session warms up.
final class WatchStore: NSObject, ObservableObject, WCSessionDelegate {
    @Published var items: [WatchItem] = []
    private let cacheKey = "watchlist.json"

    override init() {
        super.init()
        if let data = UserDefaults.standard.data(forKey: cacheKey) { decode(data) }
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private func decode(_ data: Data) {
        struct List: Codable { let items: [WatchItem] }
        guard let list = try? JSONDecoder().decode(List.self, from: data) else { return }
        DispatchQueue.main.async { self.items = list.items }
    }

    private func take(_ context: [String: Any]) {
        guard let json = context["list"] as? String, let data = json.data(using: .utf8) else { return }
        UserDefaults.standard.set(data, forKey: cacheKey)
        decode(data)
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        take(session.receivedApplicationContext)
    }

    func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        take(context)
    }
}
