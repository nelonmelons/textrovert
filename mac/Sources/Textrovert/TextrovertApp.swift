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
    @Published var backend = UserDefaults.standard.string(forKey: "backend") ?? "https://wry-bandicoot-379.convex.cloud" {
        didSet { UserDefaults.standard.set(backend, forKey: "backend") }
    }
    @Published var ownerKey = Keychain.ownerKey ?? "" {
        didSet { Keychain.ownerKey = ownerKey }
    }
    @Published var busy = false
    @Published var status = ""
    @Published var error: String?
    @Published var warnings: [String] = []

    func checkAccess() {
        access = Exporter.access()
    }

    func openFullDiskAccessSettings() {
        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")!)
    }

    func createAccount() {
        run {
            self.status = "Creating an account…"
            self.ownerKey = try await self.convex().action("owners:create", [:])
            self.status = "Account created."
        }
    }

    func exportAndUpload() {
        run {
            guard let binary = Bundle.main.url(forAuxiliaryExecutable: "imessage-exporter") else {
                throw TextrovertError("imessage-exporter is missing from the app. Rebuild it with mac/build.sh.")
            }
            let convex = try self.convex()
            self.status = "Exporting your messages…"
            let export = try await Exporter(binary: binary).exportZip()
            defer { try? FileManager.default.removeItem(at: export.folder) }
            self.status = "Uploading \(export.conversations) conversations…"
            let upload = try await convex.upload(zip: export.zip, ownerKey: self.ownerKey) { self.status = $0.summary }
            self.warnings = upload.warnings
            if upload.status == "failed" {
                self.status = ""
                throw TextrovertError(upload.summary)
            }
        }
    }

    private func convex() throws -> Convex {
        guard let url = URL(string: backend.trimmingCharacters(in: .whitespaces)), url.scheme == "https" else {
            throw TextrovertError("Enter the backend URL, like https://<deployment>.convex.cloud")
        }
        return Convex(url: url)
    }

    private func run(_ work: @escaping () async throws -> Void) {
        busy = true
        error = nil
        warnings = []
        Task {
            do {
                try await work()
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}

struct ContentView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        Form {
            Section("Full Disk Access") {
                switch model.access {
                case .granted:
                    Label("Textrovert can read your messages.", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                case .noDatabase:
                    Label("This Mac has no Messages history. Sign in to Messages first.", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                case .denied:
                    Text("macOS only lets Textrovert read your messages with Full Disk Access. Open the settings, turn on Textrovert (or add it with +), then quit and reopen Textrovert.")
                    HStack {
                        Button("Open Full Disk Access Settings") { model.openFullDiskAccessSettings() }
                        Button("Check Again") { model.checkAccess() }
                    }
                }
            }
            Section("Account") {
                TextField("Backend", text: $model.backend)
                TextField("Account key", text: $model.ownerKey)
                    .font(.system(.body, design: .monospaced))
                if model.ownerKey.isEmpty {
                    Button("Create Account") { model.createAccount() }
                        .disabled(model.busy)
                }
            }
            Section("Upload") {
                HStack {
                    Button("Export and Upload Messages") { model.exportAndUpload() }
                        .buttonStyle(.borderedProminent)
                        .disabled(model.access != .granted || model.ownerKey.isEmpty || model.busy)
                    if model.busy {
                        ProgressView().controlSize(.small)
                    }
                }
                if !model.status.isEmpty {
                    Text(model.status)
                }
                if let error = model.error {
                    Text(error).foregroundStyle(.red)
                }
                ForEach(model.warnings, id: \.self) { warning in
                    Text(warning).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 520)
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            model.checkAccess()
        }
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
