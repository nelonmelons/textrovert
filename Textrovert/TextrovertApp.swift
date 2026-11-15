import SwiftUI
import UIKit
import Contacts

@main
struct TextrovertApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .tint(Theme.accent)
        }
    }
}

enum Theme {
    static let purple = Color(red: 0.51, green: 0.23, blue: 0.71)
    static let magenta = Color(red: 0.76, green: 0.21, blue: 0.52)
    static let pink = Color(red: 0.88, green: 0.19, blue: 0.42)
    static let orange = Color(red: 0.97, green: 0.47, blue: 0.22)
    static let gold = Color(red: 0.99, green: 0.69, blue: 0.27)

    static let ink = dynamic(light: (0.153, 0.137, 0.129), dark: (0.95, 0.93, 0.90))
    static let accentTone = Tone(ink: dynamic(light: (0.659, 0.306, 0.345), dark: (0.90, 0.60, 0.64)), fill: dynamic(light: (0.957, 0.890, 0.886), dark: (0.30, 0.17, 0.19)))
    static let plansTone = Tone(ink: dynamic(light: (0.24, 0.37, 0.55), dark: (0.66, 0.78, 0.93)), fill: dynamic(light: (0.827, 0.878, 0.941), dark: (0.16, 0.21, 0.29)))
    static let celebrateTone = Tone(ink: dynamic(light: (0.54, 0.35, 0.04), dark: (0.96, 0.80, 0.45)), fill: dynamic(light: (0.969, 0.875, 0.659), dark: (0.32, 0.25, 0.10)))
    static let repliesTone = Tone(ink: dynamic(light: (0.42, 0.30, 0.55), dark: (0.80, 0.70, 0.93)), fill: dynamic(light: (0.890, 0.843, 0.933), dark: (0.24, 0.19, 0.31)))
    static let coralTone = Tone(ink: dynamic(light: (0.64, 0.29, 0.16), dark: (0.98, 0.70, 0.58)), fill: dynamic(light: (0.973, 0.824, 0.753), dark: (0.34, 0.20, 0.15)))
    static let activitiesTone = Tone(ink: dynamic(light: (0.29, 0.42, 0.18), dark: (0.72, 0.84, 0.60)), fill: dynamic(light: (0.839, 0.898, 0.765), dark: (0.18, 0.25, 0.14)))

    static let accent = accentTone.ink
    static let plans = plansTone.ink
    static let activities = activitiesTone.ink
    static let gifts = coralTone.ink
    static let replies = repliesTone.ink
    static let deadline = Color(red: 0.74, green: 0.29, blue: 0.00)

    private static func dynamic(light: (Double, Double, Double), dark: (Double, Double, Double)) -> Color {
        Color(uiColor: UIColor { traits in
            let c = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: c.0, green: c.1, blue: c.2, alpha: 1)
        })
    }

    static let gradient = LinearGradient(
        colors: [purple, magenta, pink, orange, gold],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

struct RootView: View {
    @State private var showIntro = true
    @StateObject private var store = NotesStore()

    var body: some View {
        ZStack {
            TodayView()
            if showIntro {
                IntroView { withAnimation(.easeOut(duration: 0.35)) { showIntro = false } }
                    .transition(.opacity)
                    .zIndex(1)
            }
        }
        .environmentObject(store)
        .foregroundStyle(Theme.ink)
    }
}

struct IntroView: View {
    let finish: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var gathered = false
    @State private var finished = false

    private let friends = ["MC", "SP", "JR", "AK", "LT", "NB", "RW", "DS"]

    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground).ignoresSafeArea()
            ForEach(Array(friends.enumerated()), id: \.offset) { index, initials in
                let angle = Double(index) / Double(friends.count) * 2 * .pi
                let radius: Double = gathered ? 0 : (index.isMultiple(of: 2) ? 140 : 105)
                let turn: Double = gathered && !reduceMotion ? .pi * 0.9 : 0
                Face(initials: initials)
                    .scaleEffect(gathered ? 0.3 : (index.isMultiple(of: 2) ? 1 : 0.8))
                    .opacity(gathered ? 0 : 1)
                    .offset(x: cos(angle + turn) * radius, y: sin(angle + turn) * radius)
            }
            VStack(spacing: 16) {
                Art.image("hedgehog-mark")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(height: 56)
                    .foregroundStyle(Theme.accent)
                    .scaleEffect(gathered ? 1.3 : 1)
                Text("textrovert")
                    .font(.system(.largeTitle, design: .rounded, weight: .heavy))
                    .foregroundStyle(Theme.accent)
                    .opacity(gathered ? 1 : 0)
                    .offset(y: gathered ? 0 : 8)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { complete() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Textrovert")
        .accessibilityHint("Tap to skip")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("intro")
        .task {
            try? await Task.sleep(for: .milliseconds(reduceMotion ? 150 : 450))
            withAnimation(reduceMotion ? .easeInOut(duration: 0.3) : .spring(duration: 1.1, bounce: 0.15)) {
                gathered = true
            }
            try? await Task.sleep(for: .milliseconds(reduceMotion ? 700 : 1500))
            complete()
        }
    }

    private func complete() {
        guard !finished else { return }
        finished = true
        finish()
    }
}

struct SourceMessage: Identifiable {
    let id: String
    let service: String
    let date: String
    let text: String
}

struct DayMark {
    let year: Int
    let month: Int
    let day: Int
    let sourceID: String
}

struct Friend: Identifiable, Hashable {
    let id: String
    let name: String
    let handle: String
    let initials: String
    let messages: [SourceMessage]
    var birthday: DayMark? = nil
    var firstMessage: DayMark? = nil

    var firstName: String { name.components(separatedBy: " ").first ?? name }

    static func == (lhs: Friend, rhs: Friend) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    static let fixtures: [Friend] = [
        Friend(id: "mia", name: "Mia Chen", handle: "@mia.c", initials: "MC", messages: [
            SourceMessage(id: "shopping", service: "iMessage", date: "Nov 14 · 4:12 PM", text: "See you Thursday at 4 for shopping. Let's meet at the bookstore."),
            SourceMessage(id: "volleyball", service: "iMessage", date: "Nov 12 · 6:20 PM", text: "I love volleyball! Next time you need a +1 for VB, ask me."),
            SourceMessage(id: "tea", service: "iMessage", date: "Nov 10 · 9:15 AM", text: "My birthday is November 16. I've been really into jasmine tea lately."),
            SourceMessage(id: "memory", service: "iMessage", date: "Oct 3 · 8:41 PM", text: "Still thinking about those night market dumplings. Best ones I've ever had.")
        ], birthday: DayMark(year: 0, month: 11, day: 16, sourceID: "tea")),
        Friend(id: "sarah", name: "Sarah Park", handle: "@sarahp", initials: "SP", messages: [
            SourceMessage(id: "brunch", service: "Instagram", date: "Nov 14 · 11:08 AM", text: "Brunch Friday at 11 at Juniper?"),
            SourceMessage(id: "reply", service: "Instagram", date: "Nov 15 · 10:30 AM", text: "Can you confirm brunch by 5 PM today? I'll book the table."),
            SourceMessage(id: "first", service: "Instagram", date: "Nov 18, 2025 · 9:02 PM", text: "So nice meeting you tonight! We should get brunch sometime.")
        ], firstMessage: DayMark(year: 2025, month: 11, day: 18, sourceID: "first")),
        Friend(id: "jules", name: "Jules Rivera", handle: "@julesr", initials: "JR", messages: [
            SourceMessage(id: "volleyball", service: "WhatsApp", date: "Nov 11 · 7:02 PM", text: "I've been playing volleyball at the park on weekends.")
        ])
    ]

    static func matches(_ query: String) -> [(friend: Friend, reason: String)] {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return [] }
        return fixtures.compactMap { friend in
            friend.name.lowercased().contains(query) || friend.handle.lowercased().contains(query) ? (friend, "Name or handle matches") : nil
        }
    }
}

struct Face: View {
    let initials: String
    @ScaledMetric(relativeTo: .headline) private var size = 48
    var body: some View {
        let side = min(size, 64)
        Text(initials)
            .font(.headline)
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            .foregroundStyle(.primary)
            .frame(width: side, height: side)
            .background(Color(uiColor: .secondarySystemBackground), in: Circle())
            .padding(3)
            .overlay(Circle().strokeBorder(Theme.accent.opacity(0.45), lineWidth: 2))
            .accessibilityHidden(true)
    }
}

struct AskBox: View {
    let friend: Friend
    let ask: (String) -> Void
    @State private var text = ""
    @FocusState private var focused: Bool

    private var suggestions: [String] { friend.id == "mia" ? [MiaConversation.question] : [] }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                HedgehogAvatar()
                Text("Hi! Ask me anything about your chats with \(friend.firstName).")
                    .font(.subheadline)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color(uiColor: .secondarySystemBackground), in: UnevenRoundedRectangle(topLeadingRadius: 4, bottomLeadingRadius: 18, bottomTrailingRadius: 18, topTrailingRadius: 18))
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            ForEach(suggestions, id: \.self) { suggestion in
                Button {
                    ask(suggestion)
                } label: {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "bubble.left.and.text.bubble.right")
                            .foregroundStyle(Theme.accent)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(suggestion).font(.subheadline.weight(.medium)).multilineTextAlignment(.leading)
                            Text("About your Nov 14 iMessage chat").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.accent.opacity(0.5), lineWidth: 1))
                    .contentShape(RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ask: \(suggestion)")
                .accessibilityIdentifier("understandConversation")
            }
            HStack(spacing: 8) {
                TextField("Ask about \(friend.firstName)…", text: $text, axis: .vertical)
                    .lineLimit(1...4)
                    .focused($focused)
                    .submitLabel(.send)
                    .onSubmit(send)
                    .accessibilityIdentifier("askField")
                Button(action: send) {
                    Image(systemName: "arrow.up")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 34, height: 34)
                        .background(Theme.accent, in: Circle())
                        .opacity(trimmed.isEmpty ? 0.4 : 1)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .disabled(trimmed.isEmpty)
                .accessibilityLabel("Ask")
                .accessibilityIdentifier("askSend")
            }
            .padding(.leading, 16)
            .padding(.trailing, 4)
            .background(Color(uiColor: .systemBackground), in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.accent, lineWidth: focused ? 2 : 1.25))
        }
        .padding(16)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(Theme.accent.opacity(0.5), lineWidth: 1.5))
    }

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func send() {
        guard !trimmed.isEmpty else { return }
        let question = trimmed
        text = ""
        focused = false
        ask(question)
    }
}

struct AskUnanswered: View {
    let friend: Friend
    let question: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Spacer(minLength: 48)
                    Text(question)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Theme.accent, in: RoundedRectangle(cornerRadius: 18))
                }
                HStack(alignment: .top, spacing: 10) {
                    HedgehogAvatar()
                    VStack(alignment: .leading, spacing: 8) {
                        Text("I can’t answer questions like that about \(friend.firstName) yet.")
                        Text("Answers will come from your conversations once they’re connected.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    .padding(14)
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
                    .accessibilityIdentifier("askNoAnswer")
                    Spacer(minLength: 24)
                }
            }
            .padding(24)
        }
        .navigationTitle("Ask about \(friend.firstName)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
    }
}

struct MessageReference: Identifiable {
    let friend: Friend
    let message: SourceMessage
    var id: String { friend.id + message.id }
}

enum MiaConversation {
    static let question = "Is Mia upset that I told her late I could only stay an hour?"
    static let first = "Are we still on for six?"
    static let middle = "Sorry, I forgot to mention I can only stay an hour tonight."
    static let last = "I wish you’d told me sooner"
    static let reply = "I should’ve let you know sooner. Does six still work?"
}

struct ConversationAnalysis: View {
    @State private var showSource = false
    @State private var showReply = false
    @State private var copied = false
    @State private var draft = MiaConversation.reply

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .trailing, spacing: 6) {
                    Text(MiaConversation.question)
                        .font(.body.weight(.medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Theme.accent, in: RoundedRectangle(cornerRadius: 18))
                    Text("About Nov 14 · iMessage · 5:10–5:41 PM")
                        .font(.caption).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.leading, 40)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("You asked: \(MiaConversation.question)")
                card(title: "What I think", symbol: "lightbulb.fill", color: Theme.accent) {
                    Text("I think the late notice is the part that bothered her.")
                        .font(.body.weight(.medium))
                    Text("She wrote “I wish you’d told me sooner” right after you said you could only stay an hour.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                card(title: "What I can’t tell", symbol: "questionmark.circle.fill", color: Theme.plans) {
                    Text("These words don’t tell me how Mia feels about you overall. She might be frustrated about the timing, or just adjusting plans. Asking her will tell you more than I can.")
                }
                VStack(alignment: .leading, spacing: 12) {
                    Text("Messages this is based on").font(.headline)
                    quoteLine("Mia · 5:10 PM", MiaConversation.first)
                    quoteLine("Mia · 5:41 PM", MiaConversation.last)
                    Button {
                        showSource = true
                    } label: {
                        Label("See the full conversation", systemImage: "bubble.left.and.bubble.right")
                            .font(.subheadline.weight(.semibold))
                            .frame(minHeight: 44)
                    }
                    .accessibilityIdentifier("analysisSource")
                }
                Divider()
                VStack(alignment: .leading, spacing: 12) {
                    Text("A reply you could send").font(.headline)
                    Text("“\(draft)”")
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
                    HStack(spacing: 12) {
                        Button {
                            showReply = true
                        } label: {
                            Label("Edit", systemImage: "pencil")
                                .frame(minHeight: 32)
                        }
                        .buttonStyle(.bordered)
                        .accessibilityLabel("Edit suggested reply")
                        .accessibilityIdentifier("editReply")
                        Button {
                            UIPasteboard.general.string = draft
                            copied = true
                        } label: {
                            Label(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc")
                                .frame(minHeight: 32)
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("copyReply")
                    }
                    Text("I won’t send anything. Copy it into your chat when it sounds like you.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(24)
        }
        .navigationTitle("Ask about Mia")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: draft) { copied = false }
        .sheet(isPresented: $showSource) {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        SourceHeader(friend: Friend.fixtures[0])
                        HStack(spacing: 6) {
                            ServiceIcon(service: "iMessage")
                            Text("Nov 14").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                        Bubble(text: MiaConversation.first, meta: "Mia · 5:10 PM", cited: true)
                        Bubble(text: MiaConversation.middle, meta: "You · 5:40 PM", fromMe: true)
                        Bubble(text: MiaConversation.last, meta: "Mia · 5:41 PM", cited: true)
                    }
                    .padding(24)
                    .gridPaper()
                }
                .paperScroll()
                .accessibilityIdentifier("analysisSourceSheet")
                .navigationTitle("")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { showSource = false }
                    }
                }
            }
        }
        .sheet(isPresented: $showReply) {
            NavigationStack {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Make it sound like you.")
                        .foregroundStyle(.secondary)
                    TextEditor(text: $draft)
                        .frame(minHeight: 160)
                        .padding(12)
                        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
                        .accessibilityLabel("Suggested reply draft")
                        .accessibilityIdentifier("replyDraft")
                    Spacer()
                }
                .padding(24)
                .navigationTitle("Reply to Mia")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { showReply = false }
                    }
                }
            }
        }
    }

    private func card<Content: View>(title: String, symbol: String, color: Color, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label {
                Text(title).font(.headline)
            } icon: {
                Image(systemName: symbol).foregroundStyle(color)
            }
            .accessibilityAddTraits(.isHeader)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(color.opacity(0.10), in: RoundedRectangle(cornerRadius: 16))
    }

    private func quoteLine(_ who: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            RoundedRectangle(cornerRadius: 2).fill(Theme.accent).frame(width: 3)
            VStack(alignment: .leading, spacing: 2) {
                Text(who).font(.caption).foregroundStyle(.secondary)
                Text("“\(text)”")
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
    }
}

struct SettingsView: View {
    @StateObject private var contacts = ContactImportModel()
    @State private var showingContacts = false

    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    Face(initials: "ED")
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Emma").font(.headline)
                        Text("Your profile").foregroundStyle(.secondary)
                    }
                }
            }
            Section("Connected accounts") {
                Label("No accounts connected", systemImage: "link")
                Text("Connect your chats so I can help with plans, replies and gift ideas.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Section("Your people") {
                Button {
                    Task {
                        await contacts.requestAccessAndLoad()
                        showingContacts = contacts.hasAccess
                    }
                } label: {
                    Label("Import from Contacts", systemImage: "person.crop.circle.badge.plus")
                }
                if let message = contacts.message {
                    Text(message).font(.subheadline).foregroundStyle(.secondary)
                }
                Text("Contacts are only read after you tap import.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Settings")
        .toolbar(.visible, for: .navigationBar)
        .sheet(isPresented: $showingContacts) {
            NavigationStack {
                List(contacts.names, id: \.self) { name in
                    Label(name, systemImage: "person.crop.circle")
                }
                .navigationTitle("Your contacts")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { showingContacts = false }
                    }
                }
                .overlay {
                    if contacts.names.isEmpty {
                        ContentUnavailableView("No contacts found", systemImage: "person.crop.circle")
                    }
                }
            }
        }
    }
}

@MainActor
private final class ContactImportModel: ObservableObject {
    private let store = CNContactStore()
    @Published private(set) var names: [String] = []
    @Published private(set) var hasAccess = false
    @Published private(set) var message: String?

    func requestAccessAndLoad() async {
        do {
            let granted = try await store.requestAccess(for: .contacts)
            guard granted else {
                message = "Allow Contacts in Settings to import your people."
                return
            }
            let request = CNContactFetchRequest(keysToFetch: [CNContactGivenNameKey as CNKeyDescriptor, CNContactFamilyNameKey as CNKeyDescriptor])
            var loaded: [String] = []
            try store.enumerateContacts(with: request) { contact, _ in
                let name = CNContactFormatter.string(from: contact, style: .fullName) ?? ""
                if !name.isEmpty { loaded.append(name) }
            }
            names = loaded.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
            hasAccess = true
            message = names.isEmpty ? "No contacts found." : "Loaded \(names.count) contacts on this device."
        } catch {
            message = "Contacts couldn’t be loaded. Please try again."
        }
    }
}
