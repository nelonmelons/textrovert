import XCTest
@testable import Textrovert

final class WrappedEngineTests: XCTestCase {
    let en = Locale(identifier: "en_US")
    let range = WrappedFixtures.defaultRange
    let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func editions(_ conversation: WrappedConversation, range: WrappedDateRange? = nil, limit: Int = 6) -> [WrappedEdition] {
        var seen = Set<String>()
        var result: [WrappedEdition] = []
        for n in 1...limit {
            guard case .edition(let e) = WrappedEngine.generate(conversation: conversation, ownerID: "emma", range: range ?? self.range, avoiding: seen, number: n, now: now, locale: en) else { break }
            result.append(e)
            seen.formUnion(e.sourceMessageIDs)
        }
        return result
    }

    // MARK: Quote resolution and attribution

    func testEveryDisplayedQuoteResolvesToItsSourceMessage() {
        for conversation in [WrappedFixtures.mia, WrappedFixtures.sarah, WrappedFixtures.jules] {
            let all = editions(conversation)
            XCTAssertFalse(all.isEmpty)
            for edition in all {
                for highlight in edition.highlights {
                    for hq in highlight.quotes {
                        let source = conversation.messages.first { $0.id == hq.quote.messageID }
                        XCTAssertNotNil(source, hq.quote.messageID)
                        XCTAssertEqual(source?.senderID, hq.quote.speakerID)
                        XCTAssertEqual(conversation.participant(id: hq.quote.speakerID)?.name, hq.quote.speakerName)
                        XCTAssertTrue(source?.text.contains(hq.quote.text) == true)
                        XCTAssertEqual(source?.sentAt, hq.quote.sentAt)
                        XCTAssertTrue(edition.range.contains(hq.quote.sentAt))
                    }
                    for id in highlight.sourceMessageIDs { XCTAssertTrue(conversation.messages.contains { $0.id == id }) }
                }
            }
        }
    }

    func testTamperedClaimsAreRejected() {
        let c = WrappedFixtures.mia
        let good = WrappedClaim(role: .setup, messageID: "mia-20", speakerID: "emma", text: "I have located my shoes.")
        XCTAssertNotNil(WrappedEngine.resolve(good, in: c, range: range))
        XCTAssertNil(WrappedEngine.resolve(WrappedClaim(role: .setup, messageID: "mia-20", speakerID: "mia", text: good.text), in: c, range: range), "wrong speaker")
        XCTAssertNil(WrappedEngine.resolve(WrappedClaim(role: .setup, messageID: "mia-20", speakerID: "emma", text: "I have located my keys."), in: c, range: range), "altered text")
        XCTAssertNil(WrappedEngine.resolve(WrappedClaim(role: .setup, messageID: "mia-999", speakerID: "emma", text: good.text), in: c, range: range), "unknown id")
        XCTAssertNil(WrappedEngine.resolve(WrappedClaim(role: .setup, messageID: "mia-43", speakerID: "mia", text: "Mia named the chat Taco Hill"), in: c, range: range), "system message")
        XCTAssertNil(WrappedEngine.resolve(WrappedClaim(role: .setup, messageID: "mia-45", speakerID: "emma", text: "Dentist update pending."), in: c, range: range), "missing time")
        XCTAssertNil(WrappedEngine.resolve(WrappedClaim(role: .setup, messageID: "mia-02", speakerID: "emma", text: "Taco."), in: c, range: range), "outside range")
        let dup = WrappedConversation(id: "d", service: "iMessage", participants: c.participants, messages: [c.messages[19], c.messages[19]])
        XCTAssertNil(WrappedEngine.resolve(good, in: dup, range: range), "ambiguous duplicate ids")
    }

    func testGuessWithSameSpeakerOrFabricatedEvidenceIsNotDisplayed() {
        let c = WrappedFixtures.mia
        func candidate(reveal: String, speaker: String, evidence: [String]) -> WrappedCandidate {
            WrappedCandidate(
                signal: .quotableLine, presentation: .guess, headline: "Who said it?", prompt: "", why: "",
                claims: [WrappedClaim(role: .setup, messageID: "mia-20", speakerID: "emma", text: "I have located my shoes."),
                         WrappedClaim(role: .reveal, messageID: reveal, speakerID: speaker, text: c.messages.first { $0.id == reveal }!.text)],
                evidenceIDs: evidence, quantity: nil, figure: .none, score: 5, shareByDefault: true)
        }
        XCTAssertNotNil(WrappedEngine.highlight(from: candidate(reveal: "mia-21", speaker: "mia", evidence: ["mia-20", "mia-21"]), conversation: c, range: range))
        XCTAssertNil(WrappedEngine.highlight(from: candidate(reveal: "mia-22", speaker: "emma", evidence: ["mia-20", "mia-22"]), conversation: c, range: range), "reveal by the same speaker")
        XCTAssertNil(WrappedEngine.highlight(from: candidate(reveal: "mia-21", speaker: "mia", evidence: ["mia-20", "mia-21", "mia-404"]), conversation: c, range: range), "evidence id that does not exist")
    }

    // MARK: Date filtering

    func testRangeBoundariesAndFiltering() {
        let narrow = WrappedFixtures.range(11, 6, through: 11, 8)
        for e in editions(WrappedFixtures.mia, range: narrow) {
            for h in e.highlights { for hq in h.quotes {
                XCTAssertGreaterThanOrEqual(hq.quote.sentAt, narrow.start)
                XCTAssertLessThan(hq.quote.sentAt, narrow.end)
            } }
        }
        XCTAssertTrue(range.contains(range.start))
        XCTAssertFalse(range.contains(range.end))
        XCTAssertEqual(range.dayCount, 14)
        XCTAssertEqual(range.label(locale: en), "Nov 1 – 14")
    }

    // MARK: Reply gap counts

    func testReplyGapsFollowTheDefinition() throws {
        let s = try XCTUnwrap(WrappedEngine.replyGaps(conversation: WrappedFixtures.mia, ownerID: "emma", range: range))
        XCTAssertEqual(s.lateCount, 3)
        XCTAssertEqual(s.completedTurns, 14)
        XCTAssertEqual(s.openTurns, 1, "Hello?? at the end has no reply yet")
        XCTAssertEqual(s.skippedForMissingTime, 1, "the turn broken by an undated message")
        XCTAssertEqual(Set(s.lateGaps.map(\.replyMessageID)), ["mia-12", "mia-17", "mia-19"])
        XCTAssertTrue(s.lateGaps.contains { $0.seconds == 86400 && $0.replyMessageID == "mia-19" }, "exactly 24 hours counts")
        XCTAssertFalse(s.lateGaps.contains { $0.incomingMessageID == "mia-35" }, "23 h 59 min is not a late gap")
        XCTAssertFalse(s.lateGaps.contains { $0.replyMessageID == "mia-08" }, "turn began before the range")
        XCTAssertEqual(s.longest?.incomingMessageID, "mia-16", "measured from the last message of the turn")
        XCTAssertEqual(try XCTUnwrap(s.longest).seconds, WrappedFixtures.date(11, 5, 9, 40).timeIntervalSince(WrappedFixtures.date(11, 3, 20, 13)))
    }

    func testReplyGapsUseElapsedTimeAcrossDaylightSavingAndWiderRanges() throws {
        let wide = WrappedFixtures.range(10, 24, through: 11, 14)
        let s = try XCTUnwrap(WrappedEngine.replyGaps(conversation: WrappedFixtures.mia, ownerID: "emma", range: wide))
        XCTAssertEqual(s.lateCount, 4)
        let dst = try XCTUnwrap(s.lateGaps.first { $0.replyMessageID == "mia-08" })
        XCTAssertEqual(dst.seconds, WrappedFixtures.date(11, 1, 9, 0).timeIntervalSince(WrappedFixtures.date(10, 30, 22, 30)))
        XCTAssertEqual(dst.seconds, 127_800, "clocks fell back an hour on Nov 1")
    }

    func testReplyGapsExcludeGroupsAndForeignOwners() {
        XCTAssertNil(WrappedEngine.replyGaps(conversation: WrappedFixtures.group, ownerID: "emma", range: range))
        XCTAssertNil(WrappedEngine.replyGaps(conversation: WrappedFixtures.mia, ownerID: "nobody", range: range))
    }

    func testSingleLateReplyIsNotPresentedAsAGhostEra() throws {
        let s = try XCTUnwrap(WrappedEngine.replyGaps(conversation: WrappedFixtures.sarah, ownerID: "emma", range: range))
        XCTAssertEqual(s.lateCount, 1)
        XCTAssertFalse(editions(WrappedFixtures.sarah).flatMap(\.highlights).contains { $0.signal == .replyGaps })
    }

    func testGhostHighlightIsPrivateByDefaultAndOwnReplyOnly() throws {
        let ghost = try XCTUnwrap(editions(WrappedFixtures.mia)[0].highlights.first { $0.signal == .replyGaps })
        XCTAssertFalse(ghost.shareByDefault)
        XCTAssertEqual(ghost.quantity?.value, "3")
        XCTAssertEqual(ghost.quotes(.reveal).map(\.speakerID), Array(repeating: "emma", count: 3))
        XCTAssertEqual(ghost.quotes(.context).map(\.speakerID), Array(repeating: "mia", count: 3))
        guard case .gaps(let seconds) = ghost.figure else { return XCTFail("gap figure") }
        XCTAssertEqual(seconds.count, 3)
    }

    // MARK: Variety, regeneration and exhaustion

    func testTwoConversationsProduceDifferentEditions() {
        let a = editions(WrappedFixtures.mia)[0], b = editions(WrappedFixtures.sarah)[0]
        XCTAssertNotEqual(a.highlights.map(\.signal), b.highlights.map(\.signal))
        XCTAssertEqual(a.highlights.map(\.signal), [.quotableLine, .replyGaps, .runningJoke])
        XCTAssertEqual(b.highlights.map(\.signal), [.runningJoke, .topicChange, .lastLineTwist])
        XCTAssertTrue(a.sourceMessageIDs.allSatisfy { $0.hasPrefix("mia-") })
        XCTAssertTrue(b.sourceMessageIDs.allSatisfy { $0.hasPrefix("sarah-") })
        XCTAssertNotEqual(a.highlights.map(\.headline), b.highlights.map(\.headline))
    }

    func testAnotherEditionUsesOnlyUnseenSourcesUntilExhausted() {
        for conversation in [WrappedFixtures.mia, WrappedFixtures.sarah] {
            let all = editions(conversation)
            XCTAssertGreaterThanOrEqual(all.count, 2)
            var seen = Set<String>()
            for e in all {
                XCTAssertTrue(seen.isDisjoint(with: e.sourceMessageIDs), "edition \(e.number) repeated a source message")
                seen.formUnion(e.sourceMessageIDs)
                XCTAssertLessThanOrEqual(e.highlights.count, 3)
                let ids = e.highlights.flatMap(\.sourceMessageIDs)
                XCTAssertEqual(ids.count, Set(ids).count, "highlights inside one edition share a source")
            }
            let next = WrappedEngine.generate(conversation: conversation, ownerID: "emma", range: range, avoiding: seen, number: all.count + 1, locale: en)
            guard case .exhausted(let count, let wider) = next else { return XCTFail("expected exhaustion, got \(next)") }
            XCTAssertEqual(count, seen.count)
            XCTAssertNotNil(wider)
            XCTAssertLessThan(wider!.start, range.start)
        }
    }

    func testWiderRangeWithCarriedSeenSurfacesOnlyNewMaterial() throws {
        let c = WrappedFixtures.mia
        let seen = editions(c).reduce(into: Set<String>()) { $0.formUnion($1.sourceMessageIDs) }
        guard case .exhausted(_, let wider?) = WrappedEngine.generate(conversation: c, ownerID: "emma", range: range, avoiding: seen, number: 4, locale: en) else { return XCTFail() }
        let result = WrappedEngine.generate(conversation: c, ownerID: "emma", range: wider, avoiding: seen, number: 1, now: now, locale: en)
        guard case .edition(let e) = result else { return XCTFail("the older October messages should add a moment: \(result)") }
        XCTAssertTrue(seen.isDisjoint(with: e.sourceMessageIDs))
        XCTAssertTrue(e.highlights.flatMap(\.quotes).contains { $0.quote.sentAt < range.start })
        XCTAssertNil(WrappedEngine.widerRange(for: c, current: wider))
    }

    func testGenerationIsDeterministic() {
        let a = WrappedEngine.generate(conversation: WrappedFixtures.sarah, ownerID: "emma", range: range, now: now, locale: en)
        let b = WrappedEngine.generate(conversation: WrappedFixtures.sarah, ownerID: "emma", range: range, now: now, locale: en)
        XCTAssertEqual(a, b)
    }

    // MARK: Evidence-backed quantities

    func testRunningJokeCountsAndTimelineComeFromTheMessages() throws {
        let joke = try XCTUnwrap(editions(WrappedFixtures.mia)[0].highlights.first { $0.signal == .runningJoke })
        XCTAssertEqual(joke.headline, "“define” keeps coming back")
        XCTAssertEqual(joke.quantity?.value, "4")
        XCTAssertEqual(Set(joke.sourceMessageIDs), ["mia-13", "mia-23", "mia-34", "mia-40"])
        guard case .occurrences(let dates) = joke.figure else { return XCTFail() }
        XCTAssertEqual(dates, ["mia-13", "mia-23", "mia-34", "mia-40"].map { id in WrappedFixtures.mia.messages.first { $0.id == id }!.sentAt! })
        XCTAssertEqual(joke.quantity?.detail, "over 11 days")
    }

    func testBusiestDayIsCountedFromTimestamps() throws {
        var rows: [WrappedMessage] = []
        for i in 0..<7 { rows.append(WrappedMessage(id: "b-\(i)", senderID: i % 2 == 0 ? "emma" : "kai", text: "message \(i)", sentAt: WrappedFixtures.date(11, 3, 9 + i, 0))) }
        rows.append(WrappedMessage(id: "b-7", senderID: "kai", text: "later", sentAt: WrappedFixtures.date(11, 5, 9, 0)))
        let c = WrappedConversation(id: "kai", service: "iMessage", participants: [WrappedFixtures.owner, WrappedParticipant(id: "kai", name: "Kai Moss")], messages: rows)
        let ctx = try XCTUnwrap(WrappedAnalysisContext(conversation: c, ownerID: "emma", range: range, locale: en))
        let found = try XCTUnwrap(WrappedHeuristicProvider().busiestDay(ctx).first)
        XCTAssertEqual(found.quantity?.value, "7")
        guard case .dailyCounts(let counts, let peak, _) = found.figure else { return XCTFail() }
        XCTAssertEqual(peak, 2)
        XCTAssertEqual(counts[2], 7)
        XCTAssertEqual(counts[4], 1)
        XCTAssertEqual(counts.reduce(0, +), 8)
    }

    // MARK: Sparse and empty

    func testSparseConversationGivesOneHonestCard() throws {
        let all = editions(WrappedFixtures.jules)
        XCTAssertEqual(all.count, 1)
        XCTAssertEqual(all[0].highlights.count, 1)
        XCTAssertTrue(all[0].isShortRecap)
        XCTAssertEqual(all[0].highlights[0].quotes(.punchline).first?.text, "Yes, count me in.")
        let next = WrappedEngine.generate(conversation: WrappedFixtures.jules, ownerID: "emma", range: range, avoiding: all[0].sourceMessageIDs, number: 2, locale: en)
        XCTAssertEqual(next, .exhausted(seenCount: 2, widerRange: nil))
    }

    func testEmptyStatesAreHonest() throws {
        XCTAssertEqual(WrappedEngine.generate(conversation: WrappedFixtures.priya, ownerID: "emma", range: range, locale: en),
                       .empty(.noHighlights(eligibleMessages: 3), widerRange: nil))
        guard case .empty(.noMessagesInRange(let outside), let wider?) = WrappedEngine.generate(conversation: WrappedFixtures.noah, ownerID: "emma", range: range, locale: en) else { return XCTFail() }
        XCTAssertEqual(outside, 2)
        XCTAssertTrue(wider.contains(WrappedFixtures.date(10, 2, 15, 0)))
        XCTAssertEqual(WrappedEngine.generate(conversation: WrappedFixtures.group, ownerID: "emma", range: range, locale: en), .empty(.unsupportedConversation, widerRange: nil))
        XCTAssertEqual(WrappedEngine.generate(conversation: WrappedFixtures.mia, ownerID: "stranger", range: range, locale: en), .empty(.unsupportedConversation, widerRange: nil))
    }

    // MARK: Sensitive content

    func testSensitiveConflictAndRoastsAreExcludedByDefault() {
        let mia = editions(WrappedFixtures.mia), sarah = editions(WrappedFixtures.sarah)
        XCTAssertEqual(mia[0].leftOutCount, 3)
        XCTAssertEqual(sarah[0].leftOutCount, 2)
        let miaSources = mia.reduce(into: Set<String>()) { $0.formUnion($1.sourceMessageIDs) }
        let sarahSources = sarah.reduce(into: Set<String>()) { $0.formUnion($1.sourceMessageIDs) }
        XCTAssertTrue(miaSources.isDisjoint(with: ["mia-28", "mia-32", "mia-37"]))
        XCTAssertTrue(sarahSources.isDisjoint(with: ["sarah-14", "sarah-22"]))
    }

    func testClassifierDistinguishesRoastOfOtherFromBanterAboutYourself() {
        XCTAssertEqual(WrappedText.sensitivity(of: "mia you absolute clown", fromOwner: true, friendFirstName: "Mia"), .roastOfOther)
        XCTAssertNil(WrappedText.sensitivity(of: "I am such a clown today", fromOwner: true, friendFirstName: "Mia"))
        XCTAssertEqual(WrappedText.sensitivity(of: "I wish you'd told me sooner", fromOwner: false, friendFirstName: "Mia"), .conflict)
        XCTAssertEqual(WrappedText.sensitivity(of: "can you venmo me", fromOwner: false, friendFirstName: "Mia"), .privateTopic)
        XCTAssertNil(WrappedText.sensitivity(of: "Define 'mostly.'", fromOwner: true, friendFirstName: "Mia"))
    }

    // MARK: Cache and reopen

    func testEditionsSurviveReopenAndRevalidateAgainstSource() throws {
        let suite = "wrapped-tests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let all = editions(WrappedFixtures.mia)
        let key = WrappedEditionStore.key(ownerID: "emma", conversationID: "mia-chen", range: range)
        let store = WrappedEditionStore(defaults: defaults)
        store.update(key) { $0.editions = all; $0.currentIndex = 1 }

        let reopened = WrappedEditionStore(defaults: defaults).session(for: key)
        XCTAssertEqual(reopened.editions, all)
        XCTAssertEqual(reopened.currentIndex, 1)
        XCTAssertEqual(reopened.seenSourceIDs, all.reduce(into: Set<String>()) { $0.formUnion($1.sourceMessageIDs) })
        XCTAssertEqual(WrappedEditionStore(defaults: defaults).session(for: "other").editions, [])

        let edited = WrappedConversation(id: "mia-chen", service: "iMessage", participants: WrappedFixtures.mia.participants,
            messages: WrappedFixtures.mia.messages.map { $0.id == "mia-20" ? WrappedMessage(id: "mia-20", senderID: "emma", text: "I found my keys.", sentAt: $0.sentAt) : $0 })
        let checked = WrappedEngine.revalidate(all[0], in: edited)
        XCTAssertFalse(checked.highlights.contains { $0.signal == .quotableLine }, "an edited source no longer verifies")
        XCTAssertEqual(WrappedEngine.revalidate(all[0], in: WrappedFixtures.mia), all[0])
    }

    // MARK: Share preview

    func testSharePreviewContainsOnlySelectedExcerpts() throws {
        let e = editions(WrappedFixtures.mia)[0]
        let defaults = Set(e.highlights.filter(\.shareByDefault).map(\.id))
        XCTAssertEqual(defaults.count, 2)
        let text = WrappedShareText.build(edition: e, selected: defaults, owner: WrappedFixtures.owner, friend: WrappedFixtures.mia.participants[1], locale: en)
        XCTAssertTrue(text.hasPrefix("Wrapped: Emma & Mia · Nov 1 – 14\n\nWho said it?\n“I have located my shoes.” — Emma, Nov 6"))
        XCTAssertTrue(text.contains("“lmao a legend. Take a victory lap.” — Mia Chen, Nov 6"))
        XCTAssertTrue(text.contains("“Define 'on my way.' I'm at the door and you're clearly not.” — Mia Chen"))
        XCTAssertTrue(text.contains("“Define 'mostly.'” — Emma"))
        XCTAssertFalse(text.contains("ghost"), "the reply-gap card stays private until selected")
        XCTAssertFalse(text.contains("Dinner tonight"))
        let withGhost = WrappedShareText.build(edition: e, selected: Set(e.highlights.map(\.id)), owner: WrappedFixtures.owner, friend: WrappedFixtures.mia.participants[1], locale: en)
        XCTAssertTrue(withGhost.contains("3 late comebacks · Longest gap: 1 day 13 hours"))
        XCTAssertFalse(withGhost.contains("Dinner tonight"), "aggregate only: gap messages are not exported")
        XCTAssertEqual(WrappedShareText.build(edition: e, selected: [], owner: WrappedFixtures.owner, friend: WrappedFixtures.mia.participants[1], locale: en), "Wrapped: Emma & Mia · Nov 1 – 14")
    }
}
