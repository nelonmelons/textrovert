import Foundation

// MARK: - Text helpers and the default-exclusion classifier

enum WrappedSensitivity: String {
    case conflict, privateTopic, roastOfOther
}

enum WrappedText {
    static let stopwords: Set<String> = [
        "the", "and", "for", "are", "but", "not", "you", "your", "you're", "youre", "with", "that", "this", "was", "were", "have", "has", "had",
        "its", "it's", "i'm", "im", "i'll", "ill", "i've", "ive", "i'd", "just", "can", "can't", "cant", "don't", "dont", "did", "didn't", "does",
        "what", "when", "where", "who", "why", "how", "all", "any", "out", "get", "got", "from", "they", "them", "then", "than", "there", "their",
        "about", "would", "could", "should", "will", "going", "gonna", "one", "yes", "yeah", "okay", "ok", "also", "too", "very", "really", "now",
        "like", "some", "into", "over", "still", "only", "even", "much", "more", "most", "been", "being", "she", "her", "him", "his", "our", "ours",
        "mine", "myself", "let's", "lets", "here", "make", "made", "need", "want", "know", "think", "said", "say", "see", "saw", "way", "back",
        "good", "time", "thing", "things", "pls", "please", "thanks", "thank", "sure", "well", "anyway", "which", "while", "again", "because"
    ]

    static func normalized(_ text: String) -> String {
        text.lowercased().replacingOccurrences(of: "’", with: "'")
    }

    static func tokens(_ text: String) -> [String] {
        normalized(text)
            .split { !($0.isLetter || $0.isNumber || $0 == "'") }
            .map { String($0).trimmingCharacters(in: CharacterSet(charactersIn: "'")) }
            .filter { !$0.isEmpty }
    }

    static func content(_ tokens: [String]) -> [String] {
        tokens.filter { $0.count >= 3 && !stopwords.contains($0) }
    }

    static func wordCount(_ text: String) -> Int { text.split(whereSeparator: \.isWhitespace).count }

    static func laughs(_ text: String) -> Bool {
        let n = normalized(text)
        let t = Set(tokens(text))
        return !t.isDisjoint(with: ["lol", "lmao", "lmfao", "haha", "hahaha", "hehe", "rofl"])
            || n.contains("😂") || n.contains("🤣") || n.contains("💀") || n.contains("i'm dead") || n.contains("crying")
    }

    private static let conflictPhrases = [
        "upset with", "upset that", "mad at", "wish you'd told", "wish you had told", "you always", "you never", "leave me alone",
        "stop texting", "fed up", "disappointed in", "hurt my feelings", "i hate you", "i hate this", "not talking to", "i'm sorry", "im sorry",
        "apolog", "blocked you", "break up", "breaking up", "breakup"
    ]
    private static let conflictWords: Set<String> = ["angry", "furious", "pissed", "livid", "resent", "argument", "fight", "fighting"]
    private static let privatePhrases = ["social security", "credit card", "my address", "verification code", "passed away", "panic attack", "owe you", "i owe"]
    private static let privateWords: Set<String> = [
        "password", "passcode", "ssn", "diagnosis", "diagnosed", "therapy", "therapist", "medication", "anxiety", "depressed", "depression",
        "pregnant", "surgery", "hospital", "chemo", "cancer", "funeral", "salary", "paycheck", "debt", "loan", "otp", "rent", "venmo", "zelle", "mortgage"
    ]
    private static let insultWords: Set<String> = [
        "idiot", "dumb", "stupid", "loser", "annoying", "pathetic", "clown", "trash", "useless", "ugly", "lame", "worst", "moron"
    ]

    static func sensitivity(of text: String, fromOwner: Bool, friendFirstName: String) -> WrappedSensitivity? {
        let n = normalized(text)
        let t = Set(tokens(text))
        if conflictPhrases.contains(where: n.contains) || !t.isDisjoint(with: conflictWords) { return .conflict }
        if privatePhrases.contains(where: n.contains) || !t.isDisjoint(with: privateWords) { return .privateTopic }
        let addressesFriend = !t.isDisjoint(with: ["you", "your", "you're", "youre", friendFirstName.lowercased()])
        if fromOwner, addressesFriend, !t.isDisjoint(with: insultWords) { return .roastOfOther }
        return nil
    }
}

// MARK: - Candidates and context

struct WrappedClaim: Hashable {
    let role: WrappedRole
    let messageID: String
    let speakerID: String
    let text: String
}

struct WrappedCandidate {
    let signal: WrappedSignal
    let presentation: WrappedPresentation
    let headline: String
    let prompt: String
    let why: String
    let claims: [WrappedClaim]
    let evidenceIDs: [String]
    let quantity: WrappedQuantity?
    let figure: WrappedFigure
    let score: Double
    let shareByDefault: Bool
    var suggestedByModel = false
}

struct WrappedReplyGap: Hashable {
    let incomingMessageID: String
    let replyMessageID: String
    let seconds: TimeInterval
}

struct WrappedReplyGapSummary: Hashable {
    let lateGaps: [WrappedReplyGap]
    let completedTurns: Int
    let openTurns: Int
    let skippedForMissingTime: Int
    var lateCount: Int { lateGaps.count }
    var longest: WrappedReplyGap? { lateGaps.max { $0.seconds < $1.seconds } }
}

struct WrappedAnalysisContext {
    struct Entry {
        let index: Int
        let message: WrappedMessage
        let date: Date?
        let attributable: Bool
        let inRange: Bool
        let sensitivity: WrappedSensitivity?
        let tokens: [String]
        let content: [String]
        var senderID: String { message.senderID ?? "" }
        var usable: Bool { attributable && inRange && date != nil && sensitivity == nil }
    }

    let conversation: WrappedConversation
    let owner: WrappedParticipant
    let friend: WrappedParticipant
    let range: WrappedDateRange
    let locale: Locale
    let entries: [Entry]
    var usable: [Entry] { entries.filter(\.usable) }

    init?(conversation: WrappedConversation, ownerID: String, range: WrappedDateRange, locale: Locale) {
        guard !conversation.isGroup, conversation.participants.count == 2,
              let owner = conversation.participant(id: ownerID),
              let friend = conversation.participants.first(where: { $0.id != ownerID }) else { return nil }
        self.conversation = conversation
        self.owner = owner
        self.friend = friend
        self.range = range
        self.locale = locale
        let ids = Set(conversation.participants.map(\.id))
        entries = conversation.messages.filter { $0.kind == .text }.enumerated().map { index, m in
            let attributable = m.senderID.map(ids.contains) == true && !m.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            let tokens = WrappedText.tokens(m.text)
            return Entry(
                index: index, message: m, date: m.sentAt, attributable: attributable,
                inRange: m.sentAt.map(range.contains) ?? false,
                sensitivity: WrappedText.sensitivity(of: m.text, fromOwner: m.senderID == ownerID, friendFirstName: friend.firstName),
                tokens: tokens, content: WrappedText.content(tokens)
            )
        }
    }

    func next(after e: Entry) -> Entry? { entries.indices.contains(e.index + 1) ? entries[e.index + 1] : nil }
    func previous(before e: Entry) -> Entry? { entries.indices.contains(e.index - 1) ? entries[e.index - 1] : nil }

    func dayNumber(_ date: Date) -> Int {
        let c = range.calendar
        return c.dateComponents([.day], from: c.startOfDay(for: range.start), to: c.startOfDay(for: date)).day ?? 0
    }

    func day(_ date: Date) -> String { WrappedFormat.string(date, template: "MMMd", timeZone: range.timeZone, locale: locale) }
    func clock(_ date: Date) -> String { WrappedFormat.string(date, template: "jmm", timeZone: range.timeZone, locale: locale) }

    func who(_ id: String, capitalized: Bool = false) -> String {
        id == owner.id ? (capitalized ? "You" : "you") : friend.firstName
    }

    func claim(_ role: WrappedRole, _ e: Entry) -> WrappedClaim {
        WrappedClaim(role: role, messageID: e.message.id, speakerID: e.senderID, text: e.message.text)
    }

    func isShort(_ e: Entry, words: Int = 30) -> Bool {
        WrappedText.wordCount(e.message.text) <= words && e.message.text.count <= 160
    }

    func reply(to e: Entry, within seconds: TimeInterval) -> Entry? {
        guard let n = next(after: e), n.usable, e.usable, let a = e.date, let b = n.date,
              n.senderID != e.senderID, b >= a, b.timeIntervalSince(a) <= seconds else { return nil }
        return n
    }
}

protocol WrappedCandidateProviding {
    func candidates(in context: WrappedAnalysisContext) -> [WrappedCandidate]
}

// MARK: - Reply gaps

extension WrappedEngine {
    /// Completed 24 h+ gaps per incoming turn, last incoming message to first owner reply, both turn start and reply inside the range.
    /// Returns nil for group or unsupported conversations. Open turns, system messages and messages without times never count.
    static func replyGaps(conversation: WrappedConversation, ownerID: String, range: WrappedDateRange) -> WrappedReplyGapSummary? {
        guard !conversation.isGroup, conversation.participants.count == 2,
              conversation.participant(id: ownerID) != nil,
              let friend = conversation.participants.first(where: { $0.id != ownerID }) else { return nil }
        let ids = Set(conversation.participants.map(\.id))
        var late: [WrappedReplyGap] = []
        var completed = 0, open = 0, skipped = 0
        var turnStart: Date?
        var turnLast: (date: Date, id: String)?

        func abandonTurn() {
            if turnStart != nil { skipped += 1 }
            turnStart = nil
            turnLast = nil
        }

        for m in conversation.messages where m.kind == .text {
            guard let sender = m.senderID, ids.contains(sender) else { abandonTurn(); continue }
            guard let t = m.sentAt else { abandonTurn(); continue }
            if sender == friend.id {
                if turnStart == nil { turnStart = t }
                turnLast = (t, m.id)
                continue
            }
            guard let start = turnStart, let last = turnLast else { continue }
            if range.contains(start), range.contains(t) {
                completed += 1
                let seconds = t.timeIntervalSince(last.date)
                if seconds >= 86400 { late.append(WrappedReplyGap(incomingMessageID: last.id, replyMessageID: m.id, seconds: seconds)) }
            }
            turnStart = nil
            turnLast = nil
        }
        if let start = turnStart, range.contains(start) { open += 1 }
        return WrappedReplyGapSummary(lateGaps: late, completedTurns: completed, openTurns: open, skippedForMissingTime: skipped)
    }
}

// MARK: - Heuristic provider

struct WrappedHeuristicProvider: WrappedCandidateProviding {
    func candidates(in ctx: WrappedAnalysisContext) -> [WrappedCandidate] {
        runningJokes(ctx) + quotableLines(ctx) + invitations(ctx) + lastLineTwists(ctx) + topicChanges(ctx) + replyGapCandidates(ctx) + busiestDay(ctx)
    }

    private func list(_ items: [String]) -> String {
        let quoted = items.map { "“\($0)”" }
        if quoted.count <= 1 { return quoted.first ?? "" }
        return quoted.dropLast().joined(separator: ", ") + " and " + quoted.last!
    }

    // Callbacks across dates: a term that returns on several days.
    func runningJokes(_ ctx: WrappedAnalysisContext) -> [WrappedCandidate] {
        let usable = ctx.usable
        guard usable.count >= 4 else { return [] }
        var terms: [String: [WrappedAnalysisContext.Entry]] = [:]
        for e in usable {
            var found = Set(e.content.filter { $0.count >= 4 })
            for (a, b) in zip(e.content, e.content.dropFirst()) { found.insert(a + " " + b) }
            for t in found { terms[t, default: []].append(e) }
        }
        let maxDocs = max(8, usable.count / 3)
        var found: [(term: String, occ: [WrappedAnalysisContext.Entry], score: Double)] = []
        for (term, occ) in terms where occ.count >= 3 && occ.count <= maxDocs {
            guard let first = occ.first, let last = occ.last, let a = first.date, let b = last.date,
                  ctx.isShort(first), ctx.isShort(last) else { continue }
            let days = Set(occ.compactMap { $0.date.map(ctx.dayNumber) })
            guard days.count >= 2 else { continue }
            let span = ctx.dayNumber(b) - ctx.dayNumber(a)
            let both = Set(occ.map(\.senderID)).count > 1
            let score = Double(occ.count) + min(Double(span), 14) * 0.2 + (both ? 1.5 : 0) + (term.contains(" ") ? 1 : 0)
            found.append((term, occ, score))
        }
        found.sort { $0.score != $1.score ? $0.score > $1.score : $0.term < $1.term }

        var accepted: [Set<Int>] = []
        var result: [WrappedCandidate] = []
        for item in found {
            let set = Set(item.occ.map(\.index))
            if accepted.contains(where: { Double($0.intersection(set).count) >= 0.5 * Double(min($0.count, set.count)) }) { continue }
            accepted.append(set)
            let first = item.occ.first!, last = item.occ.last!
            let a = first.date!, b = last.date!
            let span = ctx.dayNumber(b) - ctx.dayNumber(a)
            let both = Set(item.occ.map(\.senderID)).count > 1
            let why = "I counted \(item.occ.count) uses over \(span + 1) days: first by \(ctx.who(first.senderID)) on \(ctx.day(a)), most recently by \(ctx.who(last.senderID)) on \(ctx.day(b))." + (both ? " You both use it." : "")
            result.append(WrappedCandidate(
                signal: .runningJoke, presentation: .exchange,
                headline: "“\(item.term)” keeps coming back", prompt: "",
                why: why,
                claims: [ctx.claim(.setup, first), ctx.claim(.punchline, last)],
                evidenceIDs: item.occ.map(\.message.id),
                quantity: WrappedQuantity(value: "\(item.occ.count)", label: "times", detail: "over \(span + 1) days"),
                figure: .occurrences(item.occ.compactMap(\.date)),
                score: item.score, shareByDefault: true))
        }
        return result
    }

    // A short, distinctive line with an unambiguous sender, followed by a reply.
    func quotableLines(_ ctx: WrappedAnalysisContext) -> [WrappedCandidate] {
        let usable = ctx.usable
        var df: [String: Int] = [:]
        for e in usable { for t in Set(e.content) { df[t, default: 0] += 1 } }
        var result: [WrappedCandidate] = []
        for e in usable {
            let words = WrappedText.wordCount(e.message.text)
            guard (3...14).contains(words), e.message.text.count <= 120, e.content.count >= 2,
                  let reply = ctx.reply(to: e, within: 86400), let a = e.date, let b = reply.date else { continue }
            let unique = e.content.filter { df[$0] == 1 }
            let fraction = Double(unique.count) / Double(e.content.count)
            guard !unique.isEmpty, fraction >= 0.5 else { continue }
            guard WrappedText.laughs(reply.message.text) else { continue }
            let score = 1 + 3 * fraction + min(Double(unique.count), 3) * 0.4 + 1.5 + (words <= 8 ? 0.5 : 0)
            let shown = Array(unique.prefix(2))
            let elapsed = WrappedFormat.elapsed(b.timeIntervalSince(a))
            let why = "I couldn’t find \(list(shown).replacingOccurrences(of: " and ", with: " or ")) in any other message in this range, and \(ctx.who(reply.senderID)) replied \(elapsed) later."
            result.append(WrappedCandidate(
                signal: .quotableLine, presentation: .guess,
                headline: "Who said it?", prompt: "\(ctx.owner.firstName) or \(ctx.friend.firstName)?",
                why: why,
                claims: [ctx.claim(.setup, e), ctx.claim(.reveal, reply)],
                evidenceIDs: [e.message.id, reply.message.id],
                quantity: nil, figure: .answeredIn(b.timeIntervalSince(a)),
                score: score, shareByDefault: true))
        }
        return result
    }

    private static let invitePhrases = [
        "you in for", "you in?", "are you free", "are you around", "you around", "want to", "wanna", "do you want", "let's", "lets ", "down to",
        "need a +1", "come with", "join me", "how about", "up for", "come?", "come to"
    ]
    private static let dayWords = [
        "tomorrow", "tonight", "today", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "weekend", "next week"
    ]
    private static let clockPattern = try! NSRegularExpression(pattern: "\\b(at|by|around) \\d{1,2}(:\\d{2})?\\b|\\b\\d{1,2}(:\\d{2})? ?(am|pm)\\b")
    private static let acceptTokens: Set<String> = ["yes", "yeah", "yep", "sure", "absolutely", "obviously", "in", "down", "definitely"]

    // A memorable, dated invitation and its reply.
    func invitations(_ ctx: WrappedAnalysisContext) -> [WrappedCandidate] {
        var result: [WrappedCandidate] = []
        for e in ctx.usable {
            let n = WrappedText.normalized(e.message.text)
            guard Self.invitePhrases.contains(where: n.contains), ctx.isShort(e),
                  let cue = Self.dayWords.first(where: { WrappedText.tokens(n).contains($0) || n.contains($0) }),
                  let reply = ctx.reply(to: e, within: 86400), ctx.isShort(reply), let a = e.date, let b = reply.date else { continue }
            let clock = Self.clockPattern.firstMatch(in: n, range: NSRange(n.startIndex..., in: n)) != nil
            let accepted = !Set(reply.tokens).isDisjoint(with: Self.acceptTokens)
            let score = 2 + (clock ? 0.7 : 0) + (accepted ? 1 : 0) + (WrappedText.wordCount(reply.message.text) <= 10 ? 0.5 : 0) + (WrappedText.laughs(reply.message.text) ? 0.8 : 0)
            let elapsed = WrappedFormat.elapsed(b.timeIntervalSince(a))
            result.append(WrappedCandidate(
                signal: .datedInvitation, presentation: .exchange,
                headline: "\(ctx.who(e.senderID, capitalized: true)) made a plan",
                prompt: "",
                why: "I spotted a plan for “\(cue)” on \(ctx.day(a)), and \(ctx.who(reply.senderID)) answered \(elapsed) later.",
                claims: [ctx.claim(.setup, e), ctx.claim(.punchline, reply)],
                evidenceIDs: [e.message.id, reply.message.id],
                quantity: nil, figure: .answeredIn(b.timeIntervalSince(a)),
                score: score, shareByDefault: true))
        }
        return result
    }

    private static let twistMarkers = ["turns out", "actually", "the other", "meant", "wrong", "oops", "plot twist", "never mind", "nevermind", "not that"]

    // The last line recasts the first: statement, question, answer with a correction.
    func lastLineTwists(_ ctx: WrappedAnalysisContext) -> [WrappedCandidate] {
        let usable = ctx.entries
        var result: [WrappedCandidate] = []
        for i in 0..<max(0, usable.count - 2) {
            let a = usable[i], b = usable[i + 1], c = usable[i + 2]
            guard a.usable, b.usable, c.usable, let ta = a.date, let tc = c.date,
                  a.senderID != b.senderID, c.senderID == a.senderID,
                  b.message.text.contains("?"), tc >= ta, tc.timeIntervalSince(ta) <= 1800,
                  ctx.isShort(a), ctx.isShort(b), ctx.isShort(c) else { continue }
            let n = WrappedText.normalized(c.message.text)
            guard let marker = Self.twistMarkers.first(where: n.contains) else { continue }
            let elapsed = WrappedFormat.elapsed(tc.timeIntervalSince(ta))
            result.append(WrappedCandidate(
                signal: .lastLineTwist, presentation: .exchange,
                headline: "The last line changes it", prompt: "",
                why: "I think “\(marker)” in the last line changes what the first one meant. All three texts landed within \(elapsed).",
                claims: [ctx.claim(.setup, a), ctx.claim(.punchline, b), ctx.claim(.punchline, c)],
                evidenceIDs: [a.message.id, b.message.id, c.message.id],
                quantity: nil, figure: .answeredIn(tc.timeIntervalSince(ta)),
                score: 3.4 + (WrappedText.laughs(c.message.text) ? 0.5 : 0), shareByDefault: true))
        }
        return result
    }

    private static let swerveMarkers = ["anyway", "unrelated", "random question", "off topic", "speaking of", "tangent", "out of nowhere"]

    // An improbable topic change: no word from the previous message returns.
    func topicChanges(_ ctx: WrappedAnalysisContext) -> [WrappedCandidate] {
        var result: [WrappedCandidate] = []
        for e in ctx.entries where e.usable {
            guard let prev = ctx.previous(before: e), prev.usable, let tp = prev.date, let te = e.date,
                  te >= tp, te.timeIntervalSince(tp) <= 6 * 3600, ctx.isShort(prev), ctx.isShort(e),
                  let marker = Self.swerveMarkers.first(where: WrappedText.normalized(e.message.text).contains),
                  Set(prev.content).isDisjoint(with: e.content) else { continue }
            let replied = ctx.reply(to: e, within: 3600) != nil
            result.append(WrappedCandidate(
                signal: .topicChange, presentation: .exchange,
                headline: "Out of nowhere", prompt: "",
                why: "I can’t find a single word from the text before in this one, and \(ctx.who(e.senderID)) opened with “\(marker)”.",
                claims: [ctx.claim(.setup, prev), ctx.claim(.punchline, e)],
                evidenceIDs: [prev.message.id, e.message.id],
                quantity: nil, figure: .answeredIn(te.timeIntervalSince(tp)),
                score: 4.6 + (replied ? 0.6 : 0), shareByDefault: true))
        }
        return result
    }

    // The owner's own completed 24 h+ reply gaps. Private unless explicitly selected.
    func replyGapCandidates(_ ctx: WrappedAnalysisContext) -> [WrappedCandidate] {
        guard let summary = WrappedEngine.replyGaps(conversation: ctx.conversation, ownerID: ctx.owner.id, range: ctx.range),
              summary.lateCount >= 2, let longest = summary.longest else { return [] }
        let byID = Dictionary(ctx.entries.map { ($0.message.id, $0) }, uniquingKeysWith: { a, _ in a })
        let shown = summary.lateGaps.sorted { $0.seconds > $1.seconds }.prefix(3).sorted { $0.seconds < $1.seconds }
        var claims: [WrappedClaim] = []
        for gap in shown {
            guard let incoming = byID[gap.incomingMessageID], let reply = byID[gap.replyMessageID] else { continue }
            claims.append(ctx.claim(.context, incoming))
            claims.append(ctx.claim(.reveal, reply))
        }
        let n = summary.lateCount
        return [WrappedCandidate(
            signal: .replyGaps, presentation: .reveal,
            headline: "Your ghost era?", prompt: "How many times did you answer \(ctx.friend.firstName) a day or more later?",
            why: "I counted \(n) of \(summary.completedTurns) replies that came 24 hours or more later. I’m only measuring time, so I can’t tell whether anything was ignored.",
            claims: claims,
            evidenceIDs: summary.lateGaps.flatMap { [$0.incomingMessageID, $0.replyMessageID] },
            quantity: WrappedQuantity(value: "\(n)", label: n == 1 ? "late comeback" : "late comebacks", detail: "Longest gap: \(WrappedFormat.elapsed(longest.seconds))"),
            figure: .gaps(summary.lateGaps.map(\.seconds)),
            score: 4 + min(Double(n), 5) * 0.3, shareByDefault: false)]
    }

    // The day with the most messages, counted from timestamps.
    func busiestDay(_ ctx: WrappedAnalysisContext) -> [WrappedCandidate] {
        let usable = ctx.usable
        var byDay: [Int: [WrappedAnalysisContext.Entry]] = [:]
        for e in usable { if let d = e.date { byDay[ctx.dayNumber(d), default: []].append(e) } }
        guard let peak = byDay.max(by: { $0.value.count != $1.value.count ? $0.value.count < $1.value.count : $0.key > $1.key }),
              peak.value.count >= 6, let first = peak.value.first, let last = peak.value.last, first.message.id != last.message.id,
              let a = first.date, let b = last.date else { return [] }
        let dayCount = ctx.range.dayCount
        var counts = Array(repeating: 0, count: max(dayCount, 1))
        for (d, items) in byDay where counts.indices.contains(d) { counts[d] = items.count }
        let active = counts.filter { $0 > 0 }.sorted()
        let median = active[active.count / 2]
        return [WrappedCandidate(
            signal: .busiestDay, presentation: .reveal,
            headline: "Your loudest day", prompt: "Which day did the two of you text the most?",
            why: "I counted \(peak.value.count) messages on \(ctx.day(a)) from the timestamps. A typical active day had \(median).",
            claims: [ctx.claim(.context, first), ctx.claim(.context, last)],
            evidenceIDs: peak.value.map(\.message.id),
            quantity: WrappedQuantity(value: "\(peak.value.count)", label: "messages", detail: "on \(ctx.day(a)), \(ctx.clock(a)) to \(ctx.clock(b))"),
            figure: .dailyCounts(counts: counts, peak: peak.key, firstDay: ctx.range.start),
            score: 3.0, shareByDefault: true)]
    }
}


// MARK: - Engine: verification, selection, caching-friendly generation

enum WrappedEngine {
    static func resolve(_ claim: WrappedClaim, in conversation: WrappedConversation, range: WrappedDateRange) -> WrappedQuote? {
        let matches = conversation.messages.filter { $0.id == claim.messageID }
        guard matches.count == 1, let m = matches.first, m.kind == .text,
              let sender = m.senderID, sender == claim.speakerID,
              let person = conversation.participant(id: sender),
              let date = m.sentAt, range.contains(date),
              !claim.text.isEmpty, m.text.contains(claim.text) else { return nil }
        return WrappedQuote(messageID: m.id, speakerID: sender, speakerName: person.name, text: claim.text, sentAt: date, service: conversation.service)
    }

    static func highlight(from c: WrappedCandidate, conversation: WrappedConversation, range: WrappedDateRange) -> WrappedHighlight? {
        var quotes: [WrappedHighlightQuote] = []
        for claim in c.claims {
            guard let q = resolve(claim, in: conversation, range: range) else { return nil }
            quotes.append(WrappedHighlightQuote(role: claim.role, quote: q))
        }
        for id in c.evidenceIDs {
            let m = conversation.messages.filter { $0.id == id }
            guard m.count == 1, m[0].kind == .text, let t = m[0].sentAt, range.contains(t), conversation.participant(id: m[0].senderID) != nil else { return nil }
        }
        let count = { (role: WrappedRole) in quotes.filter { $0.role == role }.count }
        switch c.presentation {
        case .guess:
            guard count(.setup) == 1, count(.reveal) == 1,
                  let a = quotes.first(where: { $0.role == .setup })?.quote, let b = quotes.first(where: { $0.role == .reveal })?.quote,
                  a.speakerID != b.speakerID, b.sentAt >= a.sentAt else { return nil }
        case .exchange:
            guard count(.setup) >= 1, (1...2).contains(count(.punchline)) else { return nil }
        case .reveal:
            guard !quotes.isEmpty || c.quantity != nil else { return nil }
        }
        let sources = Array(NSOrderedSet(array: c.claims.map(\.messageID) + c.evidenceIDs)) as? [String] ?? c.evidenceIDs
        return WrappedHighlight(
            id: c.signal.rawValue + ":" + c.claims.map(\.messageID).joined(separator: "+"),
            presentation: c.presentation, signal: c.signal, headline: c.headline, prompt: c.prompt, why: c.why,
            quotes: quotes, quantity: c.quantity, figure: c.figure, sourceMessageIDs: sources, score: c.score, shareByDefault: c.shareByDefault,
            suggestedByModel: c.suggestedByModel ? true : nil)
    }

    /// Up to three highlights: distinct signals first, never sharing a source message.
    /// At most `maxModel` may come from the model, and a fresh rule-based highlight is always kept when one exists.
    static func select(_ items: [WrappedHighlight], maxModel: Int = 2) -> [WrappedHighlight] {
        let pool = items.filter { $0.score >= 2.0 }.sorted {
            $0.score != $1.score ? $0.score > $1.score : $0.id < $1.id
        }
        var chosen: [WrappedHighlight] = []
        var sources = Set<String>()
        var signals = Set<WrappedSignal>()
        for pass in 0..<2 {
            for h in pool where chosen.count < 3 {
                let fresh = sources.isDisjoint(with: h.sourceMessageIDs)
                let distinct = !signals.contains(h.signal)
                let modelRoom = !h.isModelSuggestion || chosen.filter(\.isModelSuggestion).count < maxModel
                guard fresh, modelRoom, (pass == 0 && distinct) || (pass == 1 && !distinct && h.score >= 3.0) else { continue }
                chosen.append(h)
                sources.formUnion(h.sourceMessageIDs)
                signals.insert(h.signal)
            }
        }
        if !chosen.isEmpty, chosen.allSatisfy(\.isModelSuggestion) {
            let kept = chosen.count < 3 ? chosen : Array(chosen.dropLast())
            let used = Set(kept.flatMap(\.sourceMessageIDs))
            if let rule = pool.first(where: { !$0.isModelSuggestion && used.isDisjoint(with: $0.sourceMessageIDs) }) {
                chosen = kept + [rule]
            }
        }
        let order: [WrappedPresentation: Int] = [.guess: 0, .reveal: 1, .exchange: 2]
        return chosen.sorted {
            order[$0.presentation]! != order[$1.presentation]! ? order[$0.presentation]! < order[$1.presentation]! : $0.score > $1.score
        }
    }

    static func widerRange(for conversation: WrappedConversation, current range: WrappedDateRange, toFullExtent: Bool = false) -> WrappedDateRange? {
        let dates = conversation.messages.filter { $0.kind == .text }.compactMap(\.sentAt)
        guard let lo = dates.min(), let hi = dates.max() else { return nil }
        let c = range.calendar
        let days = max(range.dayCount, 1)
        let earliest = c.startOfDay(for: lo)
        let latestEnd = c.date(byAdding: .day, value: 1, to: c.startOfDay(for: hi)) ?? hi
        let start = toFullExtent ? earliest : max(earliest, c.date(byAdding: .day, value: -days, to: range.start) ?? range.start)
        let end = toFullExtent ? latestEnd : min(latestEnd, c.date(byAdding: .day, value: days, to: range.end) ?? range.end)
        let newStart = min(start, range.start), newEnd = max(end, range.end)
        guard newStart < range.start || newEnd > range.end else { return nil }
        return WrappedDateRange(start: newStart, end: newEnd, timeZoneIdentifier: range.timeZoneIdentifier)
    }

    static func generate(
        conversation: WrappedConversation, ownerID: String, range: WrappedDateRange,
        avoiding seen: Set<String> = [], number: Int = 1, now: Date = Date(), locale: Locale = .current,
        provider: WrappedCandidateProviding = WrappedHeuristicProvider()
    ) -> WrappedOutcome {
        guard let ctx = WrappedAnalysisContext(conversation: conversation, ownerID: ownerID, range: range, locale: locale) else {
            return .empty(.unsupportedConversation, widerRange: nil)
        }
        let wider = widerRange(for: conversation, current: range)
        let eligible = ctx.entries.filter { $0.attributable && $0.inRange && $0.date != nil }
        guard !eligible.isEmpty else {
            return .empty(.noMessagesInRange(outsideRange: ctx.entries.count), widerRange: widerRange(for: conversation, current: range, toFullExtent: true))
        }
        let verified = provider.candidates(in: ctx)
            .compactMap { highlight(from: $0, conversation: conversation, range: range) }
            .filter { seen.isDisjoint(with: $0.sourceMessageIDs) }
        let chosen = select(verified)
        guard !chosen.isEmpty else {
            return seen.isEmpty
                ? .empty(.noHighlights(eligibleMessages: eligible.count), widerRange: wider)
                : .exhausted(seenCount: seen.count, widerRange: wider)
        }
        return .edition(WrappedEdition(
            id: "\(ownerID)|\(conversation.id)|\(range.cacheKey)#\(number)", number: number,
            conversationID: conversation.id, ownerID: ownerID, range: range, generatedAt: now,
            highlights: chosen, analyzedMessageCount: eligible.count,
            leftOutCount: eligible.filter { $0.sensitivity != nil }.count,
            isShortRecap: eligible.count < 12))
    }

    /// Re-checks every cached quote against the current conversation. Highlights whose source changed or vanished are dropped.
    static func revalidate(_ edition: WrappedEdition, in conversation: WrappedConversation) -> WrappedEdition {
        let kept = edition.highlights.filter { h in
            h.quotes.allSatisfy { hq in
                resolve(WrappedClaim(role: hq.role, messageID: hq.quote.messageID, speakerID: hq.quote.speakerID, text: hq.quote.text), in: conversation, range: edition.range) != nil
            }
        }
        return WrappedEdition(
            id: edition.id, number: edition.number, conversationID: edition.conversationID, ownerID: edition.ownerID, range: edition.range,
            generatedAt: edition.generatedAt, highlights: kept, analyzedMessageCount: edition.analyzedMessageCount,
            leftOutCount: edition.leftOutCount, isShortRecap: edition.isShortRecap)
    }
}
