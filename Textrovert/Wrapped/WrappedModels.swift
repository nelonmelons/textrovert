import Foundation

// Wrapped · conversation-specific edition models.
// Standalone and namespaced: nothing here depends on, or collides with, Friend, SourceMessage or Theme in TextrovertApp.swift.
// Source messages are expected oldest-first, exactly as imported.

struct WrappedParticipant: Hashable, Identifiable {
    let id: String
    let name: String
    var firstName: String { name.split(separator: " ").first.map(String.init) ?? name }
}

struct WrappedMessage: Hashable, Identifiable {
    enum Kind: String { case text, system }
    let id: String
    let senderID: String?
    let text: String
    let sentAt: Date?
    var kind: Kind = .text
}

struct WrappedConversation: Hashable, Identifiable {
    let id: String
    let service: String
    let participants: [WrappedParticipant]
    let messages: [WrappedMessage]
    var isGroup: Bool { participants.count > 2 }
    func participant(id: String?) -> WrappedParticipant? { participants.first { $0.id == id } }
}

struct WrappedDateRange: Codable, Hashable {
    let start: Date
    let end: Date
    let timeZoneIdentifier: String

    init(start: Date, end: Date, timeZoneIdentifier: String) {
        self.start = start
        self.end = end
        self.timeZoneIdentifier = timeZoneIdentifier
    }

    init(from firstDay: Date, through lastDay: Date, timeZone: TimeZone) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        start = calendar.startOfDay(for: firstDay)
        end = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: lastDay)) ?? lastDay
        timeZoneIdentifier = timeZone.identifier
    }

    var timeZone: TimeZone { TimeZone(identifier: timeZoneIdentifier) ?? .current }
    var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }
    var dayCount: Int { calendar.dateComponents([.day], from: start, to: end).day ?? 0 }
    var cacheKey: String { "\(Int(start.timeIntervalSince1970))-\(Int(end.timeIntervalSince1970))" }

    func contains(_ date: Date) -> Bool { date >= start && date < end }

    func label(locale: Locale = .current) -> String {
        let last = end.addingTimeInterval(-1)
        let first = WrappedFormat.string(start, template: "MMMd", timeZone: timeZone, locale: locale)
        let sameMonth = calendar.component(.month, from: start) == calendar.component(.month, from: last)
        let second = WrappedFormat.string(last, template: sameMonth ? "d" : "MMMd", timeZone: timeZone, locale: locale)
        return "\(first) – \(second)"
    }
}

enum WrappedFormat {
    static func string(_ date: Date, template: String, timeZone: TimeZone, locale: Locale) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: date)
    }

    static func elapsed(_ seconds: TimeInterval) -> String {
        let s = max(0, seconds)
        func unit(_ n: Int, _ word: String) -> String { "\(n) \(word)\(n == 1 ? "" : "s")" }
        if s < 60 { return "under a minute" }
        if s < 3600 { return unit(Int(s / 60), "minute") }
        if s < 86400 {
            let hours = Int(s / 3600)
            let minutes = Int(s.truncatingRemainder(dividingBy: 3600) / 60)
            return minutes > 0 && hours < 6 ? "\(unit(hours, "hour")) \(minutes) min" : unit(hours, "hour")
        }
        let days = Int(s / 86400)
        let hours = Int(s.truncatingRemainder(dividingBy: 86400) / 3600)
        return hours > 0 ? "\(unit(days, "day")) \(unit(hours, "hour"))" : unit(days, "day")
    }
}

enum WrappedPresentation: String, Codable, CaseIterable { case guess, reveal, exchange }

enum WrappedSignal: String, Codable {
    case quotableLine, runningJoke, datedInvitation, lastLineTwist, topicChange, replyGaps, busiestDay, warmMoment
}

enum WrappedRole: String, Codable { case setup, punchline, reveal, context }

struct WrappedQuote: Codable, Hashable, Identifiable {
    var id: String { messageID }
    let messageID: String
    let speakerID: String
    let speakerName: String
    let text: String
    let sentAt: Date
    let service: String
}

struct WrappedHighlightQuote: Codable, Hashable {
    let role: WrappedRole
    let quote: WrappedQuote
}

struct WrappedQuantity: Codable, Hashable {
    let value: String
    let label: String
    let detail: String
}

enum WrappedFigure: Codable, Hashable {
    case none
    case occurrences([Date])
    case dailyCounts(counts: [Int], peak: Int, firstDay: Date)
    case gaps([TimeInterval])
    case answeredIn(TimeInterval)
}

struct WrappedHighlight: Codable, Hashable, Identifiable {
    let id: String
    let presentation: WrappedPresentation
    let signal: WrappedSignal
    let headline: String
    let prompt: String
    let why: String
    let quotes: [WrappedHighlightQuote]
    let quantity: WrappedQuantity?
    let figure: WrappedFigure
    let sourceMessageIDs: [String]
    let score: Double
    let shareByDefault: Bool
    var suggestedByModel: Bool? = nil

    var isModelSuggestion: Bool { suggestedByModel == true }
    func quotes(_ role: WrappedRole) -> [WrappedQuote] { quotes.filter { $0.role == role }.map(\.quote) }
}

struct WrappedEdition: Codable, Hashable, Identifiable {
    let id: String
    let number: Int
    let conversationID: String
    let ownerID: String
    let range: WrappedDateRange
    let generatedAt: Date
    let highlights: [WrappedHighlight]
    let analyzedMessageCount: Int
    let leftOutCount: Int
    let isShortRecap: Bool

    var sourceMessageIDs: Set<String> { Set(highlights.flatMap(\.sourceMessageIDs)) }
}

enum WrappedEmptyReason: Hashable {
    case unsupportedConversation
    case noMessagesInRange(outsideRange: Int)
    case noHighlights(eligibleMessages: Int)
}

enum WrappedOutcome: Hashable {
    case edition(WrappedEdition)
    case exhausted(seenCount: Int, widerRange: WrappedDateRange?)
    case empty(WrappedEmptyReason, widerRange: WrappedDateRange?)
}

enum WrappedShareText {
    static func build(edition: WrappedEdition, selected: Set<String>, owner: WrappedParticipant, friend: WrappedParticipant, locale: Locale = .current) -> String {
        let tz = edition.range.timeZone
        func stamp(_ q: WrappedQuote) -> String { WrappedFormat.string(q.sentAt, template: "MMMdjmm", timeZone: tz, locale: locale) }
        func line(_ q: WrappedQuote) -> String { "“\(q.text)” — \(q.speakerName), \(stamp(q))" }

        var blocks = ["Wrapped: \(owner.firstName) & \(friend.firstName) · \(edition.range.label(locale: locale))"]
        for h in edition.highlights where selected.contains(h.id) {
            var lines = [h.headline]
            switch h.presentation {
            case .guess:
                lines += (h.quotes(.setup) + h.quotes(.reveal)).map(line)
            case .exchange:
                lines += (h.quotes(.setup) + h.quotes(.punchline)).map(line)
            case .reveal:
                if let q = h.quantity { lines.append("\(q.value) \(q.label) · \(q.detail)") }
            }
            blocks.append(lines.joined(separator: "\n"))
        }
        return blocks.joined(separator: "\n\n")
    }
}
