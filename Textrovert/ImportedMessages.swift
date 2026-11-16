import Foundation

// Reads the file the Textrovert Mac app saves with "Save for iPhone" and turns it into texting stats and Wrapped conversations.

/// Every iMessage chat from the Mac, each with its messages oldest first.
struct MessagesFile: Codable {
    let format: String
    let version: Int
    let exportedAt: Double
    let chats: [Chat]

    struct Chat: Codable {
        let id: String
        let title: String
        let group: Bool
        let people: [String]
        let messages: [Message]

        var name: String { title.isEmpty ? people.joined(separator: ", ") : title }
    }

    struct Message: Codable {
        /// Seconds since 1970.
        let t: Double
        /// The sender's name or handle; nil for your messages and for system notices.
        let from: String?
        let text: String?
        /// nil for text, otherwise photo, video, gif, audio, sticker, location, contact, file, deleted or system.
        let kind: String?
        /// Tapbacks as [sender, emoji] pairs; the sender is "Me" for yours.
        let reactions: [[String]]?

        /// False for system notices and unsent messages.
        var isMessage: Bool { kind != "system" && kind != "deleted" }
        var isMine: Bool { from == nil && kind != "system" }
    }

    static func read(_ data: Data) throws -> MessagesFile {
        guard let file = try? JSONDecoder().decode(MessagesFile.self, from: data), file.format == "textrovert-messages" else {
            throw ImportError("That isn’t a Textrovert messages file. On your Mac, open Textrovert, click Save for iPhone, and send the file it saves.")
        }
        guard file.version == 1 else {
            throw ImportError("That file comes from a newer Textrovert Mac app. Update Textrovert on this iPhone, then import it again.")
        }
        return file
    }
}

struct ImportError: LocalizedError {
    let errorDescription: String?

    init(_ message: String) {
        errorDescription = message
    }
}

/// Fun numbers from an imported history, counted in this phone's time zone.
struct TextingStats {
    struct Person: Identifiable, Hashable {
        let id: String
        let name: String
        let messages: Int
        let fromYou: Int
    }

    struct BiggestDay: Hashable {
        let date: Date
        let messages: Int
        let mostlyWith: String
    }

    struct Streak: Hashable {
        let days: Int
        let name: String
    }

    struct Emoji: Hashable {
        let emoji: String
        let count: Int
    }

    private(set) var messages = 0
    private(set) var sent = 0
    private(set) var chats = 0
    private(set) var since: Date?
    /// The one-to-one chats with the most messages, at most five.
    private(set) var people: [Person] = []
    /// 0–23.
    private(set) var busiestHour: Int?
    private(set) var biggestDay: BiggestDay?
    /// The most days in a row with at least one message in the same chat.
    private(set) var longestStreak: Streak?
    private(set) var topEmoji: [Emoji] = []
    /// Your messages with lol, haha, 😂 or 🤣, plus your Ha Ha tapbacks.
    private(set) var laughs = 0
    /// The share of your messages sent between midnight and 5 AM.
    private(set) var lateNight = 0.0

    init(_ file: MessagesFile, timeZone: TimeZone = .current) {
        var offsets: [Int: Int] = [:]
        func local(_ t: Double) -> (day: Int, hour: Int) {
            let utcDay = Int((t / 86400).rounded(.down))
            let offset: Int
            if let known = offsets[utcDay] {
                offset = known
            } else {
                offset = timeZone.secondsFromGMT(for: Date(timeIntervalSince1970: Double(utcDay) * 86400 + 43200))
                offsets[utcDay] = offset
            }
            let seconds = Int(t.rounded(.down)) + offset
            let day = Int((Double(seconds) / 86400).rounded(.down))
            return (day, (seconds - day * 86400) / 3600)
        }

        var hours = [Int](repeating: 0, count: 24)
        var perDay: [Int: Int] = [:]
        var emoji: [String: Int] = [:]
        var lateNight = 0
        var earliest = Double.infinity
        var people: [Person] = []

        for chat in file.chats {
            var count = 0
            var mine = 0
            var days = Set<Int>()
            for message in chat.messages {
                for reaction in message.reactions ?? [] where reaction.first == "Me" && reaction.last == "\u{1F602}" {
                    laughs += 1
                }
                guard message.isMessage else { continue }
                let (day, hour) = local(message.t)
                count += 1
                hours[hour] += 1
                perDay[day, default: 0] += 1
                days.insert(day)
                earliest = min(earliest, message.t)
                guard message.isMine else { continue }
                mine += 1
                if hour < 5 { lateNight += 1 }
                guard let text = message.text else { continue }
                for character in text where character.isEmojiGlyph {
                    emoji[String(character), default: 0] += 1
                }
                if Self.isLaugh(text) { laughs += 1 }
            }
            guard count > 0 else { continue }
            chats += 1
            messages += count
            sent += mine
            if !chat.group {
                people.append(Person(id: chat.id, name: chat.name, messages: count, fromYou: mine))
            }
            let run = Self.longestRun(days)
            if run >= 2, run > longestStreak?.days ?? 0 {
                longestStreak = Streak(days: run, name: chat.name)
            }
        }

        guard messages > 0 else { return }
        since = Date(timeIntervalSince1970: earliest)
        self.people = Array(people.sorted { $0.messages > $1.messages }.prefix(5))
        busiestHour = hours.indices.max { hours[$0] < hours[$1] }
        self.lateNight = sent > 0 ? Double(lateNight) / Double(sent) : 0
        topEmoji = emoji.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }
            .prefix(3)
            .map { Emoji(emoji: $0.key, count: $0.value) }

        guard let best = perDay.max(by: { $0.value != $1.value ? $0.value < $1.value : $0.key > $1.key }) else { return }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = utc.dateComponents([.year, .month, .day], from: Date(timeIntervalSince1970: Double(best.key) * 86400))
        let start = calendar.date(from: parts) ?? Date(timeIntervalSince1970: Double(best.key) * 86400)
        let end = calendar.date(byAdding: .day, value: 1, to: start) ?? start.addingTimeInterval(86400)
        let day = start.timeIntervalSince1970..<end.timeIntervalSince1970
        let busiest = file.chats
            .map { chat in (chat.name, chat.messages.reduce(0) { $0 + ($1.isMessage && day.contains($1.t) ? 1 : 0) }) }
            .max { $0.1 < $1.1 }
        biggestDay = BiggestDay(date: start, messages: best.value, mostlyWith: busiest?.0 ?? "")
    }

    private static func isLaugh(_ text: String) -> Bool {
        if text.contains("\u{1F602}") || text.contains("\u{1F923}") { return true }
        return text.lowercased().split { !$0.isLetter }.contains { word in
            ["lol", "lmao", "lmfao", "rofl"].contains(word) || word.hasPrefix("haha") || word.hasPrefix("hehe")
        }
    }

    private static func longestRun(_ days: Set<Int>) -> Int {
        var best = 0
        for day in days where !days.contains(day - 1) {
            var length = 1
            while days.contains(day + length) { length += 1 }
            best = max(best, length)
        }
        return best
    }
}

private extension Character {
    var isEmojiGlyph: Bool {
        guard let first = unicodeScalars.first else { return false }
        return first.properties.isEmojiPresentation || (first.properties.isEmoji && unicodeScalars.contains { $0.value == 0xFE0F })
    }
}

extension MessagesFile.Chat {
    /// A one-to-one chat's last 90 days in the shape Emma's Wrapped reads, opening on its last two weeks. Group chats have no Wrapped.
    func wrapped(ownerID: String, timeZone: TimeZone = .current) -> WrappedFixture? {
        guard !group, let last = messages.last else { return nil }
        let friend = WrappedParticipant(id: "friend", name: people.first ?? name)
        var items: [WrappedMessage] = []
        for (index, message) in messages.enumerated() where message.t >= last.t - 90 * 86400 {
            let id = "\(self.id)#\(index)"
            let sentAt = Date(timeIntervalSince1970: message.t)
            if message.kind == "system" {
                items.append(WrappedMessage(id: id, senderID: nil, text: message.text ?? "", sentAt: sentAt, kind: .system))
            } else if message.isMessage, let text = message.text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                items.append(WrappedMessage(id: id, senderID: message.isMine ? ownerID : friend.id, text: text, sentAt: sentAt))
            }
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let end = Date(timeIntervalSince1970: last.t)
        let start = calendar.date(byAdding: .day, value: -13, to: end) ?? end
        let conversation = WrappedConversation(
            id: id, service: "iMessage",
            participants: [WrappedParticipant(id: ownerID, name: "You"), friend],
            messages: items)
        return WrappedFixture(id: id, title: name, conversation: conversation, range: WrappedDateRange(from: start, through: end, timeZone: timeZone))
    }
}
