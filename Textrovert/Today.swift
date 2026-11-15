import SwiftUI
import UIKit

struct Tone {
    let ink: Color
    let fill: Color
}

struct ToneTab: View {
    let title: String
    let symbol: String
    let tone: Tone

    var body: some View {
        Label {
            Text(title).font(.system(.subheadline, design: .rounded, weight: .bold))
        } icon: {
            Image(systemName: symbol)
        }
        .foregroundStyle(tone.ink)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(tone.fill, in: UnevenRoundedRectangle(topLeadingRadius: 10, bottomLeadingRadius: 4, bottomTrailingRadius: 10, topTrailingRadius: 4))
        .accessibilityAddTraits(.isHeader)
    }
}

extension View {
    func sectionCard(_ tone: Tone) -> some View {
        frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(tone.fill.opacity(0.5), in: RoundedRectangle(cornerRadius: 18))
            .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(tone.fill, lineWidth: 1))
            .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }
}

struct DeadlineBadge: View {
    let deadline: Date
    var now = AppClock.now

    private var remaining: TimeInterval { deadline.timeIntervalSince(now) }
    private var urgent: Bool { remaining > 0 && remaining <= 2 * 3600 }

    private var text: String {
        let calendar = Calendar.current
        let time = deadline.formatted(date: .omitted, time: .shortened)
        if remaining <= 0 { return "Asked for a reply by \(time)" }
        if calendar.isDate(deadline, inSameDayAs: now) { return "Reply by \(time) today" }
        if calendar.isDateInTomorrow(deadline) { return "Reply by \(time) tomorrow" }
        return "Reply by \(time), \(deadline.formatted(.dateTime.month(.abbreviated).day()))"
    }

    var body: some View {
        Label(text, systemImage: urgent ? "clock.badge.exclamationmark.fill" : "clock")
            .font(.subheadline.weight(urgent ? .semibold : .medium))
            .foregroundStyle(urgent ? Color.white : Color.primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(urgent ? Theme.deadline : Color(uiColor: .tertiarySystemFill), in: Capsule())
            .accessibilityLabel(urgent ? "Soon: \(text)" : text)
            .accessibilityIdentifier(urgent ? "deadlineUrgent" : "deadline")
    }
}

struct TodayView: View {
    @EnvironmentObject private var store: NotesStore
    @State private var query = ""
    @State private var selectedReference: MessageReference?
    @State private var askedQuestion: String?
    @FocusState private var searchFocused: Bool
    private var searching: Bool { !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var looksLikeQuestion: Bool {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let first = text.split(separator: " ").first.map(String.init) ?? ""
        return text.hasSuffix("?") || ["who", "what", "when", "where", "why", "how", "is", "are", "does", "do", "should", "can", "will", "did"].contains(first)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    HStack {
                        HStack(spacing: 8) {
                            Art.image("hedgehog-mark")
                                .renderingMode(.template)
                                .resizable()
                                .scaledToFit()
                                .frame(height: 30)
                            Text("textrovert")
                        }
                        .font(.system(.title2, design: .rounded, weight: .heavy))
                        .foregroundStyle(Theme.accent)
                        .accessibilityElement(children: .combine)
                        .accessibilityAddTraits(.isHeader)
                        Spacer()
                        NavigationLink {
                            SettingsView()
                        } label: {
                            Face(initials: "ED")
                        }
                        .accessibilityLabel("Emma, Settings")
                        .accessibilityIdentifier("settings")
                    }
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    if searching {
                        results
                    } else {
                        summary
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 24)
                .padding(.bottom, 40)
                .gridPaper()
            }
            .paperScroll()
            .scrollDismissesKeyboard(.interactively)
            .navigationDestination(for: Friend.self) { friend in
                FriendProfile(friend: friend)
            }
            .navigationDestination(item: $askedQuestion) { question in
                FriendChat(friend: nil, initialQuestion: question)
            }
            .sheet(item: $selectedReference) { reference in
                NavigationStack {
                    MessageSource(friend: reference.friend, message: reference.message, includesProfile: true)
                }
                .environmentObject(store)
            }
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .bottom, spacing: 0) { searchBar }
        }
    }

    private var searchBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                HStack(spacing: 12) {
                    Image(systemName: "magnifyingglass")
                        .font(.body.weight(.bold))
                        .foregroundStyle(searchFocused ? Color.white : Theme.accent)
                        .frame(width: 30, height: 30)
                        .background(searchFocused ? Theme.accent : Color.clear, in: Circle())
                        .accessibilityHidden(true)
                    TextField("", text: $query, prompt: Text("Search or ask me anything").foregroundStyle(Color(uiColor: .secondaryLabel)))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($searchFocused)
                        .submitLabel(.search)
                        .onSubmit {
                            searchFocused = false
                            if searching && looksLikeQuestion { askedQuestion = query }
                        }
                        .accessibilityIdentifier("search")
                    if !query.isEmpty {
                        Button {
                            query = ""
                            searchFocused = false
                        } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                                .frame(minWidth: 44, minHeight: 44)
                        }
                        .accessibilityLabel("Clear search")
                    }
                }
                .padding(.leading, 12)
                .padding(.trailing, 18)
                .frame(minHeight: 54)
                .background(searchFocused ? Theme.accentTone.fill : Color(uiColor: .systemBackground), in: Capsule())
                .overlay(Capsule().strokeBorder(Theme.accent, lineWidth: searchFocused ? 3 : 1.5))
                .shadow(color: searchFocused ? Theme.accent.opacity(0.35) : .black.opacity(0.10), radius: searchFocused ? 12 : 8, y: 3)
                .contentShape(Capsule())
                .onTapGesture { searchFocused = true }
                if searchFocused {
                    Button("Done") { searchFocused = false }
                        .font(.body.weight(.semibold))
                        .frame(minHeight: 44)
                        .accessibilityHint("Closes the keyboard and keeps your search")
                        .accessibilityIdentifier("searchDone")
                        .transition(.opacity)
                }
            }
            if query.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        Text("Try")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .accessibilityHidden(true)
                        suggestion("Mia")
                        suggestion("need +1 for VB tomorrow")
                        suggestion("@sarahp")
                        suggestion("who’s waiting on me?")
                    }
                    .padding(.horizontal, 4)
                }
                .accessibilityIdentifier("searchSuggestions")
            }
        }
        .animation(.easeOut(duration: 0.2), value: searchFocused)
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 6)
        .background {
            UnevenRoundedRectangle(topLeadingRadius: 24, topTrailingRadius: 24)
                .fill(Theme.panel)
                .shadow(color: .black.opacity(0.08), radius: 12, y: -3)
                .ignoresSafeArea(edges: .bottom)
        }
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: 22) {
            Text("Today").font(.system(.largeTitle, design: .rounded, weight: .bold))
            VStack(alignment: .leading, spacing: 14) {
                ToneTab(title: "Waiting on your reply", symbol: "arrowshape.turn.up.left.fill", tone: Theme.repliesTone)
                ForEach(Friend.fixtures) { friend in
                    ForEach(store.items(friend, .reply)) { item in
                        replyRow(friend: friend, item: item)
                    }
                }
            }
            .sectionCard(Theme.repliesTone)
            let milestones = Milestone.upcoming()
            if !milestones.isEmpty {
                MilestoneBanner(milestones: milestones)
            }
            VStack(alignment: .leading, spacing: 14) {
                ToneTab(title: "Upcoming plans", symbol: "calendar", tone: Theme.plansTone)
                planRow(friend: Friend.fixtures[0], title: "Shopping with Mia · Thursday, 4 PM", detail: "Bookstore")
                Divider()
                planRow(friend: Friend.fixtures[1], title: "Brunch with Sarah · Friday, 11 AM", detail: "Juniper · Not confirmed yet")
            }
            .sectionCard(Theme.plansTone)
        }
    }

    private func faceLink(_ friend: Friend) -> some View {
        NavigationLink(value: friend) {
            Face(initials: friend.initials)
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel("Open \(friend.firstName)’s profile")
        .accessibilityIdentifier("face-\(friend.id)")
    }

    private func replyRow(friend: Friend, item: NoteItem) -> some View {
        HStack(alignment: .top, spacing: 14) {
        faceLink(friend)
        Button {
            if let message = friend.message(item.sourceID) {
                selectedReference = MessageReference(friend: friend, message: message)
            }
        } label: {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(item.title) with \(friend.firstName)").font(.headline)
                    if !item.detail.isEmpty {
                        Text(item.detail).font(.subheadline).foregroundStyle(.secondary)
                    }
                    if let deadline = item.deadline { DeadlineBadge(deadline: deadline) }
                }
                Spacer(minLength: 0)
                RowChevron().frame(maxHeight: .infinity)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
        .accessibilityHint("Shows the message this came from")
        .accessibilityIdentifier("reply-\(friend.id)")
        }
    }

    private func suggestion(_ text: String) -> some View {
        Button {
            query = text
            searchFocused = false
        } label: {
            Text(text)
                .font(.subheadline.weight(.medium))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .frame(minHeight: 44)
                .foregroundStyle(Theme.accentTone.ink)
                .background(Theme.accentTone.fill, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel("Search for \(text)")
    }

    private var results: some View {
        let people = Friend.matches(query)
        let activities = ActivitySearch.matches(query, store: store)
        let groups = Dictionary(grouping: activities) { $0.item.title.lowercased() }
            .sorted { lhs, rhs in
                let l = lhs.value.contains(where: \.exact), r = rhs.value.contains(where: \.exact)
                return l != r ? l : lhs.key < rhs.key
            }
        return VStack(alignment: .leading, spacing: 20) {
            Button {
                query = ""
                searchFocused = false
            } label: {
                Label("Back", systemImage: "chevron.left")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Theme.accent)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressableStyle())
            .accessibilityLabel("Back to Today")
            .accessibilityIdentifier("searchBack")
            VStack(alignment: .leading, spacing: 4) {
                Text("Search").font(.system(.largeTitle, design: .rounded, weight: .bold))
                Text("Results for “\(query)”").foregroundStyle(.secondary)
            }
            Button {
                searchFocused = false
                askedQuestion = query
            } label: {
                HStack(spacing: 12) {
                    HedgehogAvatar()
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Ask me").font(.system(.headline, design: .rounded, weight: .bold))
                        Text("“\(query.trimmingCharacters(in: .whitespacesAndNewlines))”")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.up.circle.fill").font(.title2).foregroundStyle(Theme.accent)
                }
                .padding(14)
                .background(Theme.accentTone.fill, in: RoundedRectangle(cornerRadius: 20))
                .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(Theme.accent.opacity(looksLikeQuestion ? 0.8 : 0.25), lineWidth: looksLikeQuestion ? 2 : 1))
                .contentShape(Rectangle())
            }
            .buttonStyle(PressableStyle())
            .accessibilityIdentifier("askHedgehog")
            if people.isEmpty && activities.isEmpty && !looksLikeQuestion {
                VStack(alignment: .leading, spacing: 12) {
                    Art.image("hedgehog-bird")
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 260)
                        .frame(maxWidth: .infinity)
                    Text("No matches").font(.system(.title3, design: .rounded, weight: .bold))
                    Text("I couldn’t find anyone for that. Try a name, a handle like @mia.c, or an activity like volleyball.")
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 24)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("noResults")
            }
            ForEach(groups, id: \.key) { group in
                activityGroup(group.value)
            }
            if !people.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    ToneTab(title: "People", symbol: "person.2.fill", tone: Theme.accentTone)
                    ForEach(people, id: \.friend.id) { match in
                        NavigationLink(value: match.friend) {
                            HStack(spacing: 14) {
                                Face(initials: match.friend.initials)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(match.friend.name).font(.headline)
                                    Text(match.friend.handle).font(.subheadline).foregroundStyle(.secondary)
                                    Text(match.reason).font(.subheadline).foregroundStyle(Theme.accent)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 6)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(PressableStyle())
                        .accessibilityHint("Opens \(match.friend.firstName)’s profile")
                        .accessibilityIdentifier("friend-\(match.friend.id)")
                    }
                }
                .sectionCard(Theme.accentTone)
            }
        }
    }

    private func activityGroup(_ matches: [ActivityMatch]) -> some View {
        let exact = matches.contains(where: \.exact)
        let title = matches[0].item.title
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                ToneTab(title: title, symbol: NoteSection.together.symbol, tone: Theme.activitiesTone)
                Spacer(minLength: 8)
                Text(exact ? "Activity" : "Related interest")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("activityGroup-\(title.lowercased())")
            ForEach(matches) { match in
                activityRow(match)
                if match.id != matches.last?.id { Divider() }
            }
        }
        .sectionCard(Theme.activitiesTone)
    }

    private func activityRow(_ match: ActivityMatch) -> some View {
        let source = match.friend.message(match.item.sourceID)
        return HStack(alignment: .top, spacing: 4) {
            NavigationLink(value: match.friend) {
                HStack(alignment: .top, spacing: 14) {
                    Face(initials: match.friend.initials)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(match.friend.name).font(.headline)
                        if !match.item.detail.isEmpty {
                            Text(match.item.detail).font(.subheadline)
                        }
                        Text(match.exact ? "Mentions \(match.item.title.lowercased())" : "Related to \(match.term)")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(match.exact ? Theme.activitiesTone.ink : Color.secondary)
                        if let source {
                            HStack(spacing: 6) {
                                ServiceIcon(service: source.service)
                                Text(source.date).font(.caption).foregroundStyle(.secondary)
                            }
                        } else {
                            Provenance(source: nil, edited: false)
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(PressableStyle())
            .accessibilityHint("Opens \(match.friend.firstName)’s profile")
            .accessibilityIdentifier("activity-\(match.friend.id)")
            if let source {
                Button {
                    selectedReference = MessageReference(friend: match.friend, message: source)
                } label: {
                    Image(systemName: "quote.bubble")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Theme.accent)
                        .frame(width: 44, height: 44)
                        .background(Theme.accentTone.fill.opacity(0.6), in: Circle())
                }
                .accessibilityLabel("See \(match.friend.firstName)’s message about \(match.item.title.lowercased())")
                .accessibilityIdentifier("activitySource-\(match.friend.id)")
            }
        }
    }

    private func planRow(friend: Friend, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
        faceLink(friend)
        Button {
            selectedReference = MessageReference(friend: friend, message: friend.messages[0])
        } label: {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(.headline)
                    Text(detail).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                RowChevron().frame(maxHeight: .infinity)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
        .accessibilityHint("Shows the message this came from")
        .accessibilityIdentifier("plan-\(friend.id)")
        }
    }
}

struct MessageSource: View {
    let friend: Friend
    let message: SourceMessage
    var includesProfile = false
    @Environment(\.openURL) private var openURL

    private func openService() {
        let links: [String: (app: String, web: String)] = [
            "iMessage": ("sms:", "sms:"),
            "Instagram": ("instagram://direct-inbox", "https://www.instagram.com/direct/inbox/"),
            "WhatsApp": ("whatsapp://", "https://web.whatsapp.com")
        ]
        guard let link = links[message.service], let app = URL(string: link.app), let web = URL(string: link.web) else { return }
        openURL(app) { accepted in
            if !accepted { openURL(web) }
        }
    }
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if includesProfile {
                    NavigationLink {
                        FriendProfile(friend: friend)
                    } label: {
                        HStack(spacing: 8) {
                            SourceHeader(friend: friend)
                            RowChevron()
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityElement(children: .combine)
                    .accessibilityHint("Opens \(friend.firstName)’s profile")
                    .accessibilityIdentifier("sourceProfile")
                } else {
                    SourceHeader(friend: friend)
                }
                Bubble(text: message.text, meta: "\(friend.firstName) · \(message.date)", service: message.service)
                    .accessibilityIdentifier("sourceBubble")
                Button {
                    openService()
                } label: {
                    Label(message.service == "iMessage" ? "Open in Messages" : "Open in \(message.service)", systemImage: "arrow.up.forward.app")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .frame(minHeight: 48)
                        .background(Theme.accent, in: Capsule())
                }
                .buttonStyle(PressableStyle())
                .accessibilityIdentifier("openService")
            }
            .padding(24)
            .gridPaper()
        }
        .paperScroll()
        .paperNavigationBar()
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }
            }
        }
    }
}
