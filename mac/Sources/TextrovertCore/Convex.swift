import Foundation

/// Calls the Textrovert backend through Convex's HTTP API (https://docs.convex.dev/http-api).
public struct Convex {
    public let url: URL

    public init(url: URL) {
        self.url = url
    }

    public func query<T: Decodable>(_ path: String, _ args: [String: Any]) async throws -> T {
        try await call("query", path, args)
    }

    public func mutation<T: Decodable>(_ path: String, _ args: [String: Any]) async throws -> T {
        try await call("mutation", path, args)
    }

    public func action<T: Decodable>(_ path: String, _ args: [String: Any]) async throws -> T {
        try await call("action", path, args)
    }

    /// Uploads a zipped export the same way the phone app uploads one, then reports its processing status until it
    /// is done or failed.
    public func upload(zip: URL, ownerKey: String, onStatus: @MainActor (Upload) -> Void) async throws -> Upload {
        let uploadUrl: String = try await mutation("uploads:generateUploadUrl", ["ownerKey": ownerKey])
        guard let target = URL(string: uploadUrl) else { throw TextrovertError("The backend returned an invalid upload URL.") }
        var request = URLRequest(url: target)
        request.httpMethod = "POST"
        request.setValue("application/zip", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await URLSession.shared.upload(for: request, fromFile: zip)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200,
              let storageId = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["storageId"] as? String
        else { throw TextrovertError("The upload failed (HTTP \(status)).") }
        let uploadId: String = try await mutation("uploads:start", [
            "ownerKey": ownerKey,
            "storageId": storageId,
            "fileName": zip.lastPathComponent,
            "timeZone": TimeZone.current.identifier,
        ])
        while true {
            let upload: Upload? = try await query("uploads:get", ["ownerKey": ownerKey, "uploadId": uploadId])
            guard let upload else { throw TextrovertError("The backend lost track of the upload.") }
            await onStatus(upload)
            if upload.isFinished { return upload }
            try await Task.sleep(for: .seconds(1.5))
        }
    }

    private func call<T: Decodable>(_ kind: String, _ path: String, _ args: [String: Any]) async throws -> T {
        var request = URLRequest(url: url.appending(path: "api/" + kind))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let payload: [String: Any] = ["path": path, "args": args, "format": "json"]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard let body = try? JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed) as? [String: Any] else {
            throw TextrovertError("Unexpected response from \(path) (HTTP \(status)).")
        }
        guard body["status"] as? String == "success" else {
            throw TextrovertError((body["errorData"] as? String) ?? (body["errorMessage"] as? String) ?? "\(path) failed (HTTP \(status)).")
        }
        let value = try JSONSerialization.data(withJSONObject: body["value"] ?? NSNull(), options: .fragmentsAllowed)
        return try JSONDecoder().decode(T.self, from: value)
    }
}

public struct TextrovertError: LocalizedError {
    public let errorDescription: String?

    public init(_ message: String) {
        errorDescription = message
    }
}

/// The parts of an upload (`uploads:get`) the app shows while the backend stores and analyzes it.
public struct Upload: Decodable {
    public let status: String
    public let progress: Counts
    public let warnings: [String]
    public let error: String?

    public struct Counts: Decodable {
        public let messagesParsed: Double
        public let messagesStored: Double
        public let conversations: Double
        public let conversationsAnalyzed: Double
    }

    public var isFinished: Bool { status == "done" || status == "failed" }

    public var summary: String {
        let p = progress
        switch status {
        case "parsing": return "Reading messages: \(n(p.messagesParsed)) read, \(n(p.messagesStored)) new, \(n(p.conversations)) chats"
        case "analyzing": return "Analyzing chats: \(n(p.conversationsAnalyzed)) of \(n(p.conversations))"
        case "done": return "Done: \(n(p.messagesParsed)) messages in \(n(p.conversations)) chats, \(n(p.messagesStored)) of them new."
        case "failed": return "Processing failed: " + (error ?? "unknown error")
        default: return "Waiting for the backend…"
        }
    }

    private func n(_ value: Double) -> String { Int(value).formatted() }
}
