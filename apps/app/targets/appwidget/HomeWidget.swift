import WidgetKit
import SwiftUI
import AppIntents

/// The same feed the watch caches, read from the shared App Group container —
/// a widget is its own process, and the group is the only place both can see.
/// WatchBridge writes it on every store change; the shapes are the feed's own.
private let GROUP = "group.com.seancheren.calmind"
private let CACHE = "watchlist.json"
private let TICKS = "pendingTicks"

struct WRow: Codable, Identifiable {
    let id: String
    let text: String
    let due: String?
    let time: String?
    let done: Bool
}

private func todayStr() -> String {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: Date())
}

/// Open reminders due today (or overdue), the phone's own ordering kept.
/// Ticks queued by the widget itself count as done ALREADY — the optimistic
/// half of check-off, so a tapped row leaves the widget before the app has
/// even woken to apply it.
func dueToday() -> [WRow] {
    struct List: Codable { let items: [WRow] }
    let d = UserDefaults(suiteName: GROUP)
    guard let raw = d?.data(forKey: CACHE),
          let list = try? JSONDecoder().decode(List.self, from: raw) else { return [] }
    let ticked = Set(d?.stringArray(forKey: TICKS) ?? [])
    let today = todayStr()
    return list.items.filter { !$0.done && !ticked.contains($0.id) && $0.due != nil && $0.due! <= today }
}

/// The check-off: queue the id for the app, redraw at once. The app applies
/// queued ticks through the SAME reminderToggle a phone tap uses (repeats
/// roll, sync runs) next time it comes to the foreground — the watch's tick
/// pattern, one transport over. If the app never comes back, the tick is
/// still queued, not lost.
struct TickIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete reminder"
    static var isDiscoverable = false

    @Parameter(title: "Reminder")
    var id: String

    init() {}
    init(id: String) { self.id = id }

    func perform() async throws -> some IntentResult {
        let d = UserDefaults(suiteName: GROUP)
        var ticks = d?.stringArray(forKey: TICKS) ?? []
        if !ticks.contains(id) { ticks.append(id) }
        d?.set(ticks, forKey: TICKS)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

struct Entry: TimelineEntry {
    let date: Date
    let rows: [WRow]
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry {
        Entry(date: Date(), rows: [WRow(id: "x", text: "Water the plants", due: nil, time: nil, done: false)])
    }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: Date(), rows: dueToday()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        // Refresh at the next midnight: "due today" changes meaning there
        // even if no data changes. Data changes reload via WidgetCenter.
        let next = Calendar.current.startOfDay(for: Date()).addingTimeInterval(86_400)
        completion(Timeline(entries: [Entry(date: Date(), rows: dueToday())], policy: .after(next)))
    }
}

struct HomeWidgetView: View {
    var entry: Entry
    @Environment(\.widgetFamily) var family

    private var shown: [WRow] {
        Array(entry.rows.prefix(family == .systemLarge ? 8 : 3))
    }

    var body: some View {
        if entry.rows.isEmpty {
            // The empty state earns words, not a zero — the wrist rule.
            Text("Nothing due today")
                .font(.footnote)
                .foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text("Due today")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                ForEach(shown) { r in
                    HStack(spacing: 8) {
                        // The circle is the control; the text is the poster.
                        Button(intent: TickIntent(id: r.id)) {
                            Image(systemName: "circle")
                                .font(.system(size: 16))
                                .foregroundStyle(.tint)
                        }
                        .buttonStyle(.plain)
                        Text(r.text)
                            .font(.footnote)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        if let t = r.time {
                            Text(t)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }
}

@main
struct CalMindWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "CalMindWidget", provider: Provider()) { entry in
            HomeWidgetView(entry: entry)
                .containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("Due today")
        .description("Today's reminders, checkable from here.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
