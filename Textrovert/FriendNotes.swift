import SwiftUI
import UIKit

enum AppClock {
    static let now: Date = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"
        if let value = ProcessInfo.processInfo.environment["TEXTROVERT_NOW"], let date = formatter.date(from: value) {
            return date
        }
        return Date()
    }()

    static func date(_ year: Int, _ month: Int, _ day: Int, _ hour: Int = 0, _ minute: Int = 0) -> Date {
        Calendar.current.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute)) ?? now
    }
}

enum NoteSection: String, Codable, CaseIterable, Identifiable {
    case reply, plans, together, memories, gifts
    var id: String { rawValue }

    var title: String {
        switch self {
        case .reply: "Needs a reply"
        case .plans: "Plans"
        case .together: "Things to do together"
        case .memories: "Memories"
        case .gifts: "Gift ideas"
        }
    }

    var noun: String {
        switch self {
        case .reply: "reply"
        case .plans: "plan"
        case .together: "activity"
        case .memories: "memory"
        case .gifts: "gift idea"
        }
    }

    var symbol: String {
        switch self {
        case .reply: "arrowshape.turn.up.left.fill"
        case .plans: "calendar"
        case .together: "figure.2"
        case .memories: "book.closed.fill"
        case .gifts: "gift.fill"
        }
    }

    var tone: Tone {
        switch self {
        case .reply: Theme.repliesTone
        case .plans: Theme.plansTone
        case .together: Theme.activitiesTone
        case .memories, .gifts: Theme.coralTone
        }
    }

    var titlePrompt: String {
        switch self {
        case .reply: "What do you need to answer?"
        case .plans: "Like “Dinner · Saturday, 7 PM”"
        case .together: "Like “Pottery class”"
        case .memories: "Like “Road trip to Big Sur”"
        case .gifts: "Like “Jasmine tea”"
        }
    }

    func empty(_ first: String) -> String {
        switch self {
        case .reply: "Nothing waiting on you."
        case .plans: "No plans with \(first) yet."
        case .together: "Nothing on your list with \(first) yet."
        case .memories: "No memories saved yet."
        case .gifts: "No gift ideas mentioned yet."
        }
    }
}

struct NoteItem: Identifiable, Codable, Hashable {
    var id: String
    var section: NoteSection
    var title: String
    var detail: String
    var sourceID: String? = nil
    var deadline: Date? = nil
    var edited = false
}

extension Friend {
    var baseNotes: [NoteItem] {
        switch id {
        case "mia":
            [
                NoteItem(id: "shopping", section: .plans, title: "Shopping · Thursday, 4 PM", detail: "Bookstore", sourceID: "shopping"),
                NoteItem(id: "volleyball", section: .together, title: "Volleyball", detail: "Said to ask her next time you need a +1", sourceID: "volleyball"),
                NoteItem(id: "memory", section: .memories, title: "Night market dumplings", detail: "She called them the best she’s ever had", sourceID: "memory"),
                NoteItem(id: "tea", section: .gifts, title: "Jasmine tea", detail: "She’s been really into it lately", sourceID: "tea")
            ]
        case "sarah":
            [
                NoteItem(id: "reply", section: .reply, title: "Confirm brunch", detail: "She’s booking Juniper for Friday at 11", sourceID: "reply", deadline: AppClock.date(2026, 11, 15, 17)),
                NoteItem(id: "brunch", section: .plans, title: "Brunch · Friday, 11 AM", detail: "Juniper · Not confirmed yet", sourceID: "brunch")
            ]
        case "jules":
            [
                NoteItem(id: "volleyball", section: .together, title: "Volleyball", detail: "Plays at the park on weekends", sourceID: "volleyball")
            ]
        default:
            []
        }
    }

    func message(_ id: String?) -> SourceMessage? {
        messages.first { $0.id == id }
    }
}

final class NotesStore: ObservableObject {
    struct Saved: Codable {
        var edits: [String: NoteItem] = [:]
        var added: [String: [NoteItem]] = [:]
    }

    struct SimulatedFailure: Error {}

    @Published private(set) var saved = Saved()
    private var failNext: Bool
    private let folder: URL
    private var file: URL { folder.appending(path: "notes.json") }

    init(environment: [String: String] = ProcessInfo.processInfo.environment) {
        folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appending(path: "Textrovert")
        failNext = environment["TEXTROVERT_FAIL_NEXT_SAVE"] == "1"
        if environment["TEXTROVERT_STORE_RESET"] == "1" {
            try? FileManager.default.removeItem(at: file)
        }
        if let data = try? Data(contentsOf: file), let stored = try? JSONDecoder().decode(Saved.self, from: data) {
            saved = stored
        }
    }

    func items(_ friend: Friend, _ section: NoteSection) -> [NoteItem] {
        let base = friend.baseNotes.filter { $0.section == section }.map { saved.edits["\(friend.id)/\($0.id)"] ?? $0 }
        return base + (saved.added[friend.id] ?? []).filter { $0.section == section }
    }

    func save(_ item: NoteItem, for friend: Friend) throws {
        var next = saved
        if friend.baseNotes.contains(where: { $0.id == item.id }) {
            var edit = item
            edit.edited = true
            next.edits["\(friend.id)/\(item.id)"] = edit
        } else {
            var list = next.added[friend.id] ?? []
            if let index = list.firstIndex(where: { $0.id == item.id }) {
                list[index] = item
            } else {
                list.append(item)
            }
            next.added[friend.id] = list
        }
        if failNext {
            failNext = false
            throw SimulatedFailure()
        }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try JSONEncoder().encode(next).write(to: file, options: .atomic)
        saved = next
    }
}

struct Milestone: Identifiable {
    enum Kind { case birthday, friendship(years: Int) }
    let friend: Friend
    let kind: Kind
    let date: Date
    let days: Int
    let sourceID: String

    var id: String {
        if case .birthday = kind { return "\(friend.id)-birthday" }
        return "\(friend.id)-friendship"
    }

    var symbol: String {
        if case .birthday = kind { return "birthday.cake.fill" }
        return "heart.fill"
    }

    private var when: String {
        switch days {
        case 0: "today"
        case 1: "tomorrow"
        default: "in \(days) days"
        }
    }

    var headline: String {
        switch kind {
        case .birthday:
            "\(friend.firstName)’s birthday is \(when)"
        case .friendship(let years):
            "\(years) year\(years == 1 ? "" : "s") since you and \(friend.firstName) first messaged"
        }
    }

    var dateLine: String {
        let day = date.formatted(.dateTime.weekday(.wide).month(.wide).day())
        if case .friendship = kind, days > 0 { return "\(day) · \(when.prefix(1).uppercased() + when.dropFirst())" }
        if case .friendship = kind { return "\(day) · Today" }
        return day
    }

    static func upcoming(within window: Int = 7, now: Date = AppClock.now) -> [Milestone] {
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: now)
        func next(month: Int, day: Int) -> (Date, Int)? {
            guard let date = calendar.nextDate(after: start.addingTimeInterval(-1), matching: DateComponents(month: month, day: day), matchingPolicy: .nextTime),
                  let days = calendar.dateComponents([.day], from: start, to: date).day,
                  days <= window else { return nil }
            return (date, days)
        }
        var found: [Milestone] = []
        for friend in Friend.fixtures {
            if let birthday = friend.birthday, let hit = next(month: birthday.month, day: birthday.day) {
                found.append(Milestone(friend: friend, kind: .birthday, date: hit.0, days: hit.1, sourceID: birthday.sourceID))
            }
            if let since = friend.firstMessage, let hit = next(month: since.month, day: since.day) {
                let years = calendar.component(.year, from: hit.0) - since.year
                if years >= 1 {
                    found.append(Milestone(friend: friend, kind: .friendship(years: years), date: hit.0, days: hit.1, sourceID: since.sourceID))
                }
            }
        }
        return found.sorted { $0.days < $1.days }
    }
}

struct MilestoneRow: View {
    let milestone: Milestone
    @EnvironmentObject private var store: NotesStore

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack(alignment: .bottomTrailing) {
                Face(initials: milestone.friend.initials)
                Image(systemName: milestone.symbol)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Theme.celebrateTone.ink)
                    .frame(width: 24, height: 24)
                    .background(Theme.celebrateTone.fill, in: Circle())
                    .overlay(Circle().strokeBorder(Color(uiColor: .systemBackground), lineWidth: 2))
                    .offset(x: 4, y: 4)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(milestone.headline).font(.headline)
                Text(milestone.dateLine).font(.subheadline).foregroundStyle(.secondary)
                if case .birthday = milestone.kind, let gift = store.items(milestone.friend, .gifts).first {
                    Label("Gift idea: \(gift.title)", systemImage: "gift")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Theme.coralTone.ink)
                }
                if case .friendship = milestone.kind, let message = milestone.friend.message(milestone.sourceID) {
                    HStack(spacing: 6) {
                        ServiceIcon(service: message.service)
                        Text("First message").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }
}

struct MilestoneBanner: View {
    let milestones: [Milestone]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                ToneTab(title: "Coming up", symbol: "sparkles", tone: Theme.celebrateTone)
                Spacer(minLength: 8)
                Art.image("hedgehog-toast")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 44)
                    .accessibilityHidden(true)
            }
            ForEach(milestones) { milestone in
                NavigationLink(value: milestone.friend) {
                    HStack(alignment: .center, spacing: 8) {
                        MilestoneRow(milestone: milestone)
                        RowChevron()
                    }
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
                    .accessibilityElement(children: .combine)
                }
                .buttonStyle(PressableStyle())
                .accessibilityHint("Opens \(milestone.friend.firstName)’s profile")
                .accessibilityIdentifier("milestone-\(milestone.id)")
                if milestone.id != milestones.last?.id { Divider() }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Theme.celebrateTone.fill.opacity(0.55), in: RoundedRectangle(cornerRadius: 18))
        .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Theme.celebrateTone.fill, lineWidth: 1))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("comingUp")
    }
}

struct ActivityMatch: Identifiable {
    let friend: Friend
    let item: NoteItem
    let exact: Bool
    let term: String
    var id: String { "\(friend.id)-\(item.id)" }
}

enum ActivitySearch {
    static let aliases = ["vb": "volleyball", "bball": "basketball"]
    static let related: [String: [String]] = [
        "sports": ["volleyball", "basketball", "tennis", "soccer", "climbing", "running"],
        "sport": ["volleyball", "basketball", "tennis", "soccer", "climbing", "running"],
        "outdoors": ["volleyball", "hiking", "climbing", "running"],
        "food": ["dumplings", "brunch", "dinner", "tea"]
    ]
    static let ignored: Set<String> = ["need", "needs", "a", "an", "the", "for", "to", "with", "and", "or", "plus", "someone", "somebody", "anyone", "who", "wants", "want", "go", "going", "play", "playing", "partner", "buddy", "me", "my", "i", "can", "could", "this", "next", "tomorrow", "today", "tonight", "weekend", "friend", "friends", "1"]
    static let timeWords: Set<String> = ["tomorrow", "today", "tonight", "weekend"]

    static func words(_ text: String) -> [String] {
        text.lowercased().split { !$0.isLetter && !$0.isNumber }.map { aliases[String($0)] ?? String($0) }
    }

    static func terms(_ query: String) -> [String] {
        words(query).filter { !ignored.contains($0) && $0.count >= 2 }
    }

    static func mentionsTime(_ query: String) -> String? {
        words(query).first { timeWords.contains($0) }
    }

    static func matches(_ query: String, store: NotesStore) -> [ActivityMatch] {
        let terms = terms(query)
        guard !terms.isEmpty else { return [] }
        var found: [ActivityMatch] = []
        for friend in Friend.fixtures {
            for item in store.items(friend, .together) {
                let titleWords = words(item.title)
                if let term = terms.first(where: { term in titleWords.contains { $0 == term || ($0.hasPrefix(term) && term.count >= 3) } }) {
                    found.append(ActivityMatch(friend: friend, item: item, exact: true, term: term))
                } else if let term = terms.first(where: { term in (related[term] ?? []).contains { titleWords.contains($0) } }) {
                    found.append(ActivityMatch(friend: friend, item: item, exact: false, term: term))
                }
            }
        }
        return found
    }
}

struct EditorTarget: Identifiable {
    let friend: Friend
    let item: NoteItem
    let isNew: Bool
    var id: String { item.id }
}

struct FriendProfile: View {
    let friend: Friend
    @EnvironmentObject private var store: NotesStore
    @State private var selectedSource: SourceMessage?
    @State private var askedQuestion: String?
    @State private var editing: EditorTarget?
    @State private var wrapped: WrappedFixture?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 16) {
                    Face(initials: friend.initials)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(friend.name).font(.system(.title, design: .rounded, weight: .bold)).accessibilityIdentifier("profileName")
                        Text(friend.handle).foregroundStyle(.secondary)
                    }
                }
                ForEach(Milestone.upcoming().filter { $0.friend.id == friend.id }) { milestone in
                    Button {
                        selectedSource = friend.message(milestone.sourceID)
                    } label: {
                        HStack(alignment: .center, spacing: 8) {
                            MilestoneRow(milestone: milestone)
                            RowChevron()
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .background(Theme.celebrateTone.fill.opacity(0.55), in: RoundedRectangle(cornerRadius: 18))
                        .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 18))
                        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Theme.celebrateTone.fill, lineWidth: 1))
                        .contentShape(RoundedRectangle(cornerRadius: 18))
                        .accessibilityElement(children: .combine)
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityHint("Shows the message this came from")
                    .accessibilityIdentifier("milestoneSource")
                }
                AskBox(friend: friend) { askedQuestion = $0 }
                if let fixture = WrappedFixtures.all.first(where: { $0.id == friend.id }) {
                    Button {
                        wrapped = fixture
                    } label: {
                        HStack(spacing: 14) {
                            Image(systemName: "sparkles")
                                .font(.title3.weight(.bold))
                                .foregroundStyle(.white)
                                .frame(width: 44, height: 44)
                                .background(Theme.gradient, in: RoundedRectangle(cornerRadius: 12))
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Your Wrapped with \(friend.firstName)").font(.system(.headline, design: .rounded, weight: .bold))
                                Text("Standout moments from your chats").font(.subheadline).foregroundStyle(.white.opacity(0.75))
                            }
                            .foregroundStyle(.white)
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.white.opacity(0.8))
                        }
                        .padding(16)
                        .background(Color(red: 0.161, green: 0.145, blue: 0.176), in: RoundedRectangle(cornerRadius: 18))
                        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Theme.gradient, lineWidth: 1.5))
                        .contentShape(RoundedRectangle(cornerRadius: 18))
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityElement(children: .combine)
                    .accessibilityHint("Opens your Wrapped with \(friend.firstName)")
                    .accessibilityIdentifier("openWrapped")
                }
                ForEach(NoteSection.allCases) { section in
                    sectionCard(section)
                }
            }
            .padding(24)
            .gridPaper()
        }
        .paperScroll()
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .paperNavigationBar()
        .sheet(item: $selectedSource) { message in
            NavigationStack {
                MessageSource(friend: friend, message: message)
            }
        }
        .fullScreenCover(item: $wrapped) { fixture in
            WrappedHost(fixture: fixture) { wrapped = nil }
        }
        .sheet(item: $editing) { target in
            NoteEditor(target: target)
                .environmentObject(store)
        }
        .navigationDestination(item: $askedQuestion) { question in
            FriendChat(friend: friend, initialQuestion: question)
        }
    }

    private func sectionCard(_ section: NoteSection) -> some View {
        let items = store.items(friend, section)
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                ToneTab(title: section.title, symbol: section.symbol, tone: section.tone)
                Spacer(minLength: 8)
                Button {
                    editing = EditorTarget(friend: friend, item: NoteItem(id: UUID().uuidString, section: section, title: "", detail: ""), isNew: true)
                } label: {
                    Label("Add", systemImage: "plus")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.accent)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel("Add to \(section.title)")
                .accessibilityIdentifier("add-\(section.rawValue)")
            }
            if items.isEmpty {
                HStack(spacing: 12) {
                    if section == .memories {
                        Art.image("hedgehog-leaf")
                            .resizable()
                            .scaledToFit()
                            .frame(height: 56)
                            .accessibilityHidden(true)
                    }
                    Text(section.empty(friend.firstName)).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            ForEach(items) { item in
                row(item)
                if item.id != items.last?.id { Divider() }
            }
        }
        .sectionCard(section.tone)
    }

    private func row(_ item: NoteItem) -> some View {
        let source = friend.message(item.sourceID)
        return HStack(alignment: .top, spacing: 4) {
            Button {
                if let source {
                    selectedSource = source
                } else {
                    editing = EditorTarget(friend: friend, item: item, isNew: false)
                }
            } label: {
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 4) {
                        if let deadline = item.deadline { DeadlineBadge(deadline: deadline) }
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(item.title).font(.subheadline.weight(.semibold))
                            if let source { ServiceIcon(service: source.service) }
                        }
                        if !item.detail.isEmpty {
                            Text(item.detail).font(.subheadline).foregroundStyle(.secondary)
                        }
                        Provenance(source: source, edited: item.edited)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if source != nil { RowChevron() }
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressableStyle())
            .accessibilityHint(source.map { "Shows the message from \($0.service)" } ?? "Edits this note")
            .accessibilityIdentifier("note-\(item.id)")
            Button {
                editing = EditorTarget(friend: friend, item: item, isNew: false)
            } label: {
                Image(systemName: "pencil")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.accent)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Edit \(item.title)")
            .accessibilityIdentifier("edit-\(item.id)")
        }
    }
}

struct Provenance: View {
    let source: SourceMessage?
    let edited: Bool

    var body: some View {
        if source != nil {
            if edited {
                Label("Edited by you", systemImage: "pencil")
                    .font(.caption).foregroundStyle(.secondary)
            }
        } else {
            Label("Added by you", systemImage: "person.crop.circle")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}

struct NoteEditor: View {
    let target: EditorTarget
    @EnvironmentObject private var store: NotesStore
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var detail: String
    @State private var savedTitle: String
    @State private var savedDetail: String
    @State private var status: Status = .idle
    enum Status { case idle, saved, failed }

    init(target: EditorTarget) {
        self.target = target
        _title = State(initialValue: target.item.title)
        _detail = State(initialValue: target.item.detail)
        _savedTitle = State(initialValue: target.item.title)
        _savedDetail = State(initialValue: target.item.detail)
    }

    private var changed: Bool { title != savedTitle || detail != savedDetail }
    private var trimmedTitle: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var source: SourceMessage? { target.friend.message(target.item.sourceID) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    ToneTab(title: target.item.section.title, symbol: target.item.section.symbol, tone: target.item.section.tone)
                    if let source, !target.isNew {
                        HStack(spacing: 6) {
                            ServiceIcon(service: source.service)
                            Text(source.date).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    field("What", prompt: target.item.section.titlePrompt, text: $title, id: "noteTitle", vertical: false)
                    field("Details", prompt: "Optional", text: $detail, id: "noteDetail", vertical: true)
                    statusView
                }
                .padding(24)
                .gridPaper()
            }
            .paperScroll()
            .paperNavigationBar()
            .navigationTitle(target.isNew ? "Add to \(target.item.section.title)" : "Edit \(target.item.section.noun)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(status == .saved && !changed ? "Done" : "Cancel") { dismiss() }
                        .accessibilityIdentifier("editorClose")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save)
                        .fontWeight(.semibold)
                        .disabled(trimmedTitle.isEmpty || (!changed && status != .failed))
                        .accessibilityIdentifier("noteSave")
                }
            }
        }
    }

    @ViewBuilder private var statusView: some View {
        if status == .failed {
            VStack(alignment: .leading, spacing: 10) {
                Label("Couldn’t save. Your text is still here.", systemImage: "exclamationmark.triangle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.deadline)
                    .accessibilityIdentifier("saveStatus")
                Button(action: save) {
                    Label("Try again", systemImage: "arrow.clockwise").frame(minHeight: 32)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("saveRetry")
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.deadline.opacity(0.10), in: RoundedRectangle(cornerRadius: 14))
        } else if changed {
            Label("Draft · not saved yet", systemImage: "pencil.line")
                .font(.subheadline).foregroundStyle(.secondary)
                .accessibilityIdentifier("saveStatus")
        } else if status == .saved {
            HStack(spacing: 12) {
                Art.image("hedgehog-dance")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 64)
                    .accessibilityHidden(true)
                Label("Saved", systemImage: "checkmark.circle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.activitiesTone.ink)
                    .accessibilityIdentifier("saveStatus")
            }
        }
    }

    private func field(_ label: String, prompt: String, text: Binding<String>, id: String, vertical: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.subheadline.weight(.semibold))
            Group {
                if vertical {
                    TextField(prompt, text: text, axis: .vertical).lineLimit(2...6)
                } else {
                    TextField(prompt, text: text)
                }
            }
            .padding(12)
            .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.accent.opacity(0.35), lineWidth: 1))
            .accessibilityLabel(label)
            .accessibilityIdentifier(id)
        }
    }

    private func save() {
        guard !trimmedTitle.isEmpty else { return }
        var item = target.item
        item.title = trimmedTitle
        item.detail = detail.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try store.save(item, for: target.friend)
            savedTitle = title
            savedDetail = detail
            status = .saved
            UIAccessibility.post(notification: .announcement, argument: "Saved")
        } catch {
            status = .failed
            UIAccessibility.post(notification: .announcement, argument: "Couldn’t save. Your text is still here.")
        }
    }
}

struct WrappedHost: View {
    let fixture: WrappedFixture
    let close: () -> Void
    @State private var share: SharePayload?

    var body: some View {
        WrappedView(
            conversation: fixture.conversation,
            ownerID: WrappedFixtures.owner.id,
            range: fixture.range,
            onClose: close,
            onShare: { text in
                Task {
                    try? await Task.sleep(for: .milliseconds(600))
                    share = SharePayload(text: text)
                }
            }
        )
        .sheet(item: $share) { payload in
            ActivitySheet(text: payload.text)
        }
    }
}

struct SharePayload: Identifiable {
    let id = UUID()
    let text: String
}

struct ActivitySheet: UIViewControllerRepresentable {
    let text: String
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [text], applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
