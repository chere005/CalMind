import WidgetKit
import SwiftUI
import AppIntents

/**
 The iPhone home-screen widget, drawn to match tools/scriptable-widget.js —
 the one Sean has actually been living with. That widget's decisions are kept
 deliberately: near-black card, one heading per DAY rather than per kind, a
 square tick box for a reminder (a thing to DO) against a coloured dot for an
 event, the label one line, the time right-aligned in grey, a hairline under
 each date and a heavier rule between days.

 It is its own process, so it reads the App Group cache WatchBridge writes on
 every store change — the same feed the watch and the complication read.
 */
private let GROUP = "group.com.seancheren.calmind"
private let CACHE = "watchlist.json"
private let TICKS = "pendingTicks"

// The Scriptable widget's palette, carried over rather than re-invented.
private let BG = Color(red: 0.067, green: 0.067, blue: 0.067)   // #111111
private let LABEL = Color(white: 0.933)                          // #eeeeee
private let META = Color(red: 0.541, green: 0.541, blue: 0.541)  // #8a8a8a
private let OVERDUE = Color(red: 1.0, green: 0.4, blue: 0.4)     // #ff6666

struct WRow: Codable, Identifiable {
    let id: String
    let text: String
    let due: String?
    let time: String?
    let done: Bool
    let folderId: String?   // optional: a cache written before the picker existed
}

struct WEvent: Codable, Identifiable {
    let id: String
    let text: String
    let date: String
    let time: String?
    let color: String
}

struct WFolder: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let color: String
}

/// The day-grouped shape, decided in core (widgetDays) so the rules — the
/// day is the section, an undated reminder lands on today, no time leads —
/// live somewhere a test can reach. The widget still applies the FOLDER
/// filter and the pending ticks itself: both live in the App Group and
/// change without the phone pushing anything.
struct WDay: Codable {
    let date: String
    let lines: [WLine]
}

struct WLine: Codable, Identifiable {
    let id: String
    let text: String
    let time: String?
    let isReminder: Bool
    let overdue: Bool
    let color: String?
}

struct Feed: Codable {
    let items: [WRow]
    let events: [WEvent]?
    let folders: [WFolder]?
    let days: [WDay]?
}

/// What the widget knows. Three states, never collapsed into one: a widget
/// that draws 'Nothing due' when it actually failed to read the list is the
/// same bug that cost an evening on the watch — a failure rendered as a
/// normal, reassuring screen.
enum Load {
    case waiting            // CalMind has not written a cache yet
    case ok(Feed)
    case failed
}

private func loadFeed() -> Load {
    guard let raw = UserDefaults(suiteName: GROUP)?.data(forKey: CACHE) else { return .waiting }
    guard let feed = try? JSONDecoder().decode(Feed.self, from: raw) else { return .failed }
    return .ok(feed)
}

private func todayStr() -> String {
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
    return f.string(from: Date())
}

/// "2026-08-12" -> "WED, AUG 12", with TODAY/TOMORROW where it reads better —
/// the Scriptable widget's own longDate, uppercased for the heading.
private func dayHeading(_ ymd: String, today: String) -> String {
    if ymd == today { return "TODAY" }
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
    guard let d = f.date(from: ymd) else { return ymd.uppercased() }
    if let t = f.date(from: today), let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: t),
       Calendar.current.isDate(d, inSameDayAs: tomorrow) { return "TOMORROW" }
    let out = DateFormatter(); out.dateFormat = "EEE, MMM d"
    return out.string(from: d).uppercased()
}

private func hexColor(_ hex: String) -> Color {
    var s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
    guard let v = UInt64(s, radix: 16), s.count == 6 else { return META }
    return Color(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
}

// MARK: - Folder selection

/// The folders the picker offers, read from the same cache. A widget cannot
/// ask the app at configuration time, so the feed carries them.
struct FolderOption: AppEntity, Identifiable, Hashable {
    let id: String
    let name: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Folder"
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
    static var defaultQuery = FolderQuery()
}

struct FolderQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [FolderOption] {
        all().filter { identifiers.contains($0.id) }
    }
    func suggestedEntities() async throws -> [FolderOption] { all() }
    private func all() -> [FolderOption] {
        guard case let .ok(feed) = loadFeed() else { return [] }
        return (feed.folders ?? []).map { FolderOption(id: $0.id, name: $0.name) }
    }
}

struct SelectFolders: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Choose folders"
    static var description = IntentDescription("Show only the folders you pick. Leave empty for everything.")

    @Parameter(title: "Folders")
    var folders: [FolderOption]?

    init() {}
}

// MARK: - Check-off

/// Queue the id for the app and redraw at once. The app applies queued ticks
/// through the SAME reminderToggle a phone tap uses — repeats roll, sync runs
/// — next time it is foregrounded. The watch's tick pattern, one transport
/// over. If the app never comes back, the tick is queued, not lost.
struct TickIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete reminder"
    static var isDiscoverable = false

    @Parameter(title: "Reminder") var id: String
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

// MARK: - Timeline

/// One line as the widget draws it — a reminder or an event, already placed
/// under its day. The day is the section, not the kind: Scriptable's rule.
struct Line: Identifiable {
    let id: String
    let text: String
    let time: String?
    let isReminder: Bool
    let overdue: Bool
    let color: Color
}

struct Entry: TimelineEntry {
    let date: Date
    let days: [(String, [Line])]
    /// Carried so the view can say WHICH empty it is.
    let state: Load
}

struct Provider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> Entry {
        Entry(date: Date(), days: [("TODAY", [Line(id: "x", text: "Water the plants", time: nil, isReminder: true, overdue: false, color: LABEL)])], state: .waiting)
    }

    func snapshot(for configuration: SelectFolders, in context: Context) async -> Entry {
        build(configuration)
    }

    func timeline(for configuration: SelectFolders, in context: Context) async -> Timeline<Entry> {
        // Midnight changes what "today" and "overdue" mean even when no data
        // changes; data changes reload through WidgetCenter.
        let next = Calendar.current.startOfDay(for: Date()).addingTimeInterval(86_400)
        return Timeline(entries: [build(configuration)], policy: .after(next))
    }

    private func build(_ configuration: SelectFolders) -> Entry {
        let state = loadFeed()
        guard case let .ok(feed) = state else { return Entry(date: Date(), days: [], state: state) }
        let today = todayStr()
        let ticked = Set(UserDefaults(suiteName: GROUP)?.stringArray(forKey: TICKS) ?? [])
        // No selection means everything — an empty picker must not mean an
        // empty widget. (Tested in core; the one-line version of that rule
        // shipped a blank widget in an earlier draft.)
        let wanted = Set((configuration.folders ?? []).map(\.id))
        let folderOf = Dictionary(uniqueKeysWithValues: feed.items.map { ($0.id, $0.folderId) })

        // Grouping and ordering already decided in core. What is left here is
        // what core cannot know: which folders this INSTANCE of the widget was
        // configured for, and which ticks are queued but not yet applied.
        let days: [(String, [Line])] = (feed.days ?? []).compactMap { day in
            let lines = day.lines.compactMap { l -> Line? in
                if ticked.contains(l.id) { return nil }
                if l.isReminder, !wanted.isEmpty {
                    guard let f = folderOf[l.id] ?? nil, wanted.contains(f) else { return nil }
                }
                return Line(id: l.id, text: l.text, time: l.time, isReminder: l.isReminder,
                            overdue: l.overdue, color: l.color.map(hexColor) ?? LABEL)
            }
            return lines.isEmpty ? nil : (dayHeading(day.date, today: today), lines)
        }
        return Entry(date: Date(), days: Array(days.prefix(6)), state: state)
    }
}

// MARK: - View

struct HomeWidgetView: View {
    var entry: Entry
    @Environment(\.widgetFamily) var family

    private var lineBudget: Int {
        switch family {
        case .systemSmall:  return 4
        case .systemLarge:  return 14
        default:            return 6
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Calendar").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                Spacer()
                Text(Date(), format: .dateTime.month(.abbreviated).day())
                    .font(.system(size: 13, weight: .medium)).foregroundStyle(META)
            }
            .padding(.bottom, 8)

            if entry.days.isEmpty {
                switch entry.state {
                case .waiting:
                    Text("Open CalMind once").font(.system(size: 12)).foregroundStyle(META)
                case .failed:
                    Text("Can't read the list").font(.system(size: 12)).foregroundStyle(OVERDUE)
                case .ok:
                    Text("Nothing due.").font(.system(size: 12)).foregroundStyle(META)
                }
            } else {
                content
            }
            Spacer(minLength: 0)
        }
    }

    private var content: some View {
        var budget = lineBudget
        var out: [(String, [Line])] = []
        for (day, lines) in entry.days where budget > 0 {
            let take = Array(lines.prefix(budget))
            budget -= take.count
            out.append((day, take))
        }
        return VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(out.enumerated()), id: \.offset) { idx, pair in
                if idx > 0 {
                    // The heavier rule is the only thing separating one day
                    // from the next — Scriptable's 2pt divider.
                    Rectangle().fill(Color.white.opacity(0.16)).frame(height: 2).padding(.vertical, 5)
                }
                Text(pair.0)
                    .font(.system(size: 10, weight: .bold)).foregroundStyle(META)
                Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1).padding(.top, 2).padding(.bottom, 5)
                ForEach(pair.1) { line in row(line) }
            }
        }
    }

    @ViewBuilder
    private func row(_ line: Line) -> some View {
        HStack(spacing: 6) {
            if line.isReminder {
                // The box is the control. Everything else falls through to
                // the widget's own tap, which opens the app.
                Button(intent: TickIntent(id: line.id)) {
                    Image(systemName: "square")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(line.overdue ? OVERDUE : Color.accentColor)
                }
                .buttonStyle(.plain)
            } else {
                Text("●").font(.system(size: 9)).foregroundStyle(line.color)
            }
            Text(line.text)
                .font(.system(size: 12))
                .foregroundStyle(line.overdue ? OVERDUE : LABEL)
                .lineLimit(1)
            Spacer(minLength: 0)
            if let t = line.time {
                Text(t).font(.system(size: 11)).foregroundStyle(META)
            }
        }
        .padding(.bottom, 5)
    }
}

@main
struct CalMindWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "CalMindWidget", intent: SelectFolders.self, provider: Provider()) { entry in
            HomeWidgetView(entry: entry)
                .containerBackground(BG, for: .widget)
        }
        .configurationDisplayName("Calendar")
        .description("Today's reminders and events. Tap a box to tick it off.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
