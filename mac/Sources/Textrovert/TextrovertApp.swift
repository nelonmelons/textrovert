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
    struct Saved {
        let file: URL
        let chats: Int
        let messages: Int
    }

    @Published var access = Exporter.access()
    @Published var saving = false
    @Published var error: String?
    @Published var saved: Saved?

    func checkAccess() {
        access = Exporter.access()
    }

    func openPrivacySettings() {
        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")!)
    }

    func showAppInFinder() {
        NSWorkspace.shared.activateFileViewerSelecting([Bundle.main.bundleURL])
    }

    func save() {
        saving = true
        error = nil
        Task {
            do {
                guard let binary = Bundle.main.url(forAuxiliaryExecutable: "imessage-exporter") else {
                    throw TextrovertError("imessage-exporter is missing from the app. Rebuild it with mac/build.sh.")
                }
                let downloads = try FileManager.default.url(for: .downloadsDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                let file = downloads.appending(path: "Textrovert Messages.textrovert")
                let counts = try await Exporter(binary: binary).saveMessagesFile(to: file)
                saved = Saved(file: file, chats: counts.chats, messages: counts.messages)
                airDrop()
            } catch {
                self.error = error.localizedDescription
            }
            saving = false
        }
    }

    func airDrop() {
        guard let saved else { return }
        if let airDrop = NSSharingService(named: .sendViaAirDrop), airDrop.canPerform(withItems: [saved.file]) {
            airDrop.perform(withItems: [saved.file])
        } else {
            showFile()
        }
    }

    func showFile() {
        guard let saved else { return }
        NSWorkspace.shared.activateFileViewerSelecting([saved.file])
    }
}

struct ContentView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Textrovert").font(.largeTitle.bold())
                Text("Get your iMessage stats on your iPhone in three steps.")
                    .foregroundStyle(.secondary)
            }
            Step(number: 1, title: "Allow access to Messages", done: model.access == .granted, enabled: true) {
                accessStep
            }
            Step(number: 2, title: "Save your messages for iPhone", done: model.saved != nil && !model.saving, enabled: model.access == .granted) {
                saveStep
            }
            Step(number: 3, title: "Open them on your iPhone", done: false, enabled: model.saved != nil) {
                Text("On your iPhone, accept the AirDrop and choose **Textrovert**. Your stats show up on the Today screen, and each of your top people opens a Wrapped.\n\nNo AirDrop? Send the file any way you like and save it to Files, then tap **Import messages file** in Textrovert.")
            }
            if let error = model.error {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                    .textSelection(.enabled)
            }
        }
        .padding(28)
        .frame(width: 580)
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
                    Button("Show Textrovert in Finder") { model.showAppInFinder() }
                }
            }
        }
    }

    @ViewBuilder private var saveStep: some View {
        VStack(alignment: .leading, spacing: 10) {
            if model.saving {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("Exporting your messages. Big histories take a minute or two…")
                }
            } else if let saved = model.saved {
                Text("Saved **\(saved.messages.formatted()) messages** from **\(saved.chats.formatted()) chats** to **\(saved.file.lastPathComponent)** in Downloads.")
                HStack {
                    Button("AirDrop to iPhone") { model.airDrop() }
                        .buttonStyle(.borderedProminent)
                    Button("Show in Finder") { model.showFile() }
                    Button("Save Again") { model.save() }
                }
            } else {
                Text("Textrovert exports every conversation with imessage-exporter and saves them as one file in your Downloads folder. Nothing is uploaded.")
                Button("Save for iPhone") { model.save() }
                    .buttonStyle(.borderedProminent)
            }
        }
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
