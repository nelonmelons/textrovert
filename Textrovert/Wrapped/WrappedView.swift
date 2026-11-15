#if os(iOS)
import SwiftUI

// MARK: - Model

@MainActor
final class WrappedModel: ObservableObject {
    enum Phase: Equatable {
        case loading
        case edition(WrappedEdition)
        case exhausted(seen: Int, wider: WrappedDateRange?)
        case empty(WrappedEmptyReason, wider: WrappedDateRange?)
    }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var editions: [WrappedEdition] = []
    @Published private(set) var range: WrappedDateRange

    let conversation: WrappedConversation
    let ownerID: String
    private let store: WrappedEditionStore
    private let locale: Locale
    private let now: () -> Date
    private let modelSource: WrappedModelSource?
    private let modelOptions: WrappedModelOptions
    private let modelTimeout: TimeInterval
    private(set) var modelSuggestions: [WrappedModelSuggestion] = []
    private var generation = 0

    init(
        conversation: WrappedConversation, ownerID: String, range: WrappedDateRange, store: WrappedEditionStore, locale: Locale,
        modelSource: WrappedModelSource? = nil, modelOptions: WrappedModelOptions = WrappedModelOptions(), modelTimeout: TimeInterval = 2.5,
        now: @escaping () -> Date = Date.init
    ) {
        self.conversation = conversation
        self.ownerID = ownerID
        self.range = range
        self.store = store
        self.locale = locale
        self.modelSource = modelSource
        self.modelOptions = modelOptions
        self.modelTimeout = modelTimeout
        self.now = now
    }

    var usesModel: Bool { modelSource != nil }

    private var key: String { WrappedEditionStore.key(ownerID: ownerID, conversationID: conversation.id, range: range) }

    func open() {
        guard phase == .loading || phase.isTerminalForReopen else { return }
        let session = store.session(for: key)
        let checked = session.editions.map { WrappedEngine.revalidate($0, in: conversation) }.filter { !$0.highlights.isEmpty }
        if checked != session.editions {
            store.update(key) { $0.editions = checked; $0.currentIndex = min($0.currentIndex, max(checked.count - 1, 0)) }
        }
        editions = checked
        if let current = checked[wrappedSafe: store.session(for: key).currentIndex] {
            phase = .edition(current)
        } else {
            generate()
        }
    }

    /// Without a model source this is synchronous and deterministic. With one, the model gets `modelTimeout` seconds;
    /// if it is late the rules-only edition shows, and its suggestions arrive in time for "Another edition".
    func generate() {
        generation += 1
        let token = generation
        let seen = store.session(for: key).seenSourceIDs
        guard let source = modelSource,
              let prompt = WrappedModelPrompt.make(conversation: conversation, ownerID: ownerID, range: range, avoiding: seen, options: modelOptions) else {
            finishGeneration()
            return
        }
        phase = .loading
        let request = Task { try? await source.suggestions(for: prompt) }
        let timeout = modelTimeout
        Task { [weak self] in
            let onTime: [WrappedModelSuggestion]?? = await withTaskGroup(of: [WrappedModelSuggestion]??.self) { group in
                group.addTask { .some(await request.value) }
                group.addTask {
                    try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                    return .none
                }
                let first = await group.next() ?? .none
                group.cancelAll()
                return first
            }
            guard let self else { return }
            if case .some(let value) = onTime {
                self.modelSuggestions += value ?? []
            } else {
                Task { [weak self] in
                    if let late = await request.value { self?.modelSuggestions += late }
                }
            }
            guard token == self.generation else { return }
            self.finishGeneration()
        }
    }

    private func finishGeneration() {
        let session = store.session(for: key)
        let provider = WrappedCombinedProvider(providers: [
            WrappedHeuristicProvider(),
            WrappedSuggestionProvider(suggestions: modelSuggestions, options: modelOptions)
        ])
        let outcome = WrappedEngine.generate(
            conversation: conversation, ownerID: ownerID, range: range, avoiding: session.seenSourceIDs,
            number: session.editions.count + 1, now: now(), locale: locale, provider: provider)
        switch outcome {
        case .edition(let edition):
            store.update(key) { $0.editions.append(edition); $0.currentIndex = $0.editions.count - 1 }
            editions = store.session(for: key).editions
            phase = .edition(edition)
        case .exhausted(let seen, let wider):
            phase = .exhausted(seen: seen, wider: wider)
        case .empty(let reason, let wider):
            phase = .empty(reason, wider: wider)
        }
    }

    func select(_ index: Int) {
        guard let edition = editions[wrappedSafe: index] else { return }
        store.update(key) { $0.currentIndex = index }
        phase = .edition(edition)
    }

    func widen(to newRange: WrappedDateRange) {
        let carried = store.session(for: key).seenSourceIDs
        range = newRange
        modelSuggestions = []
        store.update(key) { if $0.editions.isEmpty { $0.carriedSeen = Array(Set($0.carriedSeen).union(carried)) } }
        editions = []
        phase = .loading
        open()
    }
}

private extension WrappedModel.Phase {
    var isTerminalForReopen: Bool {
        switch self {
        case .loading: return true
        default: return false
        }
    }
}

extension Array {
    subscript(wrappedSafe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}

// MARK: - Component

/// Conversation-specific Wrapped. Give it one conversation, the owner, and the visible date range.
/// Editions are generated from that conversation only, cached per owner, conversation and range, and re-verified on reopen.
struct WrappedView: View {
    let onClose: () -> Void
    var onShare: ((String) -> Void)?
    var onRangeChange: ((WrappedDateRange) -> Void)?
    var onAddMemory: (() -> Void)?
    private let locale: Locale

    @StateObject private var model: WrappedModel
    @State private var page = 0
    @State private var slideStates: [String: WrappedSlideState] = [:]
    @State private var sourceHighlight: WrappedHighlight?
    @State private var showShare = false
    @AccessibilityFocusState private var focus: Int?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(
        conversation: WrappedConversation, ownerID: String, range: WrappedDateRange,
        store: WrappedEditionStore = .shared, locale: Locale = .current,
        modelSource: WrappedModelSource? = nil, modelOptions: WrappedModelOptions = WrappedModelOptions(),
        onClose: @escaping () -> Void, onShare: ((String) -> Void)? = nil,
        onRangeChange: ((WrappedDateRange) -> Void)? = nil, onAddMemory: (() -> Void)? = nil
    ) {
        _model = StateObject(wrappedValue: WrappedModel(
            conversation: conversation, ownerID: ownerID, range: range, store: store, locale: locale,
            modelSource: modelSource, modelOptions: modelOptions))
        self.onClose = onClose
        self.onShare = onShare
        self.onRangeChange = onRangeChange
        self.onAddMemory = onAddMemory
        self.locale = locale
    }

    private enum Slide {
        case opener(WrappedEdition)
        case highlight(WrappedHighlight)
        case finale(WrappedEdition)
        case message(String, String, [(title: String, id: String, primary: Bool, run: () -> Void)])
    }

    private var owner: WrappedParticipant { model.conversation.participant(id: model.ownerID) ?? WrappedParticipant(id: model.ownerID, name: "You") }
    private var friend: WrappedParticipant { model.conversation.participants.first { $0.id != model.ownerID } ?? WrappedParticipant(id: "friend", name: "Friend") }
    private var storyContext: WrappedStoryContext {
        WrappedStoryContext(owner: owner, friend: friend, service: model.conversation.service, range: model.range, locale: locale, world: .forConversation(model.conversation.id))
    }

    private var phaseKey: String {
        switch model.phase {
        case .loading: return "loading"
        case .edition(let e): return e.id
        case .exhausted(let seen, _): return "exhausted-\(seen)-\(model.range.cacheKey)"
        case .empty(_, _): return "empty-\(model.range.cacheKey)"
        }
    }

    private var slides: [Slide] {
        let rangeLabel = model.range.label(locale: locale)
        switch model.phase {
        case .loading:
            guard model.usesModel else { return [] }
            return [.message("I’m reading your messages with \(friend.firstName)…", "Everything stays on your phone.", [])]
        case .edition(let e):
            return [.opener(e)] + e.highlights.map(Slide.highlight) + [.finale(e)]
        case .exhausted(let seen, let wider):
            var actions: [(title: String, id: String, primary: Bool, run: () -> Void)] = []
            if let wider { actions.append(("Try \(wider.label(locale: locale))", "wrappedWiden", true, { widen(to: wider) })) }
            if !model.editions.isEmpty { actions.append(("Back to your last edition", "wrappedBackToEdition", wider == nil, { page = 0; model.select(model.editions.count - 1) })) }
            let tail = wider == nil ? "That’s every message in this chat." : "I might find more in a wider range."
            return [.message("I’ve shown you everything in this range", "I’ve already used all \(seen) messages behind your earlier editions. \(tail)", actions)]
        case .empty(let reason, let wider):
            var actions: [(title: String, id: String, primary: Bool, run: () -> Void)] = []
            if let wider { actions.append(("Try \(wider.label(locale: locale))", "wrappedWiden", true, { widen(to: wider) })) }
            if let onAddMemory { actions.append(("Add a memory", "wrappedAddMemory", wider == nil, onAddMemory)) }
            switch reason {
            case .unsupportedConversation:
                return [.message("Wrapped is for one-on-one chats", "I can’t reliably tell who said what in a group chat, so I leave them out.", [])]
            case .noMessagesInRange(let outside):
                let note = outside > 0 ? "\(outside) message\(outside == 1 ? " sits" : "s sit") outside this range." : "There are no messages yet."
                return [.message("Your first memory will go here", "I couldn’t find any dated messages with \(friend.firstName) in \(rangeLabel). \(note)", actions)]
            case .noHighlights(let n):
                return [.message("Your first memory will go here", "I read \(n == 1 ? "1 message" : "\(n) messages") from \(rangeLabel), but nothing stood out enough for me to quote without guessing.", actions)]
            }
        }
    }

    var body: some View {
        let ctx = storyContext
        let all = slides
        ZStack {
            ctx.world.deep.ignoresSafeArea()
            pager(all, ctx)
            VStack(spacing: 0) {
                topBar(count: all.count)
                Spacer()
                bottomBar(all)
                    .background(alignment: .bottom) {
                        LinearGradient(colors: [.clear, Color.black.opacity(0.55)], startPoint: .top, endPoint: .bottom)
                            .frame(height: 150)
                            .ignoresSafeArea(edges: .bottom)
                            .allowsHitTesting(false)
                    }
            }
        }
        .preferredColorScheme(.dark)
        .onAppear { model.open() }
        .onChange(of: model.phase) { _, _ in page = 0 }
        .onChange(of: model.range) { _, new in onRangeChange?(new) }
        .onChange(of: page) { _, new in
            Task {
                try? await Task.sleep(nanoseconds: 400_000_000)
                focus = new
            }
        }
        .sheet(item: $sourceHighlight) { h in WrappedSourceSheet(highlight: h, context: ctx) }
        .sheet(isPresented: $showShare) {
            if case .edition(let e) = model.phase {
                WrappedSharePreview(edition: e, owner: owner, friend: friend, locale: locale, onShare: onShare)
            }
        }
    }

    // MARK: Pager

    @ViewBuilder private func pager(_ all: [Slide], _ ctx: WrappedStoryContext) -> some View {
        if reduceMotion {
            if all.indices.contains(page) {
                slideView(all[page], index: page, ctx: ctx)
                    .id(page)
                    .transition(.opacity)
                    .gesture(DragGesture(minimumDistance: 30).onEnded { value in
                        if value.translation.width < -40 { go(1, count: all.count) } else if value.translation.width > 40 { go(-1, count: all.count) }
                    })
            }
        } else {
            TabView(selection: $page) {
                ForEach(Array(all.enumerated()), id: \.offset) { i, slide in
                    slideView(slide, index: i, ctx: ctx)
                        .accessibilityHidden(i != page)
                        .tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .id(phaseKey)
            .ignoresSafeArea()
        }
    }

    @ViewBuilder private func slideView(_ slide: Slide, index: Int, ctx: WrappedStoryContext) -> some View {
        let env = WrappedSlideEnv(index: index, active: index == page, focus: $focus)
        switch slide {
        case .opener(let e):
            WrappedOpenerScene(context: ctx, messageCount: e.analyzedMessageCount, editionNumber: e.number, isShortRecap: e.isShortRecap, env: env)
        case .finale(let e):
            WrappedFinaleScene(
                edition: e, context: ctx, env: env, canWiden: WrappedEngine.widerRange(for: model.conversation, current: model.range),
                editionCount: model.editions.count,
                onAnother: { page = 0; model.generate() }, onShare: { showShare = true },
                onSelectEdition: { page = 0; model.select($0) }, onWiden: { widen(to: $0) })
        case .message(let title, let text, let actions):
            WrappedMessageScene(title: title, message: text, context: ctx, env: env, actions: actions)
        case .highlight(let h):
            highlightScene(h, ctx: ctx, env: env)
        }
    }

    @ViewBuilder private func highlightScene(_ h: WrappedHighlight, ctx: WrappedStoryContext, env: WrappedSlideEnv) -> some View {
        let state = slideStates[h.id] ?? WrappedSlideState()
        switch h.signal {
        case .quotableLine:
            WrappedGuessScene(highlight: h, context: ctx, env: env, state: state) { id in
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) { slideStates[h.id, default: WrappedSlideState()].guess = id }
            }
        case .runningJoke:
            WrappedJokeScene(highlight: h, context: ctx, env: env, state: state) { reveal(h) }
        case .datedInvitation:
            WrappedTicketScene(highlight: h, context: ctx, env: env, state: state) { reveal(h) }
        case .lastLineTwist:
            WrappedTwistScene(highlight: h, context: ctx, env: env, state: state) { reveal(h) }
        case .topicChange:
            WrappedPivotScene(highlight: h, context: ctx, env: env, state: state) { reveal(h) }
        case .replyGaps:
            WrappedGhostScene(highlight: h, context: ctx, env: env, state: state) { reveal(h) }
        case .busiestDay:
            WrappedBusiestScene(highlight: h, context: ctx, env: env, state: state) { reveal(h) }
        case .warmMoment:
            WrappedWarmScene(highlight: h, context: ctx, env: env, state: state) { reveal(h) }
        }
    }

    // MARK: Actions

    private func reveal(_ h: WrappedHighlight) {
        let total = max(h.quotes(.punchline).count, 1)
        if reduceMotion {
            slideStates[h.id, default: WrappedSlideState()].revealed = total
            return
        }
        Task {
            for step in 1...total {
                withAnimation(.easeOut(duration: 0.24)) { slideStates[h.id, default: WrappedSlideState()].revealed = step }
                if step < total { try? await Task.sleep(nanoseconds: 120_000_000) }
            }
        }
    }

    private func widen(to range: WrappedDateRange) {
        page = 0
        slideStates = [:]
        model.widen(to: range)
    }

    private func go(_ delta: Int, count: Int) {
        let target = min(max(page + delta, 0), max(count - 1, 0))
        guard target != page else { return }
        withAnimation(.easeInOut(duration: reduceMotion ? 0.1 : 0.22)) { page = target }
    }

    // MARK: Chrome

    private func topBar(count: Int) -> some View {
        HStack(alignment: .center, spacing: 12) {
            HStack(spacing: 4) {
                ForEach(0..<max(count, 1), id: \.self) { i in
                    Capsule()
                        .fill(Color.black.opacity(0.4))
                        .overlay(alignment: .leading) {
                            GeometryReader { geo in
                                Capsule().fill(Color.white).frame(width: i <= page ? geo.size.width : 0)
                                    .animation(reduceMotion ? nil : .easeOut(duration: 0.3), value: page)
                            }
                        }
                        .frame(height: 4)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Slide \(page + 1) of \(max(count, 1))")
            .accessibilityIdentifier("wrappedProgress")
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(.body, design: .rounded).weight(.heavy))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Color.black.opacity(0.45), in: Circle())
            }
            .accessibilityLabel("Close Wrapped")
            .accessibilityIdentifier("wrappedClose")
        }
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private func sourceTarget(_ all: [Slide]) -> WrappedHighlight? {
        guard all.indices.contains(page), case .highlight(let h) = all[page] else { return nil }
        let state = slideStates[h.id] ?? WrappedSlideState()
        let done = h.signal == .quotableLine ? state.guess != nil : state.revealed > 0
        return done ? h : nil
    }

    private func bottomBar(_ all: [Slide]) -> some View {
        HStack {
            navButton("chevron.left", label: "Back", id: "wrappedBack", enabled: page > 0) { go(-1, count: all.count) }
            Spacer()
            if let h = sourceTarget(all) {
                Button { sourceHighlight = h } label: {
                    Label("Sources", systemImage: "text.quote")
                        .font(.system(.subheadline, design: .rounded).weight(.heavy))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16)
                        .frame(height: 44)
                        .background(Color.black.opacity(0.55), in: Capsule())
                }
                .accessibilityIdentifier("wrappedSources")
            }
            Spacer()
            navButton("chevron.right", label: "Next", id: "wrappedNext", enabled: page < all.count - 1) { go(1, count: all.count) }
        }
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    private func navButton(_ symbol: String, label: String, id: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(.title3, design: .rounded).weight(.heavy))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(Color.black.opacity(0.55), in: Circle())
                .opacity(enabled ? 1 : 0.35)
        }
        .disabled(!enabled)
        .accessibilityLabel(label)
        .accessibilityIdentifier(id)
    }
}

// MARK: - Sources

struct WrappedSourceSheet: View {
    let highlight: WrappedHighlight
    let context: WrappedStoryContext
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Messages shown") {
                    ForEach(highlight.quotes.map(\.quote).sorted { $0.sentAt < $1.sentAt }) { q in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("“\(q.text)”").font(.body)
                            Text("\(q.speakerName) · \(context.stamp(q.sentAt)) · \(q.service)").font(.caption).foregroundStyle(.secondary)
                            Text("Message \(q.messageID)").font(.caption2.monospaced()).foregroundStyle(.secondary)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                Section("Why this moment") {
                    if highlight.isModelSuggestion {
                        Label("I found this with the on-device model, then checked every quote above against the original message.", systemImage: "cpu")
                            .font(.footnote)
                            .accessibilityIdentifier("wrappedModelNote")
                    }
                    Text(highlight.why)
                    Text("I counted \(highlight.sourceMessageIDs.count) source message\(highlight.sourceMessageIDs.count == 1 ? "" : "s").").font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Sources")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .accessibilityIdentifier("wrappedSourceSheet")
    }
}

// MARK: - Share preview (nothing is sent from here; the host decides what happens to the text)

struct WrappedSharePreview: View {
    let edition: WrappedEdition
    let owner: WrappedParticipant
    let friend: WrappedParticipant
    let locale: Locale
    var onShare: ((String) -> Void)?
    @State private var selected: Set<String>
    @Environment(\.dismiss) private var dismiss

    init(edition: WrappedEdition, owner: WrappedParticipant, friend: WrappedParticipant, locale: Locale, onShare: ((String) -> Void)?) {
        self.edition = edition
        self.owner = owner
        self.friend = friend
        self.locale = locale
        self.onShare = onShare
        _selected = State(initialValue: Set(edition.highlights.filter(\.shareByDefault).map(\.id)))
    }

    private var text: String { WrappedShareText.build(edition: edition, selected: selected, owner: owner, friend: friend, locale: locale) }

    var body: some View {
        NavigationStack {
            List {
                Section("Choose cards") {
                    ForEach(edition.highlights) { h in
                        Toggle(isOn: Binding(get: { selected.contains(h.id) }, set: { on in if on { selected.insert(h.id) } else { selected.remove(h.id) } })) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(h.headline)
                                if !h.shareByDefault { Text("Private by default").font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                        .accessibilityIdentifier("wrappedShareToggle-\(h.signal.rawValue)")
                    }
                }
                Section("Exactly what would be shared") {
                    Text(text)
                        .font(.callout)
                        .textSelection(.enabled)
                        .accessibilityIdentifier("wrappedSharePreviewText")
                    Text("Nothing leaves your phone until you choose Share.").font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Preview")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                if let onShare {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Share…") { onShare(text); dismiss() }.disabled(selected.isEmpty)
                    }
                }
            }
        }
    }
}
#endif
