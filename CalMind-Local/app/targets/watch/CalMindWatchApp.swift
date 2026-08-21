import SwiftUI

/// The watch stays read-only, as in the suite: the phone builds the list and
/// ships it over WatchConnectivity; the watch decodes and draws it.
@main
struct CalMindWatchApp: App {
    @StateObject private var store = WatchStore()

    var body: some Scene {
        WindowGroup {
            WatchTabs()
                .environmentObject(store)
        }
    }
}
