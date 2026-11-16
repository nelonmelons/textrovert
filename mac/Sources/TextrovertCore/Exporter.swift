import Foundation

/// Runs imessage-exporter to write every conversation as a text file, then saves the export as the file the iPhone app
/// imports, or zips it for upload.
public struct Exporter {
    public static let messagesDatabase = URL(fileURLWithPath: NSHomeDirectory()).appending(path: "Library/Messages/chat.db")

    public enum Access { case granted, denied, noDatabase }

    /// Whether this process can read the Messages database. macOS only allows it with Full Disk Access.
    public static func access() -> Access {
        let fd = open(messagesDatabase.path, O_RDONLY)
        if fd >= 0 {
            close(fd)
            return .granted
        }
        return errno == ENOENT ? .noDatabase : .denied
    }

    public let binary: URL

    public init(binary: URL) {
        self.binary = binary
    }

    /// Exports every conversation and saves it to destination as the file the iPhone app imports. arguments are extra
    /// imessage-exporter flags.
    public func saveMessagesFile(to destination: URL, arguments: [String] = []) async throws -> (chats: Int, messages: Int) {
        let export = try await exportText(arguments: arguments)
        defer { try? FileManager.default.removeItem(at: export.folder) }
        let file = try MessagesFile(exportFolder: export.text)
        guard file.messageCount > 0 else { throw TextrovertError("imessage-exporter found no messages to save.") }
        try file.data().write(to: destination, options: .atomic)
        return (file.chats.count, file.messageCount)
    }

    /// Exports into a new private temporary folder and returns the zip inside it. The folder holds the user's whole
    /// message history, so callers delete it as soon as the upload ends. arguments are extra imessage-exporter flags.
    public func exportZip(arguments: [String] = []) async throws -> (folder: URL, zip: URL, conversations: Int) {
        let export = try await exportText(arguments: arguments)
        do {
            let zip = export.folder.appending(path: "imessage-export.zip")
            let log = export.folder.appending(path: "exporter.log")
            guard try await Self.run(URL(fileURLWithPath: "/usr/bin/ditto"), ["-c", "-k", export.text.path, zip.path], log: log) == 0 else {
                throw TextrovertError("Couldn't zip the export.")
            }
            try? FileManager.default.removeItem(at: export.text)
            return (export.folder, zip, export.conversations)
        } catch {
            try? FileManager.default.removeItem(at: export.folder)
            throw error
        }
    }

    /// Writes every conversation as a text file into a new private temporary folder, which callers delete when done.
    private func exportText(arguments: [String]) async throws -> (folder: URL, text: URL, conversations: Int) {
        let folder = FileManager.default.temporaryDirectory.appending(path: "textrovert-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        do {
            let export = folder.appending(path: "export")
            let log = folder.appending(path: "exporter.log")
            let status = try await Self.run(binary, ["-f", "txt", "-o", export.path, "--no-progress"] + arguments, log: log)
            guard status == 0 else {
                let output = (try? String(contentsOf: log, encoding: .utf8)) ?? ""
                throw TextrovertError("imessage-exporter failed: " + output.trimmingCharacters(in: .whitespacesAndNewlines).suffix(600))
            }
            let files = (try? FileManager.default.contentsOfDirectory(atPath: export.path)) ?? []
            let conversations = files.filter { $0.hasSuffix(".txt") && $0 != "orphaned.txt" }.count
            guard conversations > 0 else { throw TextrovertError("imessage-exporter found no conversations to export.") }
            try? FileManager.default.removeItem(at: export.appending(path: "orphaned.txt"))
            return (folder, export, conversations)
        } catch {
            try? FileManager.default.removeItem(at: folder)
            throw error
        }
    }

    private static func run(_ executable: URL, _ arguments: [String], log: URL) async throws -> Int32 {
        FileManager.default.createFile(atPath: log.path, contents: nil)
        let handle = try FileHandle(forWritingTo: log)
        let process = Process()
        process.executableURL = executable
        process.arguments = arguments
        process.standardOutput = handle
        process.standardError = handle
        return try await withCheckedThrowingContinuation { continuation in
            process.terminationHandler = { finished in
                try? handle.close()
                continuation.resume(returning: finished.terminationStatus)
            }
            do {
                try process.run()
            } catch {
                try? handle.close()
                continuation.resume(throwing: error)
            }
        }
    }
}
