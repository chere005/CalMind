import WidgetKit
import SwiftUI

/// The same feed WatchStore caches, read from the SHARED container — a widget
/// is its own process, so the App Group is the only place both can see.
struct Row: Codable {
    let id: String
    let text: String
    let due: String?
    let time: String?
    let done: Bool
}

struct Ev: Codable {
    let id: String
    let text: String
    let date: String    // "YYYY-MM-DD"
    let time: String?   // "HH:MM"
    let color: String
}

/// Sean's spec for this module, verbatim: "just show the next two events."
/// Events mean CALENDAR events — in this suite a dated reminder is never an
/// event, and the feed keeps them apart on purpose. The phone sends the next
/// 30 already sorted, so the next two are the first two.
func nextEvents() -> [Ev] {
    struct List: Codable { let items: [Row]; let events: [Ev]? }
    guard
        let d = UserDefaults(suiteName: "group.com.seancheren.calmind")?.data(forKey: "watchlist.json"),
        let list = try? JSONDecoder().decode(List.self, from: d)
    else { return [] }
    return Array((list.events ?? []).prefix(2))
}

/// "2026-08-12" + "15:30" -> "Wed 15:30", today's just "15:30", all-day "Wed".
func when(_ e: Ev) -> String {
    let fmt = DateFormatter()
    fmt.dateFormat = "yyyy-MM-dd"
    let day: String
    if let d = fmt.date(from: e.date), !Calendar.current.isDateInToday(d) {
        let out = DateFormatter()
        out.dateFormat = "EEE"
        day = out.string(from: d)
    } else {
        day = ""
    }
    let bits = [day, e.time ?? ""].filter { !$0.isEmpty }
    return bits.isEmpty ? "all day" : bits.joined(separator: " ")
}

struct Entry: TimelineEntry {
    let date: Date
    let events: [Ev]
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry {
        Entry(date: .now, events: [
            Ev(id: "a", text: "Chase", date: "2026-08-12", time: "15:30", color: "#71d99c"),
            Ev(id: "b", text: "Dinner", date: "2026-08-13", time: "18:00", color: "#60a5fa"),
        ])
    }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: .now, events: nextEvents()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        // The phone pushes fresh data through WatchStore, which pokes
        // WidgetCenter — so this timeline only needs a lazy safety refresh.
        completion(Timeline(entries: [Entry(date: .now, events: nextEvents())], policy: .after(.now.addingTimeInterval(30 * 60))))
    }
}

struct EventLine: View {
    let e: Ev

    var body: some View {
        HStack(spacing: 4) {
            Circle().fill(Color(hex: e.color)).frame(width: 6, height: 6)
            Text(when(e)).foregroundStyle(.secondary)
            Text(e.text).lineLimit(1)
        }
        .font(.caption2)
    }
}

struct ComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Entry

    var body: some View {
        Group {
            switch family {
            case .accessoryRectangular:
                // The Modular slot: the next two, one line each; one if that
                // is all there is; calm words if the calendar is empty.
                if entry.events.isEmpty {
                    Text("No events").foregroundStyle(.secondary)
                } else {
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(entry.events, id: \.id) { EventLine(e: $0) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            case .accessoryInline:
                // One line of room: the next one.
                if let e = entry.events.first {
                    Text("\(when(e)) \(e.text)")
                } else {
                    Text("No events")
                }
            case .accessoryCorner:
                Text("\(entry.events.count)")
                    .font(.title3.bold())
                    .widgetLabel(entry.events.first.map { "\(when($0)) \($0.text)" } ?? "No events")
            default: // .accessoryCircular — no room for words
                ZStack {
                    Circle().stroke(.tertiary, lineWidth: 2)
                    VStack(spacing: 0) {
                        Text("\(entry.events.count)").font(.title3.bold())
                        Image(systemName: "calendar").font(.system(size: 9))
                    }
                }
            }
        }
        .containerBackground(.clear, for: .widget)
    }
}

@main
struct CalMindComplicationBundle: WidgetBundle {
    var body: some Widget { CalMindComplication() }
}

struct CalMindComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "CalMindComplication", provider: Provider()) { entry in
            ComplicationView(entry: entry)
        }
        .configurationDisplayName("CalMind")
        .description("The next two events.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline, .accessoryCorner])
    }
}

extension Color {
    /// The calendars' own hex colours, as the legend and the phone draw them.
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .alphanumerics.inverted)
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        let v = UInt64(s, radix: 16) ?? 0x60A5FA
        self.init(
            red: Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue: Double(v & 0xFF) / 255
        )
    }
}
