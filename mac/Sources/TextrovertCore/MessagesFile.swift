import Foundation

/// The file "Save for iPhone" writes and the iPhone app imports: every chat in an imessage-exporter "-f txt" export, as
/// JSON, each chat's messages oldest first. A message's t is seconds since 1970 and from is nil when you sent it or when
/// it is a system notice; kind is nil for text and otherwise photo, video, gif, audio, sticker, location, contact, file,
/// deleted or system; reactions are [sender, emoji] pairs, with "Me" for yours.
public struct MessagesFile: Codable {
    public var format = "textrovert-messages"
    public var version = 1
    public let exportedAt: Double
    public let chats: [Chat]

    public struct Chat: Codable {
        public let id: String
        public let title: String
        public let group: Bool
        public let people: [String]
        public let messages: [Message]
    }

    public struct Message: Codable {
        public let t: Double
        public let from: String?
        public let text: String?
        public let kind: String?
        public let reactions: [[String]]?
    }

    public var messageCount: Int { chats.reduce(0) { $0 + $1.messages.count } }

    public func data() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .withoutEscapingSlashes
        return try encoder.encode(self)
    }
}

extension MessagesFile {
    /// Reads an imessage-exporter "-f txt" folder the way the backend's packages/history/pipeline/parsers/imessageExporter.ts
    /// does. Its times are wall-clock times in the exporting Mac's zone, timeZone.
    public init(exportFolder: URL, timeZone: TimeZone = .current) throws {
        let files = try FileManager.default.contentsOfDirectory(atPath: exportFolder.path)
            .filter { $0.lowercased().hasSuffix(".txt") && $0.lowercased() != "orphaned.txt" }
            .sorted()
        let names = files.map { String($0.dropLast(4)) }
        let groups = names.map { ChatParser.named.match($0)?[1] ?? nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        var chats: [Chat] = []
        for (index, file) in files.enumerated() {
            let name = names[index]
            // The number after a group's name shifts whenever an older chat is deleted, so the name alone is the key,
            // unless two groups in this export share it.
            let id: String
            if let group = groups[index] {
                id = "group:" + (groups.filter { $0 == group }.count > 1 ? name : group)
            } else {
                id = "chat:" + name.components(separatedBy: ", ").sorted().joined(separator: ", ")
            }
            var parser = ChatParser(name: name, group: groups[index], calendar: calendar)
            if let chat = parser.parse(try Data(contentsOf: exportFolder.appending(path: file)), id: id) {
                chats.append(chat)
            }
        }
        self.init(exportedAt: Date().timeIntervalSince1970, chats: chats)
    }
}

/// One chat file: messages as "<time>[ (Read by ...)]\n<sender>\n<body lines>\n\n" and announcements as
/// "<time> <who> <action>\n\n". Mirrors parseChat in imessageExporter.ts.
struct ChatParser {
    static let me = "Me"
    static let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    // chrono "%b %d, %Y %l:%M:%S %p": "May 17, 2024  5:29:42 PM", "Nov 06, 2025 12:00:00 AM".
    static let time = Pattern(#"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2}), (\d{4}) {1,2}(\d{1,2}):(\d{2}):(\d{2}) ([AP]M)(?: (.+))?$"#)
    static let readBy = Pattern(#"^\(Read by .+ after .+\)$"#)
    static let tapback = Pattern(#"^ {4}(.+?) by (.+)$"#)
    static let tapbackEmoji = ["Loved": "\u{2764}\u{FE0F}", "Liked": "\u{1F44D}", "Disliked": "\u{1F44E}", "Laughed": "\u{1F602}", "Emphasized": "\u{203C}\u{FE0F}", "Questioned": "\u{2753}"]
    static let expressive = Pattern(#"^Sent with (?:Confetti|Echo|Fireworks|Balloons|Heart|Lasers|Shooting Star|Sparkles|Spotlight|Slam|Loud|Gentle|Invisible Ink)$"#)
    static let edited = Pattern(#"^Edited .+? later: "#)
    static let unsentPart = Pattern(#" unsent this message part(?: .+ after sending)?!$"#)
    static let unsent = Pattern(#"^(.+) unsent a message!$"#)
    static let groupEvent = Pattern(#" (?:named the conversation .*|added .+ to the conversation\.|removed .+ from the conversation\.|left the conversation\.|changed the group photo\.|removed the group photo\.)$"#)
    static let attachment = Pattern(#"^(?:/|~/|attachments/).*/[^/]+\.\w{2,5}$"#)
    static let sticker = Pattern(#"^(?:\S+ )?Sticker from .+?: "#)
    // Chats with a display name are written as "<name> - <n>", where n numbers every conversation in rowid order.
    static let named = Pattern(#"^(.+) - \d+$"#)
    static let indent = "    "

    private struct Pending {
        let t: Double
        var sender = ""
        var lines: [String] = []
        var reactions: [[String]] = []
        var deleted = false
    }

    private enum Mode { case sender, body, tapbacks, reply }

    private let name: String
    private let group: String?
    private let calendar: Calendar
    private var senders: [String] = []
    private var groupEvents = false
    private var messages: [MessagesFile.Message] = []
    private var pending: Pending?
    private var mode = Mode.body
    private var previous = ""
    private var hourStarts: [Int: Double] = [:]

    init(name: String, group: String?, calendar: Calendar) {
        self.name = name
        self.group = group
        self.calendar = calendar
    }

    mutating func parse(_ data: Data, id: String) -> MessagesFile.Chat? {
        let lines = data.split(separator: UInt8(ascii: "\n"), omittingEmptySubsequences: false).map { bytes in
            let line = String(decoding: bytes, as: UTF8.self)
            return line.hasSuffix("\r") ? String(line.dropLast()) : line
        }
        for (index, line) in lines.enumerated() {
            handle(line, next: index + 1 < lines.count ? lines[index + 1] : nil)
        }
        if let pending { push(pending.sender, message(pending)) }
        guard !messages.isEmpty else { return nil }
        let others = senders.filter { $0 != Self.me }
        let isGroup = group != nil || name.contains(", ") || others.count > 1 || groupEvents
        return MessagesFile.Chat(id: id, title: group ?? name, group: isGroup, people: others, messages: messages)
    }

    private mutating func handle(_ line: String, next: String?) {
        let atBoundary = Self.isBlank(previous)
        previous = line
        let nextHasText = !Self.isBlank(next ?? "")
        let stamp = Self.timeMatch(line)
        if let stamp, Self.isHeader(stamp), nextHasText {
            if let pending { push(pending.sender, message(pending)) }
            pending = Pending(t: timestamp(stamp))
            mode = .sender
            return
        }
        // Edit histories also start with "<time> <text>", but inside a message rather than between blank lines.
        if let stamp, atBoundary, !nextHasText {
            if let pending { push(pending.sender, message(pending)) }
            pending = nil
            if let text = stamp[8] {
                if Self.groupEvent.test(text) { groupEvents = true }
                let notice = announcement(timestamp(stamp), text)
                push(notice.sender, notice.message)
            }
            return
        }
        guard pending != nil, line != "Unable to format announcement!" else { return }
        if mode == .sender {
            pending?.sender = line
            mode = .body
            return
        }
        if mode == .tapbacks {
            if line.hasPrefix(Self.indent) {
                if let tapback = Self.tapback.match(line), let kind = tapback[1], let who = tapback[2] {
                    pending?.reactions.append([who, Self.tapbackEmoji[kind] ?? kind])
                }
                return
            }
            mode = .body
            if Self.isBlank(line) { return }
        }
        // Threaded replies are printed indented under the message they answer and again at top level; keep the latter.
        if mode == .reply {
            if Self.isBlank(line) || line.hasPrefix(Self.indent) { return }
            mode = .body
        }
        if line == "Tapbacks:" {
            mode = .tapbacks
        } else if line.hasPrefix(Self.indent), Self.timeMatch(String(line.dropFirst(Self.indent.count))) != nil {
            mode = .reply
        } else if line == "This message was deleted from the conversation!" {
            pending?.deleted = true
        } else if line != "This message responded to an earlier message." {
            pending?.lines.append(line)
        }
    }

    private mutating func push(_ sender: String, _ message: MessagesFile.Message?) {
        guard let message else { return }
        if !sender.isEmpty, !senders.contains(sender) { senders.append(sender) }
        for reaction in message.reactions ?? [] where !senders.contains(reaction[0]) {
            senders.append(reaction[0])
        }
        messages.append(message)
    }

    private func announcement(_ t: Double, _ text: String) -> (sender: String, message: MessagesFile.Message) {
        if let unsent = Self.unsent.match(text), let who = unsent[1] {
            let sender = who == "You" ? Self.me : who
            return (sender, MessagesFile.Message(t: t, from: sender == Self.me ? nil : sender, text: nil, kind: "deleted", reactions: nil))
        }
        return ("", MessagesFile.Message(t: t, from: nil, text: text, kind: "system", reactions: nil))
    }

    private func message(_ pending: Pending) -> MessagesFile.Message? {
        let from = pending.sender == Self.me ? nil : pending.sender
        if pending.deleted { return MessagesFile.Message(t: pending.t, from: from, text: nil, kind: "deleted", reactions: nil) }
        var lines = pending.lines.filter { !Self.expressive.test($0) && !Self.unsentPart.test($0) }
        let unsent = lines.count < pending.lines.count && pending.lines.contains { Self.unsentPart.test($0) }
        if let translated = lines.firstIndex(of: "Translated from:") { lines = Array(lines[(translated + 1)...]) }

        // An edit history is "<original time> <text>" followed by "Edited <n> later: <text>" rows; keep the final text.
        if let last = lines.lastIndex(where: { Self.edited.test($0) }) {
            lines = [Self.edited.remove(from: lines[last])] + lines[(last + 1)...]
        } else if let first = lines.first, let original = Self.timeMatch(first), let text = original[8], !Self.isHeader(original) {
            lines = [text] + lines.dropFirst()
        }

        var media: [String] = []
        var text: [String] = []
        for line in lines {
            if line == "Attachment missing!" {
                media.append("file")
            } else if Self.sticker.test(line) {
                media.append("sticker")
            } else if Self.attachment.test(line) {
                media.append(Self.mediaKind(line))
            } else {
                text.append(line)
            }
        }
        let body = text.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        if body.isEmpty && media.isEmpty {
            return unsent ? MessagesFile.Message(t: pending.t, from: from, text: nil, kind: "deleted", reactions: nil) : nil
        }
        return MessagesFile.Message(t: pending.t, from: from, text: body.isEmpty ? nil : body, kind: media.first, reactions: pending.reactions.isEmpty ? nil : pending.reactions)
    }

    private mutating func timestamp(_ stamp: [String?]) -> Double {
        let year = Int(stamp[3]!)!, month = Self.months.firstIndex(of: stamp[1]!)! + 1, day = Int(stamp[2]!)!
        let hour = Int(stamp[4]!)! % 12 + (stamp[7] == "PM" ? 12 : 0)
        let seconds = Double(Int(stamp[5]!)! * 60 + Int(stamp[6]!)!)
        let key = ((year * 12 + month) * 31 + day) * 24 + hour
        if let start = hourStarts[key] { return start + seconds }
        let start = calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour))?.timeIntervalSince1970 ?? 0
        hourStarts[key] = start
        return start + seconds
    }

    static func timeMatch(_ line: String) -> [String?]? {
        guard line.utf8.count >= 23, months.contains(String(line.prefix(3))) else { return nil }
        return time.match(line)
    }

    private static func isHeader(_ stamp: [String?]) -> Bool {
        guard let rest = stamp[8] else { return true }
        return readBy.test(rest)
    }

    private static func isBlank(_ text: String) -> Bool {
        text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private static func mediaKind(_ path: String) -> String {
        let file = path.lowercased()
        let ext = (file as NSString).pathExtension
        if ext == "gif" { return "gif" }
        if ["jpg", "jpeg", "png", "heic", "heif", "webp", "tif", "tiff"].contains(ext) { return "photo" }
        if ["mov", "mp4", "m4v"].contains(ext) { return "video" }
        if ["caf", "m4a", "mp3", "amr", "aac", "wav"].contains(ext) { return "audio" }
        if file.hasSuffix(".loc.vcf") { return "location" }
        if ext == "vcf" { return "contact" }
        return "file"
    }
}

/// An NSRegularExpression with JavaScript-like test and match, for checking one line at a time.
struct Pattern {
    private let regex: NSRegularExpression

    init(_ pattern: String) {
        regex = try! NSRegularExpression(pattern: pattern)
    }

    func test(_ text: String) -> Bool {
        regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    /// Every group of the first match, nil for a group that took no part.
    func match(_ text: String) -> [String?]? {
        guard let result = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else { return nil }
        return (0..<result.numberOfRanges).map { Range(result.range(at: $0), in: text).map { String(text[$0]) } }
    }

    func remove(from text: String) -> String {
        regex.stringByReplacingMatches(in: text, range: NSRange(text.startIndex..., in: text), withTemplate: "")
    }
}
