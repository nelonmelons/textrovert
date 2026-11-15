import AppKit
import SwiftUI
import TextrovertCore

@main
struct TextrovertApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        Window("Textrovert", id: "main") {
            ContentView(model: model)
        }
        .windowResizability(.contentSize)
    }
}

@MainActor
final class AppModel: ObservableObject {
    @Published var access = Exporter.access()
    @Published var working = false
    @Published var status = ""
    @Published var error: String?
    @Published var lastUpload: Upload?
    @Published var query = ""
    @Published var results: [SearchHit]?
    @Published var searching = false
    @Published private(set) var ownerKey = Keychain.ownerKey

    private let convex = Convex(url: URL(string: UserDefaults.standard.string(forKey: "backend") ?? "https://wry-bandicoot-379.convex.cloud")!)

    func checkAccess() {
        access = Exporter.access()
    }

    func openPrivacySettings() {
        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")!)
    }

    func showInFinder() {
        NSWorkspace.shared.activateFileViewerSelecting([Bundle.main.bundleURL])
    }

    func copyAccountKey() {
        guard let ownerKey else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(ownerKey, forType: .string)
    }

    func loadLastUpload() async {
        guard let ownerKey, (try? await convex.accountExists(ownerKey: ownerKey)) == true else { return }
        lastUpload = try? await convex.lastUpload(ownerKey: ownerKey)
    }

    func upload() {
        working = true
        error = nil
        results = nil
        Task {
            do {
                let ownerKey = try await account()
                guard let binary = Bundle.main.url(forAuxiliaryExecutable: "imessage-exporter") else {
                    throw TextrovertError("imessage-exporter is missing from the app. Rebuild it with mac/build.sh.")
                }
                status = "Exporting your messages. Big histories take a minute or two…"
                let export = try await Exporter(binary: binary).exportZip()
                defer { try? FileManager.default.removeItem(at: export.folder) }
                status = "Uploading \(export.conversations.formatted()) conversations…"
                let upload = try await convex.upload(zip: export.zip, ownerKey: ownerKey) { self.status = $0.summary }
                if upload.status == "failed" { throw TextrovertError(upload.summary) }
                lastUpload = upload
            } catch {
                self.error = error.localizedDescription
            }
            status = ""
            working = false
        }
    }

    func search() {
        let text = query.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty, let ownerKey else { return }
        searching = true
        error = nil
        Task {
            do {
                results = try await convex.search(ownerKey: ownerKey, text: text)
            } catch {
                self.error = error.localizedDescription
            }
            searching = false
        }
    }

    private func account() async throws -> String {
        if let ownerKey, try await convex.accountExists(ownerKey: ownerKey) { return ownerKey }
        status = "Creating your account…"
        let created: String = try await convex.action("owners:create", [:])
        Keychain.ownerKey = created
        ownerKey = created
        return created
    }
}

struct ContentView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Textrovert").font(.largeTitle.bold())
                Text("Bring your iMessage history into Textrovert in three steps.")
                    .foregroundStyle(.secondary)
            }
            Step(number: 1, title: "Allow access to Messages", done: model.access == .granted, enabled: true) {
                accessStep
            }
            Step(number: 2, title: "Upload your messages", done: model.lastUpload != nil && !model.working, enabled: model.access == .granted) {
                uploadStep
            }
            Step(number: 3, title: "Search your messages", done: false, enabled: model.lastUpload != nil) {
                searchStep
            }
            if let error = model.error {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                    .textSelection(.enabled)
            }
            if model.ownerKey != nil {
                HStack {
                    Spacer()
                    Button("Copy Account Key") { model.copyAccountKey() }
                        .buttonStyle(.link)
                        .font(.caption)
                }
            }
        }
        .padding(28)
        .frame(width: 580)
        .task { await model.loadLastUpload() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            model.checkAccess()
        }
    }

    @ViewBuilder private var accessStep: some View {
        switch model.access {
        case .granted:
            Label("Textrovert can read your messages.", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
        case .noDatabase:
            Text("This Mac has no Messages history yet. Sign in to Messages with your Apple ID, let it sync, then reopen Textrovert.")
        case .denied:
            VStack(alignment: .leading, spacing: 10) {
                Text("macOS only lets Textrovert read your messages once you give it Full Disk Access.")
                Text("1. Click **Open Privacy Settings**.\n2. Turn on **Textrovert**. If it isn't in the list, click **+** and choose Textrovert in Applications.\n3. When macOS asks, click **Quit & Reopen**.")
                HStack {
                    Button("Open Privacy Settings") { model.openPrivacySettings() }
                        .buttonStyle(.borderedProminent)
                    Button("Show Textrovert in Finder") { model.showInFinder() }
                }
            }
        }
    }

    @ViewBuilder private var uploadStep: some View {
        VStack(alignment: .leading, spacing: 10) {
            if model.working {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text(model.status)
                }
            } else if let upload = model.lastUpload {
                Text("Uploaded **\(count(upload.progress.messagesParsed)) messages** from **\(count(upload.progress.conversations)) chats**\(finished(upload)).")
                Text("Upload again any time to add new messages. Messages already uploaded are skipped.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                Button("Upload Again") { model.upload() }
            } else {
                Text("Textrovert exports every conversation with imessage-exporter and uploads it to your private account. Nothing leaves this Mac until you click Upload.")
                Button("Upload Messages") { model.upload() }
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    @ViewBuilder private var searchStep: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                TextField("Search for a word or phrase", text: $model.query)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { model.search() }
                Button("Search") { model.search() }
                    .disabled(model.searching || model.query.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if model.searching {
                ProgressView().controlSize(.small)
            } else if let results = model.results {
                if results.isEmpty {
                    Text("No messages match that.").foregroundStyle(.secondary)
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(results) { hit in
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack {
                                        Text(hit.conversation.title.isEmpty ? "Untitled chat" : hit.conversation.title).bold()
                                        Spacer()
                                        Text(hit.date.formatted(date: .abbreviated, time: .shortened))
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Text(highlighted(hit)).textSelection(.enabled)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                    .frame(height: 300)
                }
            }
        }
    }

    private func highlighted(_ hit: SearchHit) -> AttributedString {
        var text = AttributedString((hit.fromMe ? "You" : hit.sender) + ": ")
        text.foregroundColor = .secondary
        for (index, part) in hit.snippet.components(separatedBy: "**").enumerated() {
            var piece = AttributedString(part)
            if index % 2 == 1 { piece.inlinePresentationIntent = .stronglyEmphasized }
            text += piece
        }
        return text
    }

    private func count(_ value: Double) -> String {
        Int(value).formatted()
    }

    private func finished(_ upload: Upload) -> String {
        guard let finishedAt = upload.finishedAt else { return "" }
        return " on " + Date(timeIntervalSince1970: finishedAt / 1000).formatted(date: .abbreviated, time: .shortened)
    }
}

struct Step<Content: View>: View {
    let number: Int
    let title: String
    let done: Bool
    let enabled: Bool
    @ViewBuilder let content: Content

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle().fill(done ? Color.green : enabled ? Color.accentColor : Color.secondary.opacity(0.4))
                if done {
                    Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
                } else {
                    Text("\(number)").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                }
            }
            .frame(width: 26, height: 26)
            VStack(alignment: .leading, spacing: 8) {
                Text(title).font(.title3.bold())
                if enabled {
                    content
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .opacity(enabled ? 1 : 0.5)
    }
}

/// The account key is the only credential to the user's data, so it lives in the login keychain.
enum Keychain {
    private static let item: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.textrovert.mac",
        kSecAttrAccount as String: "ownerKey",
    ]

    static var ownerKey: String? {
        get {
            var query = item
            query[kSecReturnData as String] = true
            var result: CFTypeRef?
            guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
            return String(data: data, encoding: .utf8)
        }
        set {
            SecItemDelete(item as CFDictionary)
            guard let newValue, !newValue.isEmpty else { return }
            var add = item
            add[kSecValueData as String] = Data(newValue.utf8)
            SecItemAdd(add as CFDictionary, nil)
        }
    }
}
