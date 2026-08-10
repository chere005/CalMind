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

/// One glance: what's left today, and what's next on the calendar.
struct SummaryView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        let today = todayStr()
        let open = store.items.filter { !$0.done }
        // Undated is not due — an empty string compares before every date,
        // which made every undated reminder "due today" until this said no.
        // And no TOTAL anywhere: "29 to do" was Sean's first complaint with
        // this screen on his wrist — a tally of everything he has ever owed
        // says nothing about NOW. The page leads with what is actually due.
        let dueToday = open.filter { $0.due != nil && $0.due! <= today }
        let nextEvent = store.events.first
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                // 'Nothing due today' used to be shown whether the watch had
                // the list and nothing was due, or had never received
                // anything at all. Same words, opposite meanings — and that
                // ambiguity is exactly what an evening of 'my watch is not
                // syncing' turned out to be. The state says which.
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
                    Text(dueToday.isEmpty ? "Nothing due today" : "Due today")
                        .font(.headline)
                        .foregroundStyle(dueToday.isEmpty ? .secondary : .primary)
                }
                ForEach(dueToday.prefix(3)) { r in
                    Label(r.text, systemImage: "circle")
                        .font(.body)
                        .lineLimit(2)
                }
                if dueToday.count > 3 {
                    // A continuation, not a statistic: it counts THESE, and
                    // the Reminders page below holds them.
                    Text("and \(dueToday.count - 3) more")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                if let e = nextEvent {
                    Divider()
                    Label {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(e.text).lineLimit(2)
                            Text(WatchFormat.when(date: e.date, time: e.time, today: todayStr()))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "calendar")
                            .foregroundStyle(Color(hex: e.color))
                    }
                    .font(.body)
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
                                        if let t = WatchFormat.clock(e.time) {
                                            Text(t).font(.caption2).foregroundStyle(.secondary)
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
        let cols = Array(repeating: GridItem(.flexible(), spacing: 2), count: 7)
        ScrollView {
            Text(now.formatted(.dateTime.month(.wide)))
                .font(.headline)
            LazyVGrid(columns: cols, spacing: 3) {
                ForEach(0..<lead, id: \.self) { _ in Text("") }
                ForEach(1...days, id: \.self) { d in
                    let ds = String(format: "%@-%02d", ym, d)
                    VStack(spacing: 1) {
                        Text("\(d)")
                            .font(.system(size: 11))
                            .foregroundStyle(ds == today ? Color.green : .primary)
                        Circle()
                            .fill(dated.contains(ds) ? Color.accentColor : .clear)
                            .frame(width: 4, height: 4)
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
