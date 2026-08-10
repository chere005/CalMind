import SwiftUI

/**
 The wrist's reminders, in the phone's own structure: folder, then section,
 then the rows — Sean asked for the grouping rather than one flat list.

 A 41mm screen is about 25 characters wide, so the structure has to earn its
 space. Three decisions, stated rather than assumed:

 - A folder header is drawn ONLY when there is more than one folder. With a
   single folder its name is a title bar for the whole page and says nothing.
 - A section header is drawn only when its folder has more than one section.
   A folder with one section has already been named by the folder.
 - Every name is one line, truncated at the tail. Nothing wraps: two lines of
   header above a one-line reminder inverts what the page is for. The phone's
   nesting is at most folder → section, so there is no deeper case to handle.

 Order is the phone's order throughout — the feed arrives sorted and nothing
 here re-sorts it.
 */
struct ReminderListView: View {
    @EnvironmentObject var store: WatchStore

    /// Nothing is decided here. core's watchGroups made every call — which
    /// folder gets a header, which section does, what happens to a row whose
    /// folder never arrived — and those rules are tested there. This draws.
    ///
    /// EXCEPT for one fallback, which a watchOS simulator caught before Sean's
    /// wrist did: a cache written before `groups` existed decodes with items
    /// but no groups (`list.groups ?? []`), and drawing groups then produced a
    /// completely BLANK page — not even the empty state, because items was not
    /// empty. His watch is in exactly that state right now, so the first
    /// launch of this build would have shown him nothing at all until a fresh
    /// push arrived. One flat group is a poor layout and an honest one; the
    /// next push replaces it.
    private var drawn: [WatchGroup] {
        if !store.groups.isEmpty { return store.groups }
        return [WatchGroup(folderName: nil, sections: [.init(sectionName: nil, items: store.items)])]
    }
    var body: some View {
        Group {
            if store.items.isEmpty {
                // Same trap as the Summary page: an empty list and an empty
                // WATCH must not read alike.
                Text(store.feed == .waiting ? "Waiting for your phone" : "Nothing to do")
                    .foregroundStyle(.secondary)
            } else {
                List {
                    ForEach(Array(drawn.enumerated()), id: \.offset) { _, group in
                        Section {
                            ForEach(Array(group.sections.enumerated()), id: \.offset) { _, part in
                                if let s = part.sectionName {
                                    Text(s)
                                        .font(.caption2.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                        .truncationMode(.tail)
                                }
                                ForEach(part.items) { item in row(item) }
                            }
                        } header: {
                            if let f = group.folderName {
                                Text(f).lineLimit(1).truncationMode(.tail)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Reminders")
    }

    @ViewBuilder
    private func row(_ item: WatchItem) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Button {
                store.tick(item.id)
            } label: {
                Image(systemName: "circle")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.text)
                    .font(.body)
                    .lineLimit(2)
                if let chip = chip(item) {
                    Text(chip)
                        .font(.caption2)
                        .foregroundStyle(overdue(item) ? .orange : .secondary)
                }
            }
        }
    }

    /// The same words the complication uses — "3" for today, "8/15 5" for a
    /// later day, "8pm" for tonight — so a time never reads one way on the
    /// face and another in the list.
    private func chip(_ item: WatchItem) -> String? {
        let today = WatchFormat.todayStr()
        guard let due = item.due else { return WatchFormat.clock(item.time) }
        let out = WatchFormat.when(date: due, time: item.time, today: today)
        return out.isEmpty ? nil : out
    }

    private func overdue(_ item: WatchItem) -> Bool {
        guard let due = item.due else { return false }
        return due < WatchFormat.todayStr()
    }
}
