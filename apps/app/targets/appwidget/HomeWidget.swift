import WidgetKit
import SwiftUI
import AppIntents

/**
 The iPhone home-screen widget, drawn to match the Scriptable widget Sean had
 actually been living with — `tools/scriptable-widget.js`, REMOVED ENTIRELY on
 2026-08-12 on his word, so this native one is now the only home-screen
 widget and the references to it below are lineage rather than a file you can
 open. That widget's decisions are kept deliberately: near-black card, one heading per DAY rather than per kind, a
 square tick box for a reminder (a thing to DO) against a coloured dot for an
 event, the label one line, the time right-aligned in grey, a hairline under
 each date and a heavier rule between days.

 It is its own process, so it reads the App Group cache WatchBridge writes on
 every store change — the same feed the watch and the complication read.
 */
private let GROUP = "group.com.seancheren.calmind"
private let CACHE = "watchlist.json"
private let TICKS = "pendingTicks"
/// When each queued tick happened, so the row can leave after the grace the
/// phone and the watch both give. Keyed by row id, epoch seconds.
private let TICK_TIMES = "pendingTickTimes"
/// Sean's two seconds, the same number in every app.
let TICK_GRACE: Double = 2
/// The calendars THIS widget is configured for, written back so the phone can
/// read a WidgetKit configuration it otherwise has no access to. The watch's
/// first page mirrors it. See Provider.build for why the last render wins.
private let WIDGET_CALS = "widgetCalendars"

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

/// A calendar the picker offers. `sharedFrom` is the partner's name when the
/// calendar is theirs — the app badges it, the picker says it in words.
struct WCalendar: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let color: String
    let sharedFrom: String?
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
    /// Which calendar an EVENT belongs to, so the picker can filter it. Null
    /// for a reminder — a reminder has no calendar, and whether it appears at
    /// all is the tri-state's business, decided in the app.
    let calendarId: String?
}

struct Feed: Codable {
    let items: [WRow]
    let events: [WEvent]?
    let folders: [WFolder]?
    /// Optional: a cache written before the picker offered calendars still
    /// decodes, it just has none to offer.
    let calendars: [WCalendar]?
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
    // do/catch rather than try?, which was the last `try?` left in the three
    // native targets — and the two beside it both rejected it in writing.
    // WatchStore: "try? here was the same silence that hid WCSession 7006 for
    // a day." ComplicationWidget: "a silent decode failure here draws exactly
    // like a genuinely empty calendar."
    //
    // The state was never the problem here — .failed already draws "Can't
    // read the list", distinct from "Nothing due." — so this is the smaller
    // half: WHY it failed. Without it the widget can say it could not read
    // the list and leave nothing anywhere that says what was wrong with it,
    // which is a bad place to start from when the cache is on a device.
    do {
        return .ok(try JSONDecoder().decode(Feed.self, from: raw))
    } catch {
        NSLog("[HomeWidget] decode FAILED: %@", String(describing: error))
        return .failed
    }
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

/// The header's own date, top right: "Wed Aug 12".
///
/// Sean, 2026-08-12: the corner carried "Aug 12" and he asked for the weekday
/// with it. Written out with a pattern rather than SwiftUI's
/// `.dateTime.weekday().month().day()`, which punctuates it "Wed, Aug 12" —
/// he wrote it without the comma, and the day headings below use no comma
/// either (they use the middle dot). One less thing that reads as almost
/// right.
private func headerDate(_ d: Date) -> String {
    let f = DateFormatter(); f.dateFormat = "EEE MMM d"
    return f.string(from: d)
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

// MARK: - Calendar selection

/// The CALENDARS the picker offers, read from the same cache. A widget cannot
/// ask the app at configuration time, so the feed carries them.
///
/// This offered reminder FOLDERS before, which is the wrong axis. In this app
/// a folder decides which reminders exist, and "which of those reach the
/// calendar" is already answered by the tri-state in Manage reminders — the
/// widget honours that through core's dayItems. What a widget instance still
/// gets to choose is which calendars' EVENTS it shows, which is exactly what
/// the app's own calendar picker chooses. Sean's ask.
struct CalendarOption: AppEntity, Identifiable, Hashable {
    let id: String
    let name: String
    /// The partner's name when this calendar is theirs, nil when it is mine.
    let sharedFrom: String?

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Calendar"
    var displayRepresentation: DisplayRepresentation {
        // A configuration list is a plain iOS list: no colour swatches, and no
        // badge view of our own. Where the app draws an "aki" chip, the label
        // says it — Sean's "a badge if possible otherwise text is fine".
        // subtitle rather than the title so the calendar's own name still
        // reads first when two partners have a "Personal".
        sharedFrom.map { DisplayRepresentation(title: "\(name)", subtitle: "Shared by \($0)") }
            ?? DisplayRepresentation(title: "\(name)")
    }
    static var defaultQuery = CalendarQuery()
}

struct CalendarQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [CalendarOption] {
        all().filter { identifiers.contains($0.id) }
    }
    func suggestedEntities() async throws -> [CalendarOption] { all() }
    private func all() -> [CalendarOption] {
        guard case let .ok(feed) = loadFeed() else { return [] }
        // Mine first, then the partner's — the feed's own order, which is the
        // app's: my calendars, then SHARED WITH ME.
        return (feed.calendars ?? []).map { CalendarOption(id: $0.id, name: $0.name, sharedFrom: $0.sharedFrom) }
    }
}

struct SelectFolders: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Choose calendars"
    static var description = IntentDescription("Show only the calendars you pick. Leave empty for all of them. Which REMINDERS appear is set in the app, under Manage reminders.")

    @Parameter(title: "Calendars")
    var folders: [CalendarOption]?

    init() {}
}

// MARK: - Check-off

/// Queue the id for the app and redraw at once. The app applies queued ticks
/// through the SAME reminderToggle a phone tap uses — repeats roll, sync runs
/// — next time it is foregrounded. The watch's tick pattern, one transport
/// over. If the app never comes back, the tick is queued, not lost.
/// The queue after a tap on `id` — pure, so check-widget-feed.sh can run it.
///
/// Split out of TickIntent because an AppIntent reaches into UserDefaults and
/// nothing in this repo can execute one: the toggle was written, and breaking
/// it deliberately produced a green suite. This is the rule, and it is now
/// checked.
func toggledTicks(_ ticks: [String], _ id: String) -> [String] {
    if let at = ticks.firstIndex(of: id) {
        var out = ticks
        out.remove(at: at)
        return out
    }
    return ticks + [id]
}

struct TickIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete reminder"
    static var isDiscoverable = false

    @Parameter(title: "Reminder") var id: String
    init() {}
    init(id: String) { self.id = id }

    func perform() async throws -> some IntentResult {
        let d = UserDefaults(suiteName: GROUP)
        var ticks = d?.stringArray(forKey: TICKS) ?? []
        // TOGGLE, not append. Tapping a queued row again removes it from the
        // queue, which is the undo — the app never hears about it, so nothing
        // has to be reversed and a repeating reminder cannot roll twice.
        let wasQueued = ticks.contains(id)
        ticks = toggledTicks(ticks, id)
        d?.set(ticks, forKey: TICKS)
        // WHEN it was ticked, so the row can leave two seconds later the way
        // it does on the phone and the watch. Sean, 2026-08-12: the check did
        // not disappear here, and this surface was the odd one out.
        //
        // The tick itself STAYS queued — only the drawing stops. The app still
        // drains the queue when it next comes forward, so nothing is lost by
        // the row going; what ends after two seconds is the chance to undo it
        // by tapping again, which is exactly the bargain everywhere else.
        var times = (d?.dictionary(forKey: TICK_TIMES) as? [String: Double]) ?? [:]
        if wasQueued { times[id] = nil } else { times[id] = Date().timeIntervalSince1970 }
        d?.set(times, forKey: TICK_TIMES)
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
    /// Ticked here and queued for the app, which has not drained it yet. The
    /// row stays on the card, drawn done, so the tap can be taken back.
    var pending: Bool = false
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
        let now = Date()

        // A queued tick has to STOP being drawn two seconds after it happened,
        // and a widget cannot wait — it has no run loop of its own. What it
        // can do is hand WidgetKit a second, already-rendered entry dated at
        // the end of the grace; the system swaps to it at that moment without
        // asking for a new timeline. That is the whole mechanism, and it is
        // why the grace works here without a timer.
        let times = (UserDefaults(suiteName: GROUP)?.dictionary(forKey: TICK_TIMES) as? [String: Double]) ?? [:]
        let deadlines = times.values
            .map { Date(timeIntervalSince1970: $0 + TICK_GRACE) }
            .filter { $0 > now }
            .sorted()
        guard let due = deadlines.first else {
            return Timeline(entries: [build(configuration)], policy: .after(next))
        }
        // Entry two is built AT the deadline — `now:` is that moment, not this
        // one — so the row it draws is the row without the ticked line.
        let after = Entry(date: due,
                          days: buildDays(configuration, now: due.timeIntervalSince1970),
                          clock24: build(configuration).clock24,
                          state: loadFeed())
        return Timeline(entries: [build(configuration), after], policy: .after(next))
    }

    /// The day sections as they would be drawn at `now`. Split out so the
    /// timeline can render the after-the-grace entry without pretending the
    /// clock has moved.
    private func buildDays(_ configuration: SelectFolders, now: Double) -> [DaySection] {
        guard case let .ok(feed) = loadFeed() else { return [] }
        let ticked = Set(UserDefaults(suiteName: GROUP)?.stringArray(forKey: TICKS) ?? [])
        let tickedAt = (UserDefaults(suiteName: GROUP)?.dictionary(forKey: TICK_TIMES) as? [String: Double]) ?? [:]
        let wanted = Set((configuration.folders ?? []).map(\.id))
        return Provider.drawnDays(feed: feed, ticked: ticked, wanted: wanted, today: todayStr(),
                                  tickedAt: tickedAt, now: now)
    }

    private func build(_ configuration: SelectFolders) -> Entry {
        let state = loadFeed()
        guard case let .ok(feed) = state else { return Entry(date: Date(), days: [], state: state) }
        let ticked = Set(UserDefaults(suiteName: GROUP)?.stringArray(forKey: TICKS) ?? [])
        let tickedAt = (UserDefaults(suiteName: GROUP)?.dictionary(forKey: TICK_TIMES) as? [String: Double]) ?? [:]
        // No selection means everything — an empty picker must not mean an
        // empty widget. (Tested in core; the one-line version of that rule
        // shipped a blank widget in an earlier draft.)
        let wanted = Set((configuration.folders ?? []).map(\.id))
        // Hand the selection back out through the App Group, because nothing
        // else can see it. A WidgetKit configuration belongs to ONE widget
        // instance and the containing app has no API to read it, so the
        // phone — and through it the watch — had no way to know which
        // calendars this widget was showing. Sean: "watch should mirror
        // folders selected by widget".
        //
        // Written on every render, which is when it can have changed: editing
        // a widget's configuration reloads its timeline, so this runs. With
        // more than one widget instance the last render wins, which is a real
        // limitation and the honest one to have — a single watch page cannot
        // mirror two differently-configured widgets at once.
        UserDefaults(suiteName: GROUP)?.set(Array(wanted), forKey: WIDGET_CALS)
        return Entry(date: Date(),
                     days: Provider.drawnDays(feed: feed, ticked: ticked, wanted: wanted, today: todayStr(),
                                              tickedAt: tickedAt, now: Date().timeIntervalSince1970),
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
    /// `tickedAt` is empty and `now` irrelevant for a caller that does not
    /// care about the grace — and a queued id with NO timestamp is treated as
    /// just-ticked, which is both what the older callers mean and what a tick
    /// queued by a previous build should do rather than vanishing on upgrade.
    static func drawnDays(feed: Feed, ticked: Set<String>, wanted: Set<String>, today: String,
                          tickedAt: [String: Double] = [:], now: Double = Date().timeIntervalSince1970) -> [DaySection] {
        let days: [DaySection] = (feed.days ?? []).compactMap { day in
            let lines = day.lines.compactMap { l -> Line? in
                // A queued tick used to remove the row outright, which left
                // nothing to undo — Sean asked for the ability to uncheck a
                // mis-tap "in all apps", and this was the surface with no way
                // back at all. It stays, drawn done, until the app drains the
                // queue; tapping it again takes it out of the queue.
                //
                // No timer, because a widget has none: the window is "until
                // the app next comes forward" rather than two seconds. That is
                // longer than the phone's grace and shorter than nothing.
                let pending = ticked.contains(l.id)
                // Past the grace it is gone from the widget, still queued for
                // the app. No timestamp means it was ticked by a build that
                // did not record one — draw it rather than drop it.
                if pending, let at = tickedAt[l.id], now - at >= TICK_GRACE { return nil }
                // The picker chooses CALENDARS, so it filters EVENTS. A
                // reminder is never filtered here: whether it appears at all
                // was already decided by the tri-state in Manage reminders,
                // which core applied when it built these days. Filtering it
                // twice, on an axis the user did not choose, is how the widget
                // came to disagree with the calendar it is named after.
                if !l.isReminder, !wanted.isEmpty {
                    guard let c = l.calendarId, wanted.contains(c) else { return nil }
                }
                return Line(id: l.id, text: l.text, time: l.time, isReminder: l.isReminder,
                            overdue: l.overdue, color: l.color.map(hexColor) ?? LABEL,
                            pending: pending)
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

    /// What each piece of the card actually costs, in POINTS.
    ///
    /// This replaces a budget denominated in "rows" with a heading charged at
    /// "about 1.4 rows". That model overflowed the card — Sean, twice — for
    /// three separate reasons, and the row unit hid all of them:
    ///
    ///   · the HEADER ("Calendar" + the date) was never charged at all, so
    ///     every card started 26pt over budget and sliced its own title;
    ///   · the 2pt divider between days, with 5pt of air each side, was also
    ///     free — six of them on a seven-day card is 72pt nobody paid for;
    ///   · a heading was charged 1.4 rows (28pt) for a 20pt block, which
    ///     masked some of the above and made the error hard to reason about.
    ///
    /// Every number below is the sum of the literals the view draws with, and
    /// the line heights are MEASURED (ascent + descent + leading of the exact
    /// system font and size), not estimated:
    ///
    ///   row       12pt text = 15pt line, + 5 bottom padding      = 20
    ///   heading   10pt bold = 12pt line, + 1 rule + 2 + 5        = 20
    ///   separator 2pt rule + 5 above + 5 below                   = 12
    ///   header    15pt bold = 18pt line, + 8 bottom padding      = 26
    ///
    /// Change a font or a padding in this file and the matching number here
    /// has to move with it; check-widget-feed.sh asserts the packing never
    /// exceeds the space it was given, which is what keeps that honest.
    static let ROW_H: Double = 20
    static let HEADING_H: Double = 20
    static let SEPARATOR_H: Double = 12
    static let HEADER_H: Double = 26

    /// The last row's bottom padding is TRAILING WHITESPACE — there is
    /// nothing under it, so it does not have to fit on the card.
    ///
    /// Sean, 2026-08-11: "widget could maybe take one more event". Charging
    /// that final 5pt is the one place the fit was conservative rather than
    /// wrong: a card with 115pt of room was told it could hold five rows
    /// (100pt) when the sixth's ink ends at 115 and only its empty margin
    /// spills. Reclaiming it adds a row whenever the shortfall is under 5pt,
    /// and never lets ink past the edge — which is what the sweep in
    /// check-widget-feed.sh actually asserts.
    static let ROW_TRAILING: Double = 5

    var body: some View {
        // The card measures ITSELF. WidgetKit hands the view its real content
        // size — after the system's own margins, and different on every device
        // and family — so there is nothing left to guess and no table of
        // family sizes to keep right. `family` is still read, but only by the
        // small card's own row cap below.
        GeometryReader { geo in
            layout(available: max(0, geo.size.height - Self.HEADER_H))
        }
    }

    private func layout(available: Double) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // firstTextBaseline, not the default centring: two different type
            // sizes centred against each other is exactly what makes a header
            // like this look a pixel off, and Sean asked for the baselines to
            // line up rather than the boxes.
            HStack(alignment: .firstTextBaseline) {
                Text("Calendar").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                Spacer()
                Text(headerDate(Date()))
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
                content(available: available)
            }
            Spacer(minLength: 0)
        }
    }

    /// Which days actually get drawn, and how much of each.
    ///
    /// Sean, 2026-08-10: "only show as many upcoming days as will fully fit on
    /// the size of the widget". Before this, a day was truncated to whatever
    /// rows were left — so the last day on the card showed two of its five
    /// items with nothing saying the rest existed, which is worse than not
    /// showing that day at all.
    ///
    /// THE FIRST DAY IS THE EXCEPTION, and it is a deliberate one. Applying
    /// "whole days only" to the first day means a today with more items than
    /// the card can hold draws NOTHING — a busy day would empty the widget,
    /// which is the opposite of what it is for. So the first day fills what
    /// space there is; every day after it is all-or-nothing.
    ///
    /// Stops at the first day that will not fit rather than skipping ahead to
    /// a smaller one: a card that silently omits Tuesday and shows Wednesday
    /// is lying about what is coming up.
    ///
    /// Static and pure for the usual reason — as a computed property over
    /// `entry` and `@Environment(\.widgetFamily)` it could only ever run
    /// inside a rendered widget on a phone, which is the one place nothing in
    /// this repo can look. tools/check-widget-feed.sh calls it directly.
    /// `available` is the room left for the day list AFTER the header, in
    /// points — measured from the real card at render time rather than looked
    /// up in a table of family sizes. The old code guessed a budget per
    /// family; a guess cannot be right on every device, and it was the guess
    /// that overflowed.
    static func packed(days: [DaySection], available: Double,
                       rowH: Double, headingH: Double, sepH: Double,
                       trailing: Double = 0) -> [DaySection] {
        var used = 0.0
        var out: [DaySection] = []
        for (i, day) in days.enumerated() {
            let sep = i == 0 ? 0 : sepH
            // A day is only worth starting if its heading AND at least one of
            // its rows will fit; a heading alone is a promise with nothing
            // under it. `trailing` is forgiven because whatever ends up last
            // has nothing drawn beneath its bottom margin.
            if used + sep + headingH + rowH - trailing > available { break }
            let room = available - used - sep - headingH + trailing
            let canTake = Int((room / rowH).rounded(.down))
            let take: [Line]
            if i == 0 {
                // The first day fills what there is — see above for why it is
                // the exception.
                take = Array(day.lines.prefix(canTake))
            } else {
                // Every later day is all-or-nothing.
                if day.lines.count > canTake { break }
                take = day.lines
            }
            if take.isEmpty { break }
            used += sep + headingH + Double(take.count) * rowH
            out.append(DaySection(heading: day.heading, isToday: day.isToday, lines: take))
        }
        return out
    }

    /// What `packed`'s result will actually occupy. Pure, so the checker can
    /// assert the thing that matters — that it never exceeds what it was
    /// given — instead of re-deriving the arithmetic and agreeing with itself.
    /// How far the INK reaches — the last row's bottom margin is excluded,
    /// because that is the space being deliberately allowed to spill.
    static func drawnHeight(_ days: [DaySection], rowH: Double, headingH: Double, sepH: Double,
                            trailing: Double = 0) -> Double {
        var h = 0.0
        for (i, day) in days.enumerated() {
            h += (i == 0 ? 0 : sepH) + headingH + Double(day.lines.count) * rowH
        }
        return days.isEmpty ? 0 : h - trailing
    }

    private func content(available: Double) -> some View {
        let out = Self.packed(days: entry.days, available: available,
                              rowH: Self.ROW_H, headingH: Self.HEADING_H, sepH: Self.SEPARATOR_H,
                              trailing: Self.ROW_TRAILING)
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
                    Image(systemName: line.pending ? "checkmark.square.fill" : "square")
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
