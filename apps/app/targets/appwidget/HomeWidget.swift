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
// The Scriptable widget's own colours. The tick box was Color.accentColor,
// which is the SYSTEM tint and had nothing to do with this app — Sean saw a
// blue box beside green dots, the exact inverse of the reference. A reminder
// is green here; an EVENT keeps its calendar's colour, which is why the dot
// reads from the line rather than from a constant.
private let REMINDER = Color(red: 0.204, green: 0.827, blue: 0.600)  // #34d399
private let HEADING = Color(white: 0.604)                            // #9a9a9a
private let RULE_TODAY = Color(red: 0.184, green: 0.373, blue: 0.302) // #2f5f4d
private let RULE_DAY = Color(white: 0.141)                           // #242424
private let DATE_LABEL = Color(white: 0.722)                         // #b8b8b8

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
    /// Sean's Settings choice. Optional, so a cache written before the
    /// setting existed still decodes as the 12-hour it always was.
    let clock24: Bool?
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

/// "2026-08-12" -> "WED · AUG 12", today -> "TODAY · AUG 10".
///
/// The Scriptable widget's own longDate, uppercased. Three things it does
/// that this did not: today KEEPS its date, the separator is a middle dot
/// rather than a comma, and there is no TOMORROW case — the reference has
/// only the two forms and Sean asked to match it.
private func dayHeading(_ ymd: String, today: String) -> String {
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
    guard let d = f.date(from: ymd) else { return ymd.uppercased() }
    let md = DateFormatter(); md.dateFormat = "MMM d"
    let day = md.string(from: d).uppercased()
    if ymd == today { return "TODAY · " + day }
    let wd = DateFormatter(); wd.dateFormat = "EEE"
    return wd.string(from: d).uppercased() + " · " + day
}

/// "15:30" -> "3:30pm", "14:00" -> "2pm".
///
/// The widget was drawing the feed's raw "HH:MM", so it read 24-hour while
/// every other surface spoke 12. This is the SCRIPTABLE reference's style —
/// the suffix always shown — deliberately NOT the watch's compact rule,
/// where am/pm is dropped below 8pm because a wrist has no room for it. A
/// home-screen widget does.
private func clock12(_ hhmm: String, clock24: Bool = false) -> String {
    let parts = hhmm.split(separator: ":")
    guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return hhmm }
    // 24-hour keeps its leading zero and its minutes: "09:00", never "9".
    if clock24 { return "\(String(format: "%02d", h)):\(String(format: "%02d", m))" }
    let suffix = h < 12 ? "am" : "pm"
    let h12 = h % 12 == 0 ? 12 : h % 12
    return m == 0 ? "\(h12)\(suffix)" : "\(h12):\(String(format: "%02d", m))\(suffix)"
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

/// A day as the view draws it. `isToday` travels because the heading STRING
/// cannot answer it — today is green over a green rule, every other day grey
/// over a dark one, and a view that re-parsed the heading to find out would
/// be deciding the same thing twice.
struct DaySection: Identifiable {
    var id: String { heading }
    let heading: String
    let isToday: Bool
    let lines: [Line]
}

struct Entry: TimelineEntry {
    let date: Date
    let days: [DaySection]
    /// Carried so the ROW can format its time. The view cannot reach the feed.
    var clock24 = false
    /// Carried so the view can say WHICH empty it is.
    let state: Load
}

struct Provider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> Entry {
        Entry(date: Date(), days: [DaySection(heading: "TODAY · AUG 10", isToday: true, lines: [Line(id: "x", text: "Water the plants", time: nil, isReminder: true, overdue: false, color: LABEL)])], state: .waiting)
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
        let ticked = Set(UserDefaults(suiteName: GROUP)?.stringArray(forKey: TICKS) ?? [])
        // No selection means everything — an empty picker must not mean an
        // empty widget. (Tested in core; the one-line version of that rule
        // shipped a blank widget in an earlier draft.)
        let wanted = Set((configuration.folders ?? []).map(\.id))
        return Entry(date: Date(),
                     days: Provider.drawnDays(feed: feed, ticked: ticked, wanted: wanted, today: todayStr()),
                     clock24: feed.clock24 ?? false,
                     state: state)
    }

    /// Pure and static so something can actually RUN it — the same reason
    /// ReminderListView.drawnGroups is. As a method reaching into
    /// UserDefaults and a WidgetKit configuration it could only execute
    /// inside a rendered widget on a phone, which is the one place nothing in
    /// this repo can look. tools/check-widget-feed.sh calls this directly.
    ///
    /// Grouping and ordering are already decided in core. What is left is what
    /// core cannot know: which folders THIS INSTANCE of the widget was
    /// configured for, and which ticks are queued but not yet applied.
    static func drawnDays(feed: Feed, ticked: Set<String>, wanted: Set<String>, today: String) -> [DaySection] {
        let folderOf = Dictionary(uniqueKeysWithValues: feed.items.map { ($0.id, $0.folderId) })
        let days: [DaySection] = (feed.days ?? []).compactMap { day in
            let lines = day.lines.compactMap { l -> Line? in
                if ticked.contains(l.id) { return nil }
                if l.isReminder, !wanted.isEmpty {
                    guard let f = folderOf[l.id] ?? nil, wanted.contains(f) else { return nil }
                }
                return Line(id: l.id, text: l.text, time: l.time, isReminder: l.isReminder,
                            overdue: l.overdue, color: l.color.map(hexColor) ?? LABEL)
            }
            return lines.isEmpty ? nil
                : DaySection(heading: dayHeading(day.date, today: today), isToday: day.date == today, lines: lines)
        }
        // Enough days that the SPACE budget below is what runs out, not this.
        // It was 6 and the budget rarely reached it; the widget still stopped
        // early because the budget counted only rows and every heading it
        // drew was free. Both are honest now.
        return Array(days.prefix(8))
    }
}

// MARK: - View

struct HomeWidgetView: View {
    var entry: Entry
    @Environment(\.widgetFamily) var family

    /// How much VERTICAL ROOM there is, in units of one row.
    ///
    /// The old budget counted rows only, so every day heading — a line of
    /// text, a hairline rule and two gaps — was drawn for free. Four day
    /// groups cost four headings the budget never knew about, which is how
    /// the widget could stop after a couple of items and still leave half the
    /// card empty: it had "spent" its rows without having filled the space.
    ///
    /// A heading is about 1.4 rows tall (10pt bold + 1pt rule + 8pt of
    /// spacing against a ~17pt row), so it is charged as such. Sean asked for
    /// it to keep adding until the space runs out and to adapt to the size,
    /// which is what a space budget does and a fixed count cannot.
    private var spaceBudget: Double {
        switch family {
        case .systemSmall:  return 5
        case .systemLarge:  return 21
        default:            return 9.5
        }
    }
    private let headingCost = 1.4

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // firstTextBaseline, not the default centring: two different type
            // sizes centred against each other is exactly what makes a header
            // like this look a pixel off, and Sean asked for the baselines to
            // line up rather than the boxes.
            HStack(alignment: .firstTextBaseline) {
                Text("Calendar").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                Spacer()
                Text(Date(), format: .dateTime.month(.abbreviated).day())
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(DATE_LABEL)
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
        // Spend the budget day by day: a heading costs its own height, then
        // each row costs one. A day whose heading would fit but which has no
        // room for even one row is not worth drawing — a heading with nothing
        // under it is the emptiness it was supposed to fix.
        var budget = spaceBudget
        var out: [DaySection] = []
        for day in entry.days {
            let room = budget - headingCost
            if room < 1 { break }
            let take = Array(day.lines.prefix(Int(room)))
            budget -= headingCost + Double(take.count)
            out.append(DaySection(heading: day.heading, isToday: day.isToday, lines: take))
        }
        return VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(out.enumerated()), id: \.offset) { idx, day in
                if idx > 0 {
                    // The heavier rule is the only thing separating one day
                    // from the next — Scriptable's 2pt divider.
                    Rectangle().fill(Color.white.opacity(0.16)).frame(height: 2).padding(.vertical, 5)
                }
                Text(day.heading)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(day.isToday ? REMINDER : HEADING)
                // Today's underline is green, every other day's nearly black:
                // the reference's own two rules, and the thing that makes
                // today findable at a glance.
                Rectangle().fill(day.isToday ? RULE_TODAY : RULE_DAY)
                    .frame(height: 1).padding(.top, 2).padding(.bottom, 5)
                ForEach(day.lines) { line in row(line) }
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
                        .foregroundStyle(line.overdue ? OVERDUE : REMINDER)
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
                Text(clock12(t, clock24: entry.clock24)).font(.system(size: 11)).foregroundStyle(META)
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
