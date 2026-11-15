import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

// Model layer for Wrapped. A model may only point at message IDs; every quote it leads to is re-read
// from the source message and passes the same verification, privacy filter and selection as rule-based highlights.

/// Settings that Emma has not decided yet. Defaults: funny moments only, affectionate teasing off.
struct WrappedModelOptions: Codable, Hashable {
    var includeWarmMoments = false
    var allowAffectionateTeasing = false

    static let includeWarmKey = "textrovert.wrapped.includeWarmMoments"
    static let allowTeasingKey = "textrovert.wrapped.allowAffectionateTeasing"

    static func stored(in defaults: UserDefaults = .standard) -> WrappedModelOptions {
        WrappedModelOptions(
            includeWarmMoments: defaults.bool(forKey: includeWarmKey),
            allowAffectionateTeasing: defaults.bool(forKey: allowTeasingKey))
    }
}

enum WrappedModelKind: String, CaseIterable {
    case callback, quotable, twist, swerve, plan, warm
}

/// What a model returns: references and short framing only, never quote text.
struct WrappedModelSuggestion: Codable, Hashable {
    let kind: String
    let messageIDs: [String]
    let headline: String
    let why: String
    let sensitive: Bool
}

struct WrappedModelPrompt: Hashable {
    let instructions: String
    let chunks: [String]
    let messageIDs: Set<String>

    /// Only attributable, dated, in-range messages not used by an earlier edition. Messages the privacy filter flags are
    /// never sent, except affectionate teasing when that setting is on.
    static func make(
        conversation: WrappedConversation, ownerID: String, range: WrappedDateRange, avoiding seen: Set<String>,
        options: WrappedModelOptions, locale: Locale = Locale(identifier: "en_US"), chunkCharacters: Int = 4000, maxChunks: Int = 3
    ) -> WrappedModelPrompt? {
        guard let ctx = WrappedAnalysisContext(conversation: conversation, ownerID: ownerID, range: range, locale: locale) else { return nil }
        let entries = ctx.entries.filter { e in
            e.attributable && e.inRange && e.date != nil && !seen.contains(e.message.id)
                && (e.sensitivity == nil || (options.allowAffectionateTeasing && e.sensitivity == .roastOfOther))
        }
        guard !entries.isEmpty else { return nil }
        var chunks: [String] = []
        var current = ""
        for e in entries {
            let speaker = e.senderID == ctx.owner.id ? "You" : ctx.friend.firstName
            let line = "\(e.message.id) | \(speaker) | \(WrappedFormat.string(e.date!, template: "MMMdjmm", timeZone: range.timeZone, locale: locale)) | \(e.message.text.replacingOccurrences(of: "\n", with: " "))\n"
            if !current.isEmpty, current.count + line.count > chunkCharacters {
                chunks.append(current)
                current = ""
                if chunks.count == maxChunks { break }
            }
            current += line
        }
        if !current.isEmpty, chunks.count < maxChunks { chunks.append(current) }
        let kinds = WrappedModelKind.allCases.filter { $0 != .warm || options.includeWarmMoments }.map(\.rawValue).joined(separator: ", ")
        let instructions = """
        You help make a playful recap of a text conversation between "You" and \(ctx.friend.firstName). \
        Each line is: message id | speaker | time | text. Find up to 4 standout moments. \
        Allowed kinds: \(kinds). callback: the same joke or object returning on different days, possibly in different words (2–4 ids). \
        quotable: a short memorable line and the other person's direct reply (2 ids). \
        twist: a line, a reply, and a last line that changes the meaning of the first (3 ids). \
        swerve: an abrupt change of subject (2 ids: before and after). \
        plan: an invitation with a day or time and its answer (2 ids)\(options.includeWarmMoments ? ". warm: a kind or sentimental exchange (2 ids)" : ""). \
        Use only ids that appear in the lines, in time order. Never copy or rewrite message text. \
        The headline is at most 6 words. The why is one short sentence about what makes it distinctive. \
        Set sensitive to true for anything about conflict, hurt feelings, health, money, or private details, or anything that mocks someone.
        """
        return WrappedModelPrompt(instructions: instructions, chunks: chunks, messageIDs: Set(entries.map(\.message.id)))
    }
}

protocol WrappedModelSource: Sendable {
    func suggestions(for prompt: WrappedModelPrompt) async throws -> [WrappedModelSuggestion]
}

/// Fixed suggestions, for tests and the deterministic demo route.
struct WrappedStubModelSource: WrappedModelSource {
    let fixed: [WrappedModelSuggestion]
    var delay: TimeInterval = 0

    func suggestions(for prompt: WrappedModelPrompt) async throws -> [WrappedModelSuggestion] {
        if delay > 0 { try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000)) }
        return fixed
    }
}

/// Turns model suggestions into candidates. Anything that fails a check is dropped, never repaired.
struct WrappedSuggestionProvider: WrappedCandidateProviding {
    let suggestions: [WrappedModelSuggestion]
    let options: WrappedModelOptions

    private static let blockedHeadlineWords: Set<String> = ["fuck", "shit", "bitch", "ass", "damn", "crap", "dick", "slut", "whore"]

    func candidates(in ctx: WrappedAnalysisContext) -> [WrappedCandidate] {
        let byID = Dictionary(ctx.entries.map { ($0.message.id, $0) }, uniquingKeysWith: { a, _ in a })
        var seenSets = Set<[String]>()
        return suggestions.compactMap { s -> WrappedCandidate? in
            guard !s.sensitive, let kind = WrappedModelKind(rawValue: s.kind.lowercased()),
                  kind != .warm || options.includeWarmMoments,
                  seenSets.insert(s.messageIDs).inserted else { return nil }
            let entries = s.messageIDs.compactMap { byID[$0] }
            guard entries.count == s.messageIDs.count, Set(s.messageIDs).count == s.messageIDs.count,
                  entries.allSatisfy({ eligible($0) }),
                  zip(entries, entries.dropFirst()).allSatisfy({ $0.date! <= $1.date! }) else { return nil }
            let headline = s.headline.trimmingCharacters(in: .whitespacesAndNewlines)
            let why = s.why.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !headline.isEmpty, headline.count <= 48, WrappedText.wordCount(headline) <= 6,
                  Set(WrappedText.tokens(headline)).isDisjoint(with: Self.blockedHeadlineWords),
                  WrappedText.sensitivity(of: headline, fromOwner: false, friendFirstName: ctx.friend.firstName) == nil,
                  why.count <= 200 else { return nil }
            return candidate(kind, entries, headline: headline, why: "", ctx: ctx)
        }
    }

    private func eligible(_ e: WrappedAnalysisContext.Entry) -> Bool {
        guard e.attributable, e.inRange, e.date != nil else { return false }
        guard let flag = e.sensitivity else { return true }
        return options.allowAffectionateTeasing && flag == .roastOfOther
    }

    private func candidate(_ kind: WrappedModelKind, _ e: [WrappedAnalysisContext.Entry], headline: String, why: String, ctx: WrappedAnalysisContext) -> WrappedCandidate? {
        let first = e.first!, last = e.last!
        let span = last.date!.timeIntervalSince(first.date!)
        let ids = e.map(\.message.id)
        func make(_ signal: WrappedSignal, _ p: WrappedPresentation, _ claims: [WrappedClaim], prompt: String = "", quantity: WrappedQuantity? = nil, figure: WrappedFigure, score: Double) -> WrappedCandidate {
            WrappedCandidate(signal: signal, presentation: p, headline: headline, prompt: prompt, why: why, claims: claims, evidenceIDs: ids,
                             quantity: quantity, figure: figure, score: score, shareByDefault: true, suggestedByModel: true)
        }
        switch kind {
        case .callback:
            let days = Set(e.map { ctx.dayNumber($0.date!) })
            guard (2...4).contains(e.count), days.count >= 2 else { return nil }
            let dayCount = ctx.dayNumber(last.date!) - ctx.dayNumber(first.date!) + 1
            return make(.runningJoke, .exchange, [ctx.claim(.setup, first), ctx.claim(.punchline, last)],
                        quantity: WrappedQuantity(value: "\(e.count)", label: "times", detail: "over \(dayCount) days"),
                        figure: .occurrences(e.map { $0.date! }), score: 3.0 + Double(e.count) * 0.1)
        case .quotable:
            guard e.count == 2, first.senderID != last.senderID, span <= 86400 else { return nil }
            return make(.quotableLine, .guess, [ctx.claim(.setup, first), ctx.claim(.reveal, last)],
                        prompt: "\(ctx.owner.firstName) or \(ctx.friend.firstName)?", figure: .answeredIn(span), score: 3.1)
        case .twist:
            guard e.count == 3, first.senderID != e[1].senderID, span <= 6 * 3600 else { return nil }
            return make(.lastLineTwist, .exchange, [ctx.claim(.setup, first), ctx.claim(.punchline, e[1]), ctx.claim(.punchline, last)],
                        figure: .answeredIn(span), score: 3.0)
        case .swerve:
            guard e.count == 2, span <= 6 * 3600 else { return nil }
            return make(.topicChange, .exchange, [ctx.claim(.setup, first), ctx.claim(.punchline, last)], figure: .answeredIn(span), score: 3.0)
        case .plan:
            guard e.count == 2, first.senderID != last.senderID, span <= 86400 else { return nil }
            return make(.datedInvitation, .exchange, [ctx.claim(.setup, first), ctx.claim(.punchline, last)], figure: .answeredIn(span), score: 3.0)
        case .warm:
            guard e.count == 2, first.senderID != last.senderID, span <= 86400 else { return nil }
            return make(.warmMoment, .exchange, [ctx.claim(.setup, first), ctx.claim(.punchline, last)], figure: .answeredIn(span), score: 3.0)
        }
    }
}

struct WrappedCombinedProvider: WrappedCandidateProviding {
    let providers: [WrappedCandidateProviding]
    func candidates(in context: WrappedAnalysisContext) -> [WrappedCandidate] { providers.flatMap { $0.candidates(in: context) } }
}

// MARK: - Apple on-device model

#if canImport(FoundationModels)
@available(iOS 26.0, macOS 26.0, *)
@Generable(description: "A standout moment in a text conversation, referenced by message ids")
struct WrappedGeneratedMoment {
    @Guide(description: "One of: callback, quotable, twist, swerve, plan, warm")
    var kind: String
    @Guide(description: "Message ids copied exactly from the lines, in time order")
    var messageIDs: [String]
    @Guide(description: "At most 6 words")
    var headline: String
    @Guide(description: "One short sentence on why this moment is distinctive")
    var why: String
    @Guide(description: "True for conflict, hurt feelings, health, money, private details, or mocking someone")
    var sensitive: Bool
}

@available(iOS 26.0, macOS 26.0, *)
@Generable(description: "Standout moments")
struct WrappedGeneratedMoments {
    @Guide(description: "Up to 4 moments", .maximumCount(4))
    var moments: [WrappedGeneratedMoment]
}

@available(iOS 26.0, macOS 26.0, *)
struct WrappedOnDeviceModelSource: WrappedModelSource {
    func suggestions(for prompt: WrappedModelPrompt) async throws -> [WrappedModelSuggestion] {
        var result: [WrappedModelSuggestion] = []
        for chunk in prompt.chunks {
            let session = LanguageModelSession(instructions: prompt.instructions)
            let response = try await session.respond(to: chunk, generating: WrappedGeneratedMoments.self)
            result += response.content.moments.map {
                WrappedModelSuggestion(kind: $0.kind, messageIDs: $0.messageIDs, headline: $0.headline, why: $0.why, sensitive: $0.sensitive)
            }
        }
        return result
    }
}
#endif

enum WrappedOnDeviceModel {
    /// The on-device model when this OS and device support it and it is ready; otherwise nil, and Wrapped uses rules only.
    static func availableSource() -> WrappedModelSource? {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, macOS 26.0, *), case .available = SystemLanguageModel.default.availability {
            return WrappedOnDeviceModelSource()
        }
        #endif
        return nil
    }
}

#if os(iOS)
import SwiftUI

/// Drop-in Settings section for the two open product choices, stored under WrappedModelOptions keys.
struct WrappedModelSettingsSection: View {
    @AppStorage(WrappedModelOptions.includeWarmKey) private var includeWarm = false
    @AppStorage(WrappedModelOptions.allowTeasingKey) private var allowTeasing = false

    var body: some View {
        Section {
            Toggle("Include warm moments", isOn: $includeWarm)
            Toggle("Allow affectionate teasing", isOn: $allowTeasing)
        } header: {
            Text("Wrapped")
        } footer: {
            Text("I pick funny moments by default, and I always leave out conflict and private topics.")
        }
    }
}
#endif
