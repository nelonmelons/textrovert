import Foundation

/// Caches generated editions per owner, conversation and visible date range so reopening shows the same edition.
final class WrappedEditionStore {
    struct Session: Codable, Equatable {
        var editions: [WrappedEdition] = []
        var currentIndex = 0
        var carriedSeen: [String] = []

        var seenSourceIDs: Set<String> { Set(carriedSeen).union(editions.flatMap { $0.sourceMessageIDs }) }
    }

    static let shared = WrappedEditionStore()

    private let defaults: UserDefaults
    private let storageKey: String
    private var sessions: [String: Session]

    init(defaults: UserDefaults = .standard, storageKey: String = "textrovert.wrapped.sessions.v1") {
        self.defaults = defaults
        self.storageKey = storageKey
        sessions = defaults.data(forKey: storageKey).flatMap { try? JSONDecoder().decode([String: Session].self, from: $0) } ?? [:]
    }

    static func key(ownerID: String, conversationID: String, range: WrappedDateRange) -> String {
        "\(ownerID)|\(conversationID)|\(range.cacheKey)"
    }

    func session(for key: String) -> Session { sessions[key] ?? Session() }

    func update(_ key: String, _ change: (inout Session) -> Void) {
        var session = sessions[key] ?? Session()
        change(&session)
        sessions[key] = session
        if let data = try? JSONEncoder().encode(sessions) { defaults.set(data, forKey: storageKey) }
    }

    func removeAll() {
        sessions = [:]
        defaults.removeObject(forKey: storageKey)
    }
}
