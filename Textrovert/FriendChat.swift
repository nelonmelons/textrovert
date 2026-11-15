import PhotosUI
import SwiftUI
import UIKit

struct ChatTurn: Identifiable {
    enum Kind { case text, analysis, clarify, noAnswer, photo }
    let id = UUID()
    let fromMe: Bool
    let text: String
    var detail: String? = nil
    var image: UIImage? = nil
    var kind: Kind = .text
    var about: String? = nil
}

struct FriendChat: View {
    let friend: Friend?
    let initialQuestion: String?
    @StateObject private var picker = ImageAttachmentPickerModel()
    @State private var turns: [ChatTurn] = []
    @State private var draft = ""
    @State private var useHistory = true
    @State private var pending: (question: String, image: UIImage, subject: Friend)?
    @State private var showAnalysis = false
    @State private var started = false
    @FocusState private var focused: Bool

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(turns) { turn in
                        turnView(turn).id(turn.id)
                    }
                }
                .padding(20)
                .gridPaper()
            }
            .paperScroll()
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: turns.count) {
                withAnimation { proxy.scrollTo(turns.last?.id, anchor: .bottom) }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { composer }
        .paperNavigationBar()
        .navigationTitle(friend.map { "Ask about \($0.firstName)" } ?? "Ask me")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .navigationDestination(isPresented: $showAnalysis) { ConversationAnalysis() }
        .onAppear {
            guard !started else { return }
            started = true
            turns.append(ChatTurn(fromMe: false, text: friend.map { "Hi! Ask me anything about your chats with \($0.firstName), or add a photo." } ?? "Hi! Ask me anything about your friends, plans or chats, or add a photo."))
            if let initialQuestion { send(initialQuestion, image: nil) }
        }
    }

    @ViewBuilder private func turnView(_ turn: ChatTurn) -> some View {
        if turn.fromMe {
            VStack(alignment: .trailing, spacing: 6) {
                if let image = turn.image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 140, height: 140)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .accessibilityLabel("Your photo")
                }
                if !turn.text.isEmpty {
                    Text(turn.text)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Theme.accent, in: UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 18, bottomTrailingRadius: 4, topTrailingRadius: 18))
                }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.leading, 48)
        } else {
            HStack(alignment: .top, spacing: 10) {
                HedgehogAvatar()
                VStack(alignment: .leading, spacing: 8) {
                    Text(turn.text)
                    if let detail = turn.detail {
                        Text(detail).font(.subheadline).foregroundStyle(.secondary)
                    }
                    switch turn.kind {
                    case .analysis:
                        Button {
                            showAnalysis = true
                        } label: {
                            Label("See why I think that", systemImage: "text.bubble")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.accent)
                        }
                        .accessibilityIdentifier("openAnalysis")
                    case .clarify:
                        HStack(spacing: 8) {
                            Button("Just the photo") { answerPending(includeHistory: false) }
                                .accessibilityIdentifier("clarifyPhoto")
                            Button("Photo + chats with \(turn.about ?? "them")") { answerPending(includeHistory: true) }
                                .accessibilityIdentifier("clarifyBoth")
                        }
                        .buttonStyle(.bordered)
                        .font(.subheadline.weight(.semibold))
                        .disabled(pending == nil)
                    default:
                        EmptyView()
                    }
                }
                .padding(14)
                .background(Theme.panel, in: UnevenRoundedRectangle(topLeadingRadius: 4, bottomLeadingRadius: 18, bottomTrailingRadius: 18, topTrailingRadius: 18))
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier(turn.kind == .noAnswer ? "askNoAnswer" : "hedgehogTurn")
                Spacer(minLength: 24)
            }
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Button {
                    useHistory.toggle()
                } label: {
                    Label(friend.map { "\($0.firstName)’s chat history" } ?? "All your chats", systemImage: useHistory ? "checkmark.circle.fill" : "circle")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .foregroundStyle(useHistory ? Theme.accentTone.ink : Color.secondary)
                        .background(useHistory ? Theme.accentTone.fill : Color(uiColor: .tertiarySystemFill), in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("historyChip")
                if picker.isLoading {
                    ProgressView().controlSize(.small)
                }
                if let attachment = picker.attachment {
                    HStack(spacing: 6) {
                        Image(uiImage: attachment.image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 28, height: 28)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                        Text("1 photo").font(.caption.weight(.semibold))
                        Button {
                            picker.removeAttachment()
                        } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                        }
                        .accessibilityLabel("Remove photo")
                        .accessibilityIdentifier("removePhoto")
                    }
                    .padding(.leading, 4)
                    .padding(.trailing, 8)
                    .padding(.vertical, 4)
                    .background(Theme.plansTone.fill, in: Capsule())
                }
                Spacer(minLength: 0)
            }
            if let error = picker.errorMessage {
                Text(error).font(.caption).foregroundStyle(Theme.deadline)
            }
            HStack(spacing: 8) {
                PhotosPicker(selection: $picker.selection, matching: .images) {
                    Image(systemName: "photo.badge.plus")
                        .font(.title3)
                        .foregroundStyle(Theme.accent)
                        .frame(width: 40, height: 40)
                }
                .accessibilityLabel("Add a photo")
                .accessibilityIdentifier("addPhoto")
                TextField(friend.map { "Ask about \($0.firstName)…" } ?? "Ask me anything…", text: $draft, axis: .vertical)
                    .lineLimit(1...4)
                    .focused($focused)
                    .accessibilityIdentifier("chatField")
                Button {
                    send(draft, image: picker.attachment?.image)
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 34, height: 34)
                        .background(Theme.accent, in: Circle())
                        .opacity(canSend ? 1 : 0.4)
                }
                .disabled(!canSend)
                .accessibilityLabel("Send")
                .accessibilityIdentifier("chatSend")
            }
            .padding(.leading, 6)
            .padding(.trailing, 4)
            .padding(.vertical, 4)
            .background(Color(uiColor: .systemBackground), in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.accent, lineWidth: focused ? 2 : 1))
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 6)
        .background {
            UnevenRoundedRectangle(topLeadingRadius: 24, topTrailingRadius: 24)
                .fill(Theme.panel)
                .shadow(color: .black.opacity(0.08), radius: 12, y: -3)
                .ignoresSafeArea(edges: .bottom)
        }
    }

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || picker.attachment != nil
    }

    private func send(_ raw: String, image: UIImage?) {
        let question = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty || image != nil else { return }
        turns.append(ChatTurn(fromMe: true, text: question, image: image))
        draft = ""
        picker.removeAttachment()
        if let image, useHistory, let subject = subject(of: question) {
            pending = (question, image, subject)
            turns.append(ChatTurn(fromMe: false, text: "Should I look at just your photo, or your photo and your chats with \(subject.firstName) together?", kind: .clarify, about: subject.firstName))
            return
        }
        reply(question, image: image, includeHistory: image == nil && useHistory, subject: subject(of: question))
    }

    private func answerPending(includeHistory: Bool) {
        guard let pending else { return }
        self.pending = nil
        turns.append(ChatTurn(fromMe: true, text: includeHistory ? "Photo + chats with \(pending.subject.firstName)" : "Just the photo"))
        reply(pending.question, image: pending.image, includeHistory: includeHistory, subject: pending.subject)
    }

    private func reply(_ question: String, image: UIImage?, includeHistory: Bool, subject: Friend?) {
        if image != nil {
            let name = subject?.firstName ?? "your friends"
            turns.append(ChatTurn(fromMe: false, text: "Got your photo! I can’t look at photos yet.", detail: includeHistory ? "Once photo answers are switched on, I’ll read it next to your chats with \(name). It stays on your phone for now." : "Once photo answers are switched on, I’ll read just this photo. It stays on your phone for now.", kind: .photo))
            return
        }
        let words = Self.words(question)
        let aboutMia = question.caseInsensitiveCompare(MiaConversation.question) == .orderedSame
            || (friend == nil && words.contains("mia") && !words.isDisjoint(with: ["upset", "mad", "bothered", "annoyed", "hurt"]))
        if aboutMia && (friend == nil || friend?.id == "mia") {
            turns.append(ChatTurn(fromMe: false, text: "I think the late notice is the part that bothered her.", detail: "She wrote “I wish you’d told me sooner” right after you said you could only stay an hour.", kind: .analysis))
            return
        }
        if friend == nil, let answer = Self.overallAnswer(words, subject: subject) {
            turns.append(answer)
            return
        }
        if let subject {
            turns.append(ChatTurn(fromMe: false, text: "I can’t answer questions like that about \(subject.firstName) yet.", detail: "Answers will come from your conversations once they’re connected.", kind: .noAnswer))
            return
        }
        turns.append(ChatTurn(fromMe: false, text: "I can’t answer that one yet.", detail: "Try asking who’s up for volleyball, who’s waiting on you, or what to get Mia.", kind: .noAnswer))
    }

    private static func overallAnswer(_ words: Set<String>, subject: Friend?) -> ChatTurn? {
        let about = { (ids: [String]) in subject.map { ids.contains($0.id) } ?? true }
        if !words.isDisjoint(with: ["volleyball", "vb", "sports", "play"]), about(["mia", "jules"]) {
            return ChatTurn(fromMe: false, text: "Mia and Jules! Mia told me to ask her next time you need a +1 for VB.", detail: "Jules has been playing volleyball at the park on weekends, too.")
        }
        if !words.isDisjoint(with: ["reply", "respond", "waiting", "answer", "confirm", "owe"]), about(["sarah"]) {
            return ChatTurn(fromMe: false, text: "Sarah’s waiting on you. She asked you to confirm brunch by 5 PM today.", detail: "She’ll book the table at Juniper once you say yes.")
        }
        if !words.isDisjoint(with: ["birthday", "birthdays", "gift", "present", "get"]), about(["mia"]) {
            return ChatTurn(fromMe: false, text: "Mia’s birthday is November 16! She’s been really into jasmine tea lately.", detail: "A nice jasmine tea could be a sweet gift.")
        }
        if !words.isDisjoint(with: ["plans", "plan", "week", "weekend", "busy", "schedule"]), about(["mia", "sarah"]) {
            return ChatTurn(fromMe: false, text: "You’re shopping with Mia on Thursday at 4, then brunch with Sarah on Friday at 11.", detail: "Sarah’s brunch isn’t confirmed yet.")
        }
        return nil
    }

    private func subject(of question: String) -> Friend? {
        let words = Self.words(question)
        if let friend {
            return words.contains(friend.firstName.lowercased()) || !words.isDisjoint(with: ["she", "her", "he", "him", "they", "them"]) ? friend : nil
        }
        return Friend.fixtures.first { words.contains($0.firstName.lowercased()) }
    }

    private static func words(_ text: String) -> Set<String> {
        Set(text.lowercased().split { !$0.isLetter && $0 != "+" }.map(String.init))
    }
}
