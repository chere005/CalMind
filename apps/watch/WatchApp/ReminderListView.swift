import SwiftUI

struct ReminderListView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        Group {
            if store.items.isEmpty {
                Text("Nothing to do")
                    .foregroundStyle(.secondary)
            } else {
                List(store.items) { item in
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Image(systemName: "circle")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.text)
                                .font(.body)
                            if let chip = chip(item) {
                                Text(chip)
                                    .font(.caption2)
                                    .foregroundStyle(overdue(item) ? .orange : .secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Reminders")
    }

    private func chip(_ item: WatchItem) -> String? {
        let bits = [item.due, item.time].compactMap { $0 }
        return bits.isEmpty ? nil : bits.joined(separator: " · ")
    }

    private func overdue(_ item: WatchItem) -> Bool {
        guard let due = item.due else { return false }
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        let today = fmt.string(from: Date())
        return due < today
    }
}
