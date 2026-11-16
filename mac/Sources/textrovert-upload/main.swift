import Foundation
import TextrovertCore

// Exports this Mac's iMessage history with imessage-exporter and uploads it, without the app's window. It runs the
// same code as Textrovert.app, which makes it the way to test or script the app's export.
//
//   textrovert-upload --backend https://<deployment>.convex.cloud (--owner-key <key> | --new)
//                     [--exporter <path>] [--db <chat.db>] [--contacts <contacts database>] [--search <query>]

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

var options: [String: String] = [:]
var createAccount = false
var rest = CommandLine.arguments.dropFirst().makeIterator()
while let argument = rest.next() {
    if argument == "--new" {
        createAccount = true
    } else if argument.hasPrefix("--"), let value = rest.next() {
        options[String(argument.dropFirst(2))] = value
    } else {
        fail("Unknown argument: " + argument)
    }
}

guard let backend = options["backend"].flatMap(URL.init(string:)) else {
    fail("usage: textrovert-upload --backend https://<deployment>.convex.cloud (--owner-key <key> | --new) [--exporter <path>] [--db <chat.db>] [--contacts <path>] [--search <query>]")
}
let here = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
let exporter = Exporter(binary: options["exporter"].map { URL(fileURLWithPath: $0) } ?? here.appending(path: "Textrovert.app/Contents/MacOS/imessage-exporter"))
var exporterArguments: [String] = []
if let db = options["db"] {
    exporterArguments += ["-p", db]
} else if Exporter.access() == .denied {
    fail("macOS blocked access to your messages. Turn on Full Disk Access for this terminal app in System Settings → Privacy & Security → Full Disk Access, then reopen it.")
}
if let contacts = options["contacts"] {
    exporterArguments += ["-n", contacts]
}

let convex = Convex(url: backend)
do {
    var ownerKey = options["owner-key"] ?? ""
    if ownerKey.isEmpty {
        guard createAccount else { fail("Pass --owner-key <key>, or --new to create an account.") }
        ownerKey = try await convex.action("owners:create", [:])
        print("Created an account. Its key is the only way back into this data:\n  " + ownerKey)
    } else if try await !convex.accountExists(ownerKey: ownerKey) {
        fail("There's no account with that key on " + backend.absoluteString + ".")
    }
    print("Exporting messages with imessage-exporter…")
    let export = try await exporter.exportZip(arguments: exporterArguments)
    print("Exported \(export.conversations) conversations. Uploading…")
    var shown = ""
    let upload: Upload
    do {
        upload = try await convex.upload(zip: export.zip, ownerKey: ownerKey) { upload in
            if upload.summary != shown {
                shown = upload.summary
                print(shown)
            }
        }
    } catch {
        try? FileManager.default.removeItem(at: export.folder)
        throw error
    }
    try? FileManager.default.removeItem(at: export.folder)
    upload.warnings.forEach { print("Note: " + $0) }
    if upload.status == "failed" { exit(1) }
    if let text = options["search"] {
        let hits = try await convex.search(ownerKey: ownerKey, text: text)
        print("Search \"\(text)\": \(hits.count) result(s)")
        for hit in hits {
            print("  " + hit.conversation.title + " | " + (hit.fromMe ? "You" : hit.sender) + ": " + hit.snippet)
        }
    }
} catch {
    fail(error.localizedDescription)
}
