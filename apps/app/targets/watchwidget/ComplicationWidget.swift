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
    struct List: Codable { let items: [Row]; let events: [Ev]?; let clock24: Bool? }
    guard let d = UserDefaults(suiteName: "group.com.seancheren.calmind")?.data(forKey: "watchlist.json") else {
        return []
    }
    do {
        let list = try JSONDecoder().decode(List.self, from: d)
        // Sean's Settings choice rides with the list; set it before anything
        // formats a time. Optional, so a cache written before the setting
        // existed still decodes and reads as 12-hour, which is what it was.
        CLOCK24 = list.clock24 ?? false
        return Array((list.events ?? []).prefix(2))
    } catch {
        // A complication has one line and no room to explain itself, so this
        // cannot surface the way the app's screens do. It can at least leave a
        // trace: a silent decode failure here draws exactly like a genuinely
        // empty calendar, which is the confusion that cost an evening.
        NSLog("[Complication] decode FAILED: %@", String(describing: error))
        return []
    }
}

/**
 Sean's format, verbatim: `Today 3pm event name` or `8/15 5pm event name`.

 12-hour, lowercase am/pm, no leading zero, no ':00' on the hour, and NO
 separator glyph between the parts — the ' · ' that used to sit there is
 gone. Half past reads '3:30pm'; an all-day event has no time to show, so it
 reads 'Today Chase' rather than inventing a midnight.

 Duplicated from the watch app's WatchFormat on purpose: a widget extension
 is its own target and cannot see the app's sources. Change one, change both
 — they are the same words on the same wrist.
 */
private let ymdFmt: DateFormatter = {
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f
}()

func todayStr() -> String { ymdFmt.string(from: Date()) }

/// "15:30" -> "3:30", "15:00" -> "3", "20:00" -> "8pm", "21:30" -> "9:30pm".
///
/// Sean's rule, and it is about SPACE rather than correctness: drop am/pm
/// unless the time is 8pm or later, and then show pm. A complication is a
/// few characters wide, and "3pm" spends two of them on something he can
/// infer — nothing in his day is at 3am. Late evening is the one place the
/// guess goes wrong, so that is where the suffix stays.
///
/// Deliberately never "am": the only times that carry a suffix are 20:00 and
/// after, which are all pm.
func clock12(_ hhmm: String?) -> String? {
    guard let hhmm, hhmm.count >= 4 else { return nil }
    let parts = hhmm.split(separator: ":")
    guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return nil }
    if CLOCK24 { return "\(String(format: "%02d", h)):\(String(format: "%02d", m))" }
    let suffix = h >= LATE_HOUR ? "pm" : ""
    let h12 = h % 12 == 0 ? 12 : h % 12
    return m == 0 ? "\(h12)\(suffix)" : "\(h12):\(String(format: "%02d", m))\(suffix)"
}

/// From this hour on, a time carries its "pm". 20 = 8pm, Sean's line.
let LATE_HOUR = 20
/// Sean's Settings choice, read from the same cached feed the events come
/// from. A complication is its own process and cannot see a pref record.
var CLOCK24 = false

/// "Today" when it is, otherwise "8/15" — no leading zeros.
func dayLabel12(_ date: String) -> String {
    let today = todayStr()
    if date == today { return "Today" }
    guard let d = ymdFmt.date(from: date) else { return date }
    let c = Calendar.current.dateComponents([.month, .day], from: d)
    guard let mo = c.month, let da = c.day else { return date }
    return "\(mo)/\(da)"
}

/// The circle has room for one thing: the time if there is one, else the day
/// — and for an all-day event today that is "now", the same word the wider
/// families use. Going through `when` for today keeps the two from drifting.
func whenShort(_ e: Ev) -> String {
    if isToday(e) { return clock12(e.time) ?? "now" }
    return clock12(e.time) ?? dayLabel12(e.date)
}

/// The when, as Sean writes it: "3" for something today, "8/15 5" for a
/// later day, "8pm" for tonight, and "now" for an all-day event today.
///
/// TODAY IS NOT NAMED. On the face, "Today" is the one word that cannot be
/// news — the complication is only ever showing what is next, and the room
/// it takes is room the event's name does not get. A date appears exactly
/// when it is not today, which is when it carries information.
///
/// An all-day event today reads "now", not "Today" — Sean, 2026-08-10. It is
/// shorter, and on a face that only ever shows what is next, "Today" was
/// answering a question nobody asked while "now" says the thing is live.
func when(_ e: Ev) -> String {
    if e.date == todayStr() {
        // No time to show, so the word carries it: this one is happening.
        return clock12(e.time) ?? "now"
    }
    return [dayLabel12(e.date), clock12(e.time)].compactMap { $0 }.joined(separator: " ")
}

/// Is this the thing happening today? The face colours it differently if so.
///
/// Sean asked for today's time in "a distinct color". Green is not a new
/// invention — it is already what today means on this wrist, in the watch
/// app's own day list and month grid (WatchTabs). Reusing it means the face
/// and the app agree rather than each having a private idea of "today".
func isToday(_ e: Ev) -> Bool { e.date == todayStr() }

/// The one colour that means "today" on this wrist.
let TODAY_TINT = Color.green

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
            // Today's time carries the tint; a later day stays quiet, so the
            // one thing that is happening NOW is the thing the eye lands on.
            Text(when(e)).foregroundStyle(isToday(e) ? TODAY_TINT : Color.secondary)
            Text(e.text).lineLimit(1).truncationMode(.tail)
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
                // The next event's when, its title curling round as the label.
                if let e = entry.events.first {
                    Text(whenShort(e))
                        .font(.headline)
                        .foregroundStyle(isToday(e) ? TODAY_TINT : Color.primary)
                        .widgetLabel("\(e.text)")
                } else {
                    Image(systemName: "calendar").widgetLabel("No events")
                }
            default: // .accessoryCircular — room for one short word, so the
                // next event's time (or day), not a tally of what exists.
                ZStack {
                    Circle().stroke(.tertiary, lineWidth: 2)
                    if let e = entry.events.first {
                        VStack(spacing: 0) {
                            Text(whenShort(e))
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(isToday(e) ? TODAY_TINT : Color.primary)
                            Image(systemName: "calendar").font(.system(size: 8))
                        }
                    } else {
                        Image(systemName: "calendar").font(.body)
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
