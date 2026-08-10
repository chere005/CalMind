import Foundation

/**
 How the wrist says a time and a day. ONE implementation, so nothing is left
 speaking 24-hour after Sean asked for 12 — the complication, the events
 list, the month page and the reminder rows all come through here.

 His spec, verbatim: `Today 3pm event name` or `8/15 5pm event name`. So:
 12-hour, lowercase am/pm, no leading zero on the hour, no ':00' on the hour,
 no separator glyph between the parts.

 Two cases he did not name, decided here and stated plainly:
   - half past reads "3:30pm" — minutes appear only when there are any
   - an ALL-DAY event has no time to show, so it reads "Today Chase" or
     "8/15 Chase" rather than inventing a midnight
 */
enum WatchFormat {
    private static let ymd: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f
    }()

    /// "15:30" -> "3:30pm", "15:00" -> "3pm", "00:30" -> "12:30am".
    /// Midnight and noon are the two that catch 12-hour clocks out.
    static func clock(_ hhmm: String?) -> String? {
        guard let hhmm, hhmm.count >= 4 else { return nil }
        let parts = hhmm.split(separator: ":")
        guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return nil }
        let suffix = h < 12 ? "am" : "pm"
        let h12 = h % 12 == 0 ? 12 : h % 12
        return m == 0 ? "\(h12)\(suffix)" : "\(h12):\(String(format: "%02d", m))\(suffix)"
    }

    /// "Today" when it is, otherwise "8/15" — no leading zeros, matching how
    /// Sean writes a date.
    static func day(_ date: String, today: String) -> String {
        if date == today { return "Today" }
        guard let d = ymd.date(from: date) else { return date }
        let c = Calendar.current.dateComponents([.month, .day], from: d)
        guard let mo = c.month, let da = c.day else { return date }
        return "\(mo)/\(da)"
    }

    /// The whole line Sean asked for: "Today 3pm Chase", "8/15 5pm Chase",
    /// and "Today Chase" when the event has no time at all.
    static func line(date: String, time: String?, text: String, today: String) -> String {
        let bits = [day(date, today: today), clock(time), text].compactMap { $0 }
        return bits.joined(separator: " ")
    }

    /// Just the when, for the small complication families that have no room
    /// for a title.
    static func when(date: String, time: String?, today: String) -> String {
        [day(date, today: today), clock(time)].compactMap { $0 }.joined(separator: " ")
    }

    static func todayStr() -> String { ymd.string(from: Date()) }
}
