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

    /// Sections that actually hold something, under folders that do — an
    /// empty section is a header with nothing beneath it, which on this
    /// screen is pure cost.
    private var groups: [(folder: WatchFolder?, sections: [(section: WatchSection?, items: [WatchItem])])] {
        let byFolder = Dictionary(grouping: store.items, by: { $0.folderId ?? "" })
        var out: [(WatchFolder?, [(WatchSection?, [WatchItem])])] = []
        for f in store.folders where byFolder[f.id]?.isEmpty == false {
            let mine = byFolder[f.id] ?? []
            let secs = store.sections.filter { $0.folderId == f.id }
            var rows: [(WatchSection?, [WatchItem])] = []
            for s in secs {
                let inSec = mine.filter { $0.sectionId == s.id }
                if !inSec.isEmpty { rows.append((secs.count > 1 ? s : nil, inSec)) }
            }
            // A reminder whose section the feed does not carry still has to
            // appear — losing a row to a missing header would be the worst
            // trade on this screen.
            let orphans = mine.filter { r in !secs.contains { $0.id == r.sectionId } }
            if !orphans.isEmpty { rows.append((nil, orphans)) }
            out.append((store.folders.count > 1 ? f : nil, rows))
        }
        // Same again for anything whose folder never arrived.
        let known = Set(store.folders.map(\.id))
        let strays = store.items.filter { !known.contains($0.folderId ?? "") }
        if !strays.isEmpty { out.append((nil, [(nil, strays)])) }
        return out
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
                    ForEach(Array(groups.enumerated()), id: \.offset) { _, group in
                        Section {
                            ForEach(Array(group.sections.enumerated()), id: \.offset) { _, part in
                                if let s = part.section {
                                    Text(s.name)
                                        .font(.caption2.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                        .truncationMode(.tail)
                                }
                                ForEach(part.items) { item in row(item) }
                            }
                        } header: {
                            if let f = group.folder {
                                Text(f.name).lineLimit(1).truncationMode(.tail)
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

    /// The same words the complication uses — "Today 3pm", "8/15 5pm" — so a
    /// time never reads one way on the face and another in the list.
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
