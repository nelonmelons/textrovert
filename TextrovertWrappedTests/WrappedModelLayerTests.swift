import XCTest
@testable import Textrovert

final class WrappedModelLayerTests: XCTestCase {
    let en = Locale(identifier: "en_US")
    let range = WrappedFixtures.defaultRange
    let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func edition(_ conversation: WrappedConversation, _ suggestions: [WrappedModelSuggestion], options: WrappedModelOptions = WrappedModelOptions(),
                         seen: Set<String> = []) -> WrappedOutcome {
        WrappedEngine.generate(
            conversation: conversation, ownerID: "emma", range: range, avoiding: seen, now: now, locale: en,
            provider: WrappedCombinedProvider(providers: [WrappedHeuristicProvider(), WrappedSuggestionProvider(suggestions: suggestions, options: options)]))
    }

    private func candidates(_ suggestions: [WrappedModelSuggestion], options: WrappedModelOptions = WrappedModelOptions(),
                            conversation: WrappedConversation = WrappedFixtures.theo) throws -> [WrappedCandidate] {
        let ctx = try XCTUnwrap(WrappedAnalysisContext(conversation: conversation, ownerID: "emma", range: range, locale: en))
        return WrappedSuggestionProvider(suggestions: suggestions, options: options).candidates(in: ctx)
    }

    private func s(_ kind: String, _ ids: [String], headline: String = "A moment", sensitive: Bool = false) -> WrappedModelSuggestion {
        WrappedModelSuggestion(kind: kind, messageIDs: ids, headline: headline, why: "Because.", sensitive: sensitive)
    }

    func testRulesAloneMissTheosMomentsAndTheStubFindsThem() throws {
        guard case .edition(let rules) = edition(WrappedFixtures.theo, []) else { return XCTFail() }
        XCTAssertEqual(rules.highlights.map(\.signal), [.datedInvitation])
        guard case .edition(let mixed) = edition(WrappedFixtures.theo, WrappedFixtures.theoStubSuggestions) else { return XCTFail() }
        XCTAssertEqual(mixed.highlights.count, 3)
        XCTAssertEqual(mixed.highlights.filter(\.isModelSuggestion).count, 2)
        XCTAssertEqual(Set(mixed.highlights.map(\.signal)), [.quotableLine, .runningJoke, .datedInvitation])
        XCTAssertFalse(mixed.highlights.first { $0.signal == .datedInvitation }!.isModelSuggestion)
        let saga = try XCTUnwrap(mixed.highlights.first { $0.signal == .runningJoke })
        XCTAssertEqual(saga.headline, "The bread maker saga")
        XCTAssertEqual(saga.sourceMessageIDs, ["theo-01", "theo-19", "theo-11"])
        XCTAssertEqual(saga.quantity?.value, "3")
        XCTAssertEqual(saga.quantity?.detail, "over 13 days")
        XCTAssertTrue(saga.why.hasPrefix("My read: "))
    }

    func testModelNeverSuppliesQuoteText() throws {
        guard case .edition(let e) = edition(WrappedFixtures.theo, WrappedFixtures.theoStubSuggestions) else { return XCTFail() }
        for h in e.highlights { for hq in h.quotes {
            let source = try XCTUnwrap(WrappedFixtures.theo.messages.first { $0.id == hq.quote.messageID })
            XCTAssertEqual(hq.quote.text, source.text)
            XCTAssertEqual(hq.quote.speakerID, source.senderID)
            XCTAssertEqual(hq.quote.sentAt, source.sentAt)
        } }
    }

    func testGateRejectsBadReferences() throws {
        XCTAssertTrue(try candidates([s("quotable", ["theo-99", "theo-05"])]).isEmpty, "fabricated id")
        XCTAssertTrue(try candidates([s("quotable", ["theo-06", "theo-05"])]).isEmpty, "out of time order")
        XCTAssertTrue(try candidates([s("quotable", ["theo-05", "theo-05"])]).isEmpty, "duplicate id")
        XCTAssertTrue(try candidates([s("quotable", ["theo-04", "theo-06"])]).isEmpty, "who-said-it needs different speakers")
        XCTAssertTrue(try candidates([s("twist", ["theo-01", "theo-02"])]).isEmpty, "twist needs three ids")
        XCTAssertTrue(try candidates([s("callback", ["theo-04", "theo-06"])]).isEmpty, "callback needs two different days")
        XCTAssertTrue(try candidates([s("roast", ["theo-05", "theo-06"])]).isEmpty, "unknown kind")
        XCTAssertTrue(try candidates([s("quotable", ["theo-05", "theo-06"], headline: "This headline is far too long to show")]).isEmpty, "headline over 6 words")
        XCTAssertTrue(try candidates([s("quotable", ["theo-05", "theo-06"], headline: "Holy shit")]).isEmpty, "blocked word")
        XCTAssertTrue(try candidates([s("quotable", ["theo-05", "theo-06"], headline: "Mad at the sink")]).isEmpty, "conflict framing")
        XCTAssertEqual(try candidates([s("quotable", ["theo-05", "theo-06"])]).count, 1)
    }

    func testRangeAndTypeFilters() throws {
        let noah = WrappedFixtures.noah
        XCTAssertTrue(try candidates([s("quotable", ["noah-01", "noah-02"])], conversation: noah).isEmpty, "outside the visible range")
        XCTAssertTrue(try candidates([s("plan", ["mia-43", "mia-44"])], conversation: WrappedFixtures.mia).isEmpty, "system message")
        XCTAssertTrue(try candidates([s("plan", ["mia-44", "mia-45"])], conversation: WrappedFixtures.mia).isEmpty, "undated message")
    }

    func testSensitiveFlagsAndClassifierAlwaysWin() throws {
        XCTAssertTrue(try candidates([s("swerve", ["theo-07", "theo-08"], sensitive: true)]).isEmpty, "model's own sensitive flag")
        let conflict = s("twist", ["theo-15", "theo-16", "theo-17"])
        XCTAssertTrue(try candidates([conflict]).isEmpty)
        XCTAssertTrue(try candidates([conflict], options: WrappedModelOptions(includeWarmMoments: true, allowAffectionateTeasing: true)).isEmpty,
                      "conflict stays out even with both settings on")
    }

    func testTeasingIsOffByDefaultAndOptIn() throws {
        let tease = s("quotable", ["theo-13", "theo-14"])
        XCTAssertTrue(try candidates([tease]).isEmpty)
        XCTAssertEqual(try candidates([tease], options: WrappedModelOptions(allowAffectionateTeasing: true)).count, 1)
    }

    func testWarmMomentsAreOffByDefaultAndOptIn() throws {
        let warm = s("warm", ["theo-17", "theo-18"])
        XCTAssertTrue(try candidates([warm]).isEmpty)
        let on = try candidates([warm], options: WrappedModelOptions(includeWarmMoments: true))
        XCTAssertEqual(on.map(\.signal), [.warmMoment])
        guard case .edition(let e) = edition(WrappedFixtures.theo, [warm], options: WrappedModelOptions(includeWarmMoments: true)) else { return XCTFail() }
        XCTAssertTrue(e.highlights.contains { $0.signal == .warmMoment })
    }

    func testAtMostTwoModelCardsAndRulesKeptWhenAvailable() throws {
        let many = [
            s("callback", ["theo-01", "theo-11", "theo-19"]),
            s("quotable", ["theo-05", "theo-06"]),
            s("swerve", ["theo-10", "theo-11"]),
            s("plan", ["theo-02", "theo-03"])
        ]
        guard case .edition(let e) = edition(WrappedFixtures.theo, many) else { return XCTFail() }
        XCTAssertLessThanOrEqual(e.highlights.filter(\.isModelSuggestion).count, 2)
        XCTAssertTrue(e.highlights.contains { !$0.isModelSuggestion })
        let ids = e.highlights.flatMap(\.sourceMessageIDs)
        XCTAssertEqual(ids.count, Set(ids).count)
    }

    func testSelectCapAndRuleGuaranteeDirectly() {
        func h(_ id: String, _ signal: WrappedSignal, _ score: Double, model: Bool, src: [String]) -> WrappedHighlight {
            WrappedHighlight(id: id, presentation: .exchange, signal: signal, headline: id, prompt: "", why: "", quotes: [], quantity: nil, figure: .none,
                             sourceMessageIDs: src, score: score, shareByDefault: true, suggestedByModel: model ? true : nil)
        }
        let picks = WrappedEngine.select([
            h("m1", .runningJoke, 9, model: true, src: ["a"]), h("m2", .quotableLine, 8, model: true, src: ["b"]),
            h("m3", .topicChange, 7, model: true, src: ["c"]), h("r1", .datedInvitation, 2.5, model: false, src: ["d"])
        ])
        XCTAssertEqual(Set(picks.map(\.id)), ["m1", "m2", "r1"])
        let twoModels = WrappedEngine.select([
            h("m1", .runningJoke, 9, model: true, src: ["a"]), h("m2", .runningJoke, 3.5, model: true, src: ["b"]),
            h("r1", .runningJoke, 2.5, model: false, src: ["c"])
        ])
        XCTAssertTrue(twoModels.contains { $0.id == "r1" }, "a fresh rule-based card is kept even when it would not otherwise qualify")
        XCTAssertEqual(WrappedEngine.select([h("m1", .runningJoke, 9, model: true, src: ["a"])]).map(\.id), ["m1"], "model-only when no rule exists")
    }

    func testUnseenSourcesStillApplyToModelSuggestions() {
        guard case .edition(let first) = edition(WrappedFixtures.theo, WrappedFixtures.theoStubSuggestions) else { return XCTFail() }
        let second = edition(WrappedFixtures.theo, WrappedFixtures.theoStubSuggestions, seen: first.sourceMessageIDs)
        if case .edition(let e) = second { XCTAssertTrue(first.sourceMessageIDs.isDisjoint(with: e.sourceMessageIDs)) }
    }

    func testMergeIsDeterministicForAFixedStub() {
        XCTAssertEqual(edition(WrappedFixtures.theo, WrappedFixtures.theoStubSuggestions), edition(WrappedFixtures.theo, WrappedFixtures.theoStubSuggestions))
    }

    func testPromptSendsOnlyEligibleMessages() throws {
        let p = try XCTUnwrap(WrappedModelPrompt.make(conversation: WrappedFixtures.theo, ownerID: "emma", range: range, avoiding: ["theo-05"], options: WrappedModelOptions()))
        XCTAssertFalse(p.messageIDs.contains("theo-05"), "already seen")
        XCTAssertFalse(p.messageIDs.contains("theo-13"), "teasing is off")
        XCTAssertFalse(p.messageIDs.contains("theo-15"), "conflict")
        XCTAssertTrue(p.messageIDs.contains("theo-14"))
        XCTAssertFalse(p.instructions.contains("warm:"), "warm is off")
        let firstLine = try XCTUnwrap(p.chunks.first?.split(separator: "\n").first.map(String.init))
        XCTAssertTrue(firstLine.hasPrefix("theo-01 | Theo | Nov 2"), firstLine)
        XCTAssertTrue(firstLine.hasSuffix(" | I've decided to become a person who owns a bread maker."), firstLine)
        let teasing = try XCTUnwrap(WrappedModelPrompt.make(conversation: WrappedFixtures.theo, ownerID: "emma", range: range, avoiding: [],
                                                            options: WrappedModelOptions(includeWarmMoments: true, allowAffectionateTeasing: true)))
        XCTAssertTrue(teasing.messageIDs.contains("theo-13"))
        XCTAssertFalse(teasing.messageIDs.contains("theo-15"), "conflict is never sent")
        XCTAssertTrue(teasing.instructions.contains("warm:"))
        let mia = try XCTUnwrap(WrappedModelPrompt.make(conversation: WrappedFixtures.mia, ownerID: "emma", range: range, avoiding: [], options: WrappedModelOptions()))
        XCTAssertFalse(mia.messageIDs.contains("mia-43"), "system message")
        XCTAssertFalse(mia.messageIDs.contains("mia-45"), "undated")
        XCTAssertFalse(mia.messageIDs.contains("mia-02"), "outside range")
        XCTAssertNil(WrappedModelPrompt.make(conversation: WrappedFixtures.group, ownerID: "emma", range: range, avoiding: [], options: WrappedModelOptions()))
        let small = try XCTUnwrap(WrappedModelPrompt.make(conversation: WrappedFixtures.mia, ownerID: "emma", range: range, avoiding: [],
                                                          options: WrappedModelOptions(), chunkCharacters: 300, maxChunks: 2))
        XCTAssertEqual(small.chunks.count, 2)
        XCTAssertTrue(small.chunks.allSatisfy { $0.count <= 300 + 160 })
    }

    func testOptionsDefaultsAndStorage() throws {
        XCTAssertEqual(WrappedModelOptions(), WrappedModelOptions(includeWarmMoments: false, allowAffectionateTeasing: false))
        let suite = "wrapped-options-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        XCTAssertEqual(WrappedModelOptions.stored(in: defaults), WrappedModelOptions())
        defaults.set(true, forKey: WrappedModelOptions.allowTeasingKey)
        XCTAssertEqual(WrappedModelOptions.stored(in: defaults), WrappedModelOptions(includeWarmMoments: false, allowAffectionateTeasing: true))
    }

    func testCachedEditionsWithoutTheModelFlagStillDecode() throws {
        guard case .edition(let e) = edition(WrappedFixtures.mia, []) else { return XCTFail() }
        var json = try XCTUnwrap(String(data: JSONEncoder().encode(e), encoding: .utf8))
        json = json.replacingOccurrences(of: ",\"suggestedByModel\":true", with: "")
        XCTAssertFalse(json.contains("suggestedByModel"))
        XCTAssertEqual(try JSONDecoder().decode(WrappedEdition.self, from: Data(json.utf8)), e)
    }

    #if os(iOS)
    @MainActor
    private func waitUntil(_ timeout: TimeInterval = 5, _ condition: () -> Bool) async {
        let end = Date().addingTimeInterval(timeout)
        while !condition() && Date() < end { try? await Task.sleep(nanoseconds: 20_000_000) }
    }

    @MainActor
    private func model(_ source: WrappedModelSource?, timeout: TimeInterval = 2.5) throws -> (WrappedModel, () -> Void) {
        let suite = "wrapped-model-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let m = WrappedModel(conversation: WrappedFixtures.theo, ownerID: "emma", range: range, store: WrappedEditionStore(defaults: defaults),
                             locale: en, modelSource: source, modelTimeout: timeout)
        return (m, { defaults.removePersistentDomain(forName: suite) })
    }

    @MainActor
    func testNoModelSourceIsSynchronousAndRulesOnly() throws {
        let (m, cleanup) = try model(nil)
        defer { cleanup() }
        m.open()
        guard case .edition(let e) = m.phase else { return XCTFail("expected an immediate edition") }
        XCTAssertFalse(e.highlights.contains(where: \.isModelSuggestion))
    }

    @MainActor
    func testOnTimeModelSuggestionsShapeTheFirstEdition() async throws {
        let (m, cleanup) = try model(WrappedStubModelSource(fixed: WrappedFixtures.theoStubSuggestions))
        defer { cleanup() }
        m.open()
        XCTAssertEqual(m.phase, .loading)
        await waitUntil { m.phase != .loading }
        guard case .edition(let e) = m.phase else { return XCTFail() }
        XCTAssertEqual(e.highlights.filter(\.isModelSuggestion).count, 2)
    }

    @MainActor
    func testLateModelFallsBackToRulesAndFeedsAnotherEdition() async throws {
        let (m, cleanup) = try model(WrappedStubModelSource(fixed: WrappedFixtures.theoStubSuggestions, delay: 0.6), timeout: 0.1)
        defer { cleanup() }
        m.open()
        await waitUntil { m.phase != .loading }
        guard case .edition(let first) = m.phase else { return XCTFail() }
        XCTAssertFalse(first.highlights.contains(where: \.isModelSuggestion), "late model: rules-only edition")
        await waitUntil { !m.modelSuggestions.isEmpty }
        XCTAssertFalse(m.modelSuggestions.isEmpty)
        m.generate()
        await waitUntil(2) { if case .edition(let e) = m.phase { return e.number == 2 } else { return false } }
        guard case .edition(let second) = m.phase else { return XCTFail() }
        XCTAssertEqual(second.number, 2)
        XCTAssertTrue(second.highlights.contains(where: \.isModelSuggestion))
    }

    @MainActor
    func testFailingModelFallsBackToRules() async throws {
        struct Failing: WrappedModelSource {
            func suggestions(for prompt: WrappedModelPrompt) async throws -> [WrappedModelSuggestion] { throw CocoaError(.featureUnsupported) }
        }
        let (m, cleanup) = try model(Failing())
        defer { cleanup() }
        m.open()
        await waitUntil { m.phase != .loading }
        guard case .edition(let e) = m.phase else { return XCTFail() }
        XCTAssertEqual(e.highlights.map(\.signal), [.datedInvitation])
    }
    #endif
}
