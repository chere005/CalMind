import Foundation

/**
 How the wrist says a time and a day. ONE implementation, so nothing is left
 speaking 24-hour after Sean asked for 12 — the complication, the events
 list, the month page and the reminder rows all come through here.

 His spec came in two passes. First: `Today 3pm event name` or
 `8/15 5pm event name` — 12-hour, lowercase, no leading zero on the hour, no
 ':00' on the hour, no separator glyph between the parts.

 Then he tightened it for the face: drop am/pm unless the time is 8pm or
 later, and on the COMPLICATION drop "Today" entirely and show only the time.
 So a line now reads `Today 3 event name`, `8/15 5 event name`, `8pm dinner`,
 and the complication reads `3` for that first one.

 Cases he did not name, decided here and stated plainly:
   - half past reads "3:30" — minutes appear only when there are any
   - an ALL-DAY event has no time to show, so it reads "Today Chase" or
     "8/15 Chase" rather than inventing a midnight; on the complication,
     where the day is otherwise dropped, an all-day event today keeps the
     word "Today" because there is nothing else to say
   - no time ever reads "am". The only times that carry a suffix are 20:00
     and later, and they are all pm
 */
enum WatchFormat {
    private static let ymd: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f
    }()

    /// From this hour on, a time carries its "pm". 20 = 8pm, Sean's line.
    static let lateHour = 20

    /// "15:30" -> "3:30", "15:00" -> "3", "20:00" -> "8pm", "21:30" -> "9:30pm".
    ///
    /// Sean's rule, and it is about SPACE rather than correctness: drop am/pm
    /// unless the time is 8pm or later, and then show pm. A wrist is a few
    /// characters wide and "3pm" spends two of them on something he can
    /// infer — nothing in his day is at 3am. Late evening is the one place
    /// that guess goes wrong, so that is where the suffix stays.
    ///
    /// Midnight and noon are still the two that catch 12-hour clocks out:
    /// 00:00 is "12" and 12:00 is "12", neither carrying a suffix now.
    static func clock(_ hhmm: String?) -> String? {
        guard let hhmm, hhmm.count >= 4 else { return nil }
        let parts = hhmm.split(separator: ":")
        guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return nil }
        let suffix = h >= lateHour ? "pm" : ""
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
    ///
    /// TODAY IS NOT NAMED. On the face, "Today" is the one word that cannot
    /// be news — the complication only ever shows what is next — and the
    /// room it takes is room the event's name does not get. A date appears
    /// exactly when it is not today. An all-day event today has no time to
    /// fall back on, so that one keeps the word.
    static func when(date: String, time: String?, today: String) -> String {
        if date == today { return clock(time) ?? "Today" }
        return [day(date, today: today), clock(time)].compactMap { $0 }.joined(separator: " ")
    }

    static func todayStr() -> String { ymd.string(from: Date()) }
}
