import WidgetKit
import SwiftUI

/// The same rows WatchStore caches, read from the SHARED container — a widget
/// is its own process, so the App Group is the only place both can see.
private struct Row: Codable {
    let id: String
    let text: String
    let due: String?
    let time: String?
    let done: Bool
}

private func readRows() -> [Row] {
    struct List: Codable { let items: [Row] }
    guard
        let d = UserDefaults(suiteName: "group.com.seancheren.calmind")?.data(forKey: "watchlist.json"),
        let list = try? JSONDecoder().decode(List.self, from: d)
    else { return [] }
    return list.items.filter { !$0.done }
}

struct Entry: TimelineEntry {
    let date: Date
    let open: Int
    let next: String?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: .now, open: 3, next: "Kitchen shelf") }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        let rows = readRows()
        completion(Entry(date: .now, open: rows.count, next: rows.first?.text))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let rows = readRows()
        let entry = Entry(date: .now, open: rows.count, next: rows.first?.text)
        // The phone pushes fresh data through WatchStore, which pokes
        // WidgetCenter — so this timeline only needs a lazy safety refresh.
        completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(30 * 60))))
    }
}

struct ComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Entry

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                ZStack {
                    Circle().stroke(.tertiary, lineWidth: 2)
                    VStack(spacing: 0) {
                        Text("\(entry.open)").font(.title3.bold())
                        Image(systemName: "checklist").font(.system(size: 9))
                    }
                }
            case .accessoryCorner:
                Text("\(entry.open)")
                    .font(.title3.bold())
                    .widgetLabel(entry.next ?? "All clear")
            case .accessoryInline:
                Text(entry.open == 0 ? "All clear" : "\(entry.open) to do")
            default: // .accessoryRectangular
                VStack(alignment: .leading, spacing: 1) {
                    Text(entry.open == 0 ? "All clear" : "\(entry.open) to do")
                        .font(.headline)
                    if let next = entry.next {
                        Text(next).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
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
        .description("Open reminders at a glance.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline, .accessoryCorner])
    }
}
