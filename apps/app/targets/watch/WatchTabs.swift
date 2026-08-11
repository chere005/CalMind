import SwiftUI

/// The watch's four pages: Summary, Reminders, Events, and a month at a
/// glance.
///
/// HORIZONTAL paging, with the dot indicator. It was .verticalPage first,
/// and Sean reported 'I can't see any events' while the events sat one page
/// below him — left/right is the gesture anyone tries on a watch, and it did
/// nothing. Vertical paging is for a single scrolling story (Workout's
/// metrics), not for peer tabs. The dots are the point: they say how many
/// pages exist and which one you are on, which is exactly what was missing.
struct WatchTabs: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        TabView {
            SummaryView().environmentObject(store)
            ReminderListView().environmentObject(store)
            EventListView().environmentObject(store)
            MonthView().environmentObject(store)
        }
        .tabViewStyle(.page)
    }
}

private func todayStr() -> String {
    let fmt = DateFormatter()
    fmt.dateFormat = "yyyy-MM-dd"
    return fmt.string(from: Date())
}

/// "2026-08-12" -> "Wed, Aug 12", or Today/Tomorrow where it reads better.
private func dayLabel(_ date: String) -> String {
    let inFmt = DateFormatter()
    inFmt.dateFormat = "yyyy-MM-dd"
    guard let d = inFmt.date(from: date) else { return date }
    if Calendar.current.isDateInToday(d) { return "Today" }
    if Calendar.current.isDateInTomorrow(d) { return "Tomorrow" }
    let out = DateFormatter()
    out.dateFormat = "EEE, MMM d"
    return out.string(from: d)
}

/// The first page: exactly what the home-screen widget is showing.
///
/// Sean, 2026-08-10: "the first watch tab should match what is shown in the
/// widget entirely including reminders" — and "watch should mirror folders
/// selected by widget". Both are one rule: draw core's `days` (the widget's
/// own shape, decided in widgetDays) and apply the widget's calendar
/// selection, which now travels in the feed because the widget writes it into
/// the App Group where the phone can read it.
///
/// This REPLACED a hand-built summary — a "due today" count and the next
/// event. That page was assembled from `items` and `events` with its own idea
/// of what mattered, so it could not help but disagree with the widget: it
/// had no notion of the tri-state, of an overdue item landing on today, or of
/// a repeat expanding onto a date. Those rules exist once, in core, and this
/// page now reads their output instead of re-deriving a version of them.
struct SummaryView: View {
    @EnvironmentObject var store: WatchStore

    /// The widget's filter, in the watch's copy — pure and static so
    /// tools/check-watch-feed.sh can run it against the same core feed it
    /// runs HomeWidget's copy against. Keep the two identical; a checker,
    /// not discipline, is what says they still are.
    ///
    /// The rule, and it is the whole rule: a selection filters EVENTS by
    /// calendar and never touches a reminder, because whether a reminder
    /// appears was already decided by the tri-state in Manage reminders. An
    /// empty selection means everything. A day left with no lines disappears
    /// rather than drawing a bare heading.
    static func drawnWidgetDays(days: [WatchDay], wanted: Set<String>) -> [WatchDay] {
        days.compactMap { day in
            let lines = day.lines.filter { l in
                if !l.isReminder, !wanted.isEmpty {
                    guard let c = l.calendarId, wanted.contains(c) else { return false }
                }
                return true
            }
            return lines.isEmpty ? nil : WatchDay(date: day.date, lines: lines)
        }
    }

    var body: some View {
        let mirrored = Self.drawnWidgetDays(days: store.days, wanted: Set(store.widgetCalendars))
        // An older phone build sends no `days` at all. Falling back to the old
        // summary would mean keeping two pages alive forever; saying what is
        // actually true costs one line and ages out on its own.
        if store.days.isEmpty, case .loaded = store.feed {
            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Update your iPhone app").font(.headline)
                    Text("This page mirrors your home-screen widget, which needs a newer build on the phone.")
                        .font(.caption2).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Today")
        } else {
            WidgetMirrorView(days: mirrored).environmentObject(store)
        }
    }
}

/// The mirror itself, split out so the fallback above stays readable.
struct WidgetMirrorView: View {
    @EnvironmentObject var store: WatchStore
    let days: [WatchDay]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                switch store.feed {
                case .waiting:
                    Text("Waiting for your phone")
                        .font(.headline).foregroundStyle(.secondary)
                    Text("Open CalMind on your iPhone once, with this app on screen.")
                        .font(.caption2).foregroundStyle(.secondary)
                case let .failed(why):
                    Text("Can't read the list")
                        .font(.headline).foregroundStyle(.orange)
                    Text(why).font(.caption2).foregroundStyle(.secondary)
                case .loaded:
                    if days.isEmpty {
                        // Distinct from 'waiting' on purpose: this one means
                        // the list arrived and there is genuinely nothing on
                        // it. The same words for both is what an evening of
                        // "my watch isn't syncing" turned out to be.
                        Text("Nothing coming up").font(.headline).foregroundStyle(.secondary)
                    }
                }
                ForEach(days.prefix(4), id: \.date) { day in
                    Text(dayLabel(day.date))
                        .font(.caption).bold()
                        .foregroundStyle(day.date == todayStr() ? Color.green : .secondary)
                    ForEach(day.lines.prefix(6)) { l in
                        Label {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(l.text).lineLimit(2)
                                if let t = l.time {
                                    Text(WatchFormat.clockFull(t) ?? t)
                                        .font(.caption2)
                                        .foregroundStyle(l.color.map { Color(hex: $0) } ?? .secondary)
                                }
                            }
                        } icon: {
                            // A reminder gets the tick outline the Reminders
                            // page uses; an event gets its calendar's dot, the
                            // same colour the widget draws it in.
                            Image(systemName: l.isReminder ? "circle" : "calendar")
                                .foregroundStyle(l.overdue ? Color.orange
                                                 : l.color.map { Color(hex: $0) } ?? .secondary)
                        }
                        .font(.body)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle("Today")
    }
}

/// The coming events, grouped by day — the phone sends them already sorted.
struct EventListView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        Group {
            if store.events.isEmpty {
                Text(store.feed == .waiting ? "Waiting for your phone" : "No events coming")
                    .foregroundStyle(.secondary)
            } else {
                List {
                    ForEach(groupByDate(store.events), id: \.0) { date, evs in
                        Section(dayLabel(date)) {
                            ForEach(evs) { e in
                                HStack(alignment: .firstTextBaseline, spacing: 6) {
                                    Circle()
                                        .fill(Color(hex: e.color))
                                        .frame(width: 8, height: 8)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(e.text).font(.body)
                                        if let t = WatchFormat.clockFull(e.time) {
                                            Text(t).font(.caption2).foregroundStyle(Color(hex: e.color))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Events")
    }

    private func groupByDate(_ evs: [WatchEvent]) -> [(String, [WatchEvent])] {
        var order: [String] = []
        var byDate: [String: [WatchEvent]] = [:]
        for e in evs {
            if byDate[e.date] == nil { order.append(e.date) }
            byDate[e.date, default: []].append(e)
        }
        return order.map { ($0, byDate[$0]!) }
    }
}

/// This month, dots on the days that hold events — a glance, not a planner.
struct MonthView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        let today = todayStr()
        let ym = String(today.prefix(7))
        let dated = Set(store.events.filter { $0.date.hasPrefix(ym) }.map { $0.date })
        let cal = Calendar.current
        let now = Date()
        let days = cal.range(of: .day, in: .month, for: now)?.count ?? 30
        let first = cal.date(from: cal.dateComponents([.year, .month], from: now))!
        let lead = (cal.component(.weekday, from: first) - cal.firstWeekday + 7) % 7
        // Rows built BY HAND rather than with LazyVGrid.
        //
        // The grid was handed correct data — a diagnostic confirmed
        // ym=2026-08 days=31 lead=6 weekdayOfFirst=7, all right — and still
        // dropped its first eleven cells: the whole leading row and the 1st
        // through 5th, with everything from the 6th on placed perfectly. Three
        // theories died against that (an empty Text() cell not being laid out,
        // a row hidden above, lazy materialisation), and the arithmetic was
        // never wrong. Seven cells to a row in an HStack is boring, has no
        // laziness to misjudge, and can be read at a glance.
        let cells: [Int?] = Array(repeating: nil, count: lead) + (1...days).map { Optional($0) }
        let weeks = stride(from: 0, to: cells.count, by: 7).map {
            Array(cells[$0 ..< min($0 + 7, cells.count)])
        }
        ScrollView {
            Text(now.formatted(.dateTime.month(.wide)))
                .font(.headline)
            VStack(spacing: 3) {
                ForEach(Array(weeks.enumerated()), id: \.offset) { _, week in
                    HStack(spacing: 2) {
                        ForEach(0..<7, id: \.self) { i in
                            let d = i < week.count ? week[i] : nil
                            VStack(spacing: 1) {
                                Text(d.map(String.init) ?? " ")
                                    .font(.system(size: 11))
                                    .foregroundStyle(
                                        d.map { String(format: "%@-%02d", ym, $0) } == today ? Color.green : .primary)
                                Circle()
                                    .fill(d.map { dated.contains(String(format: "%@-%02d", ym, $0)) } == true
                                          ? Color.accentColor : .clear)
                                    .frame(width: 4, height: 4)
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                }
            }
        }
        .navigationTitle("Month")
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
