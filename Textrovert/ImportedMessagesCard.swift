import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    /// Declared in Info.plist, so AirDrop and Files offer to open the Mac app's file in Textrovert.
    static let textrovertMessages = UTType(exportedAs: "com.textrovert.messages")
}

/// The iMessage history imported from the Textrovert Mac app. A copy stays on this phone, so the stats survive relaunches.
@MainActor
final class ImportedMessages: ObservableObject {
    enum State {
        case none
        case reading
        case ready(MessagesFile, TextingStats)
        case failed(String)
    }

    static let ownerID = "me"
    private static let copy = URL.applicationSupportDirectory.appending(path: "Imported Messages.textrovert")

    @Published private(set) var state = State.none
    private var generation = 0

    init() {
        if FileManager.default.fileExists(atPath: Self.copy.path) {
            read(Self.copy, keepCopy: false)
        }
    }

    /// Imports a file from AirDrop, Files or the import button.
    func open(_ url: URL) {
        read(url, keepCopy: true)
    }

    func remove() {
        generation += 1
        try? FileManager.default.removeItem(at: Self.copy)
        state = .none
    }

    private func read(_ url: URL, keepCopy: Bool) {
        generation += 1
        let token = generation
        let copy = Self.copy
        state = .reading
        Task {
            let result = await Task.detached(priority: .userInitiated) {
                Result { () throws -> (MessagesFile, TextingStats) in
                    let scoped = url.startAccessingSecurityScopedResource()
                    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                    let data = try Data(contentsOf: url)
                    let file = try MessagesFile.read(data)
                    if keepCopy {
                        try FileManager.default.createDirectory(at: copy.deletingLastPathComponent(), withIntermediateDirectories: true)
                        try data.write(to: copy, options: .atomic)
                        if url.deletingLastPathComponent().lastPathComponent == "Inbox" {
                            try? FileManager.default.removeItem(at: url)
                        }
                    }
                    return (file, TextingStats(file))
                }
            }.value
            guard token == generation else { return }
            switch result {
            case .success(let (file, stats)):
                state = .ready(file, stats)
            case .failure(let error):
                state = .failed(error.localizedDescription)
            }
        }
    }
}

/// The Today card: how to bring messages over from the Mac, then their stats and a Wrapped for each top person.
struct ImportedMessagesCard: View {
    @EnvironmentObject private var imported: ImportedMessages
    @State private var picking = false
    @State private var wrapped: WrappedFixture?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                ToneTab(title: "Your iMessage stats", symbol: "chart.bar.fill", tone: Theme.celebrateTone)
                Spacer(minLength: 8)
                if case .ready = imported.state {
                    Menu {
                        Button("Import a newer file", systemImage: "square.and.arrow.down") { picking = true }
                        Button("Remove imported messages", systemImage: "trash", role: .destructive) { imported.remove() }
                    } label: {
                        Image(systemName: "ellipsis.circle").font(.title3)
                    }
                    .accessibilityLabel("Imported messages options")
                    .accessibilityIdentifier("importedMenu")
                }
            }
            switch imported.state {
            case .none:
                Text("See your real texting stats and a Wrapped for every friend. On your Mac, open **Textrovert** and click **Save for iPhone**, then AirDrop the file here and choose Textrovert.")
                    .font(.subheadline)
                importButton
                Text("Sent it another way? Save it to Files, then tap Import.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            case .reading:
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Reading your messages…").foregroundStyle(.secondary)
                }
            case .failed(let message):
                Text(message).font(.subheadline).foregroundStyle(Theme.deadline)
                importButton
            case .ready(let file, let stats):
                ImportedStatsView(file: file, stats: stats) { wrapped = $0 }
            }
        }
        .sectionCard(Theme.celebrateTone)
        .fileImporter(isPresented: $picking, allowedContentTypes: [.textrovertMessages, .json, .data]) { result in
            if case .success(let url) = result { imported.open(url) }
        }
        .fullScreenCover(item: $wrapped) { fixture in
            WrappedHost(fixture: fixture, ownerID: ImportedMessages.ownerID) { wrapped = nil }
        }
    }

    private var importButton: some View {
        Button { picking = true } label: {
            Label("Import messages file", systemImage: "square.and.arrow.down")
        }
        .buttonStyle(.borderedProminent)
        .accessibilityIdentifier("importMessages")
    }
}

struct ImportedStatsView: View {
    let file: MessagesFile
    let stats: TextingStats
    let openWrapped: (WrappedFixture) -> Void

    private struct Tile: Identifiable {
        let value: String
        let label: String
        var id: String { label }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if stats.messages == 0 {
                Text("That file has no messages in it.").font(.subheadline).foregroundStyle(.secondary)
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    Text(stats.messages.formatted())
                        .font(.system(size: 44, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.gradient)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                    Text(headline).font(.subheadline).foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("importedTotal")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12, alignment: .top), GridItem(.flexible(), spacing: 12, alignment: .top)], alignment: .leading, spacing: 12) {
                    ForEach(tiles) { tile in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(tile.value)
                                .font(.system(.title2, design: .rounded, weight: .bold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                            Text(tile.label)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Color(uiColor: .systemBackground).opacity(0.7), in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityElement(children: .combine)
                    }
                }
                if !stats.people.isEmpty {
                    people
                }
            }
            Text("From your Mac · saved \(Date(timeIntervalSince1970: file.exportedAt).formatted(date: .abbreviated, time: .shortened))")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var headline: String {
        let chats = stats.chats == 1 ? "1 chat" : "\(stats.chats.formatted()) chats"
        guard let since = stats.since else { return "messages across \(chats)" }
        return "messages across \(chats) since \(since.formatted(.dateTime.month(.wide).year()))"
    }

    private var tiles: [Tile] {
        var tiles: [Tile] = []
        tiles.append(Tile(value: percent(Double(stats.sent) / Double(stats.messages)), label: "of them are from you"))
        if let hour = stats.busiestHour, let date = Calendar.current.date(bySettingHour: hour, minute: 0, second: 0, of: Date()) {
            tiles.append(Tile(value: date.formatted(.dateTime.hour()), label: "is when you text the most"))
        }
        if let day = stats.biggestDay {
            tiles.append(Tile(value: day.messages.formatted(), label: "messages on \(day.date.formatted(.dateTime.month(.abbreviated).day().year())), your biggest day, mostly with \(day.mostlyWith)"))
        }
        if let streak = stats.longestStreak {
            tiles.append(Tile(value: "\(streak.days) days", label: "in a row texting \(streak.name)"))
        }
        if let top = stats.topEmoji.first {
            tiles.append(Tile(value: top.emoji, label: "is your go-to emoji, sent \(top.count.formatted()) times"))
        }
        if stats.laughs > 0 {
            tiles.append(Tile(value: stats.laughs.formatted(), label: "times you laughed: lol, haha, 😂"))
        }
        if stats.sent > 0 {
            tiles.append(Tile(value: percent(stats.lateNight), label: "of your texts go out after midnight"))
        }
        return tiles
    }

    private var people: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your top people").font(.headline)
            ForEach(Array(stats.people.enumerated()), id: \.element.id) { index, person in
                if index > 0 { Divider() }
                Button {
                    if let chat = file.chats.first(where: { $0.id == person.id }), let fixture = chat.wrapped(ownerID: ImportedMessages.ownerID) {
                        openWrapped(fixture)
                    }
                } label: {
                    HStack(spacing: 14) {
                        Face(initials: initials(person.name))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(person.name).font(.headline).lineLimit(1)
                            Text("\(person.messages.formatted()) messages · \(percent(Double(person.fromYou) / Double(person.messages))) from you")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        Text("Wrapped").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.accent)
                        RowChevron()
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressableStyle())
                .accessibilityHint("Opens your Wrapped with \(person.name)")
                .accessibilityIdentifier("importedPerson-\(index)")
            }
        }
    }

    private func percent(_ share: Double) -> String {
        share.formatted(.percent.precision(.fractionLength(0)))
    }

    private func initials(_ name: String) -> String {
        let letters = name.split(separator: " ").prefix(2).compactMap { $0.first(where: \.isLetter) }
        return letters.isEmpty ? "#" : String(letters).uppercased()
    }
}
