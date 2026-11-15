import XCTest
import UIKit

final class FlowTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func launch(_ arguments: [String] = [], environment: [String: String] = [:], reset: Bool = true, app: XCUIApplication = XCUIApplication()) -> XCUIApplication {
        app.launchArguments = arguments
        var env = ["TEXTROVERT_NOW": "2026-11-15T10:00", "TEXTROVERT_INTENT_MODEL": "off"]
        if reset { env["TEXTROVERT_STORE_RESET"] = "1" }
        env.merge(environment) { $1 }
        app.launchEnvironment = env
        app.launch()
        let intro = app.descendants(matching: .any)["intro"]
        if intro.waitForExistence(timeout: 3) {
            let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: intro)
            wait(for: [gone], timeout: 6)
        }
        XCTAssertTrue(app.staticTexts["Today"].waitForExistence(timeout: 10))
        return app
    }

    private func has(_ app: XCUIApplication, _ text: String) -> Bool {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch.waitForExistence(timeout: 3)
    }

    private func back(_ app: XCUIApplication) {
        app.navigationBars.buttons.element(boundBy: 0).tap()
    }

    private func focused(_ element: XCUIElement) -> Bool {
        (element.value(forKey: "hasKeyboardFocus") as? Bool) ?? false
    }

    private func openProfile(_ app: XCUIApplication, _ query: String, _ id: String) {
        let search = app.textFields["search"]
        search.tap()
        search.typeText(query + "\n")
        app.buttons["friend-\(id)"].tap()
        XCTAssertTrue(app.staticTexts["profileName"].waitForExistence(timeout: 3))
    }

    private func scrollTo(_ app: XCUIApplication, _ element: XCUIElement) {
        var tries = 0
        while !element.isHittable && tries < 8 {
            app.swipeUp(velocity: .slow)
            tries += 1
        }
    }

    func testLargeType() {
        let app = launch(["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
        let search = app.textFields["search"]
        XCTAssertTrue(search.isHittable)
        search.tap()
        XCTAssertTrue(app.buttons["searchDone"].waitForExistence(timeout: 2))
        XCTAssertTrue(search.isHittable)
        capture("06-Large-type-search")
        app.buttons["searchDone"].tap()
        let reply = app.buttons["reply-sarah"]
        scrollTo(app, reply)
        XCTAssertTrue(reply.isHittable)
        XCTAssertTrue(search.isHittable)
        capture("06b-Large-type-scrolled")
        search.tap()
        search.typeText("Mia\n")
        app.buttons["friend-mia"].tap()
        XCTAssertTrue(app.staticTexts["profileName"].waitForExistence(timeout: 3))
        let volleyball = app.buttons["note-volleyball"]
        scrollTo(app, volleyball)
        XCTAssertLessThanOrEqual(volleyball.frame.maxX, app.buttons["edit-volleyball"].frame.minX + 1)
        capture("22-Large-type-profile-rows")
        app.swipeUp()
        capture("23-Large-type-profile-scrolled")
    }

    func testTodaySourcesAndAnalysis() {
        let app = launch()
        XCTAssertFalse(app.staticTexts.containing(NSPredicate(format: "label CONTAINS[c] 'demo' OR label CONTAINS[c] 'fictional' OR label CONTAINS[c] 'sample'")).firstMatch.exists)
        XCTAssertFalse(app.staticTexts["Try searching"].exists)
        XCTAssertTrue(app.buttons["milestone-mia-birthday"].exists)
        XCTAssertTrue(app.buttons["deadline"].exists || app.staticTexts["deadline"].exists || has(app, "Reply by 5:00 PM today") || has(app, "Reply by 5 PM today"))
        capture("01-Today")
        let reply = app.buttons["reply-sarah"]
        scrollTo(app, reply)
        XCTAssertTrue(reply.isHittable)
        capture("01b-Today-scrolled")
        app.swipeDown()
        app.swipeDown()
        let plan = app.buttons["plan-mia"]
        let panelTop = app.buttons["Search for Mia"].frame.minY - 16
        var tries = 0
        while plan.frame.maxY > panelTop && tries < 8 {
            app.swipeUp(velocity: .slow)
            tries += 1
        }
        plan.tap()
        XCTAssertTrue(has(app, "See you Thursday at 4 for shopping. Let's meet at the bookstore."))
        XCTAssertFalse(app.staticTexts["Original message"].exists)
        capture("09-Source-sheet")
        let sourceProfile = app.buttons["sourceProfile"]
        XCTAssertTrue(sourceProfile.waitForExistence(timeout: 3))
        sleep(1)
        sourceProfile.tap()
        XCTAssertTrue(app.staticTexts["profileName"].waitForExistence(timeout: 3))
        back(app)
        app.buttons["Done"].tap()

        app.buttons["milestone-mia-birthday"].tap()
        XCTAssertTrue(app.staticTexts["profileName"].waitForExistence(timeout: 3))
        XCTAssertTrue(has(app, "Mia’s birthday is tomorrow"))
        app.buttons["milestoneSource"].tap()
        XCTAssertTrue(has(app, "My birthday is November 16"))
        app.buttons["Done"].tap()
        capture("03-Mia-profile")

        let understand = app.buttons["understandConversation"]
        scrollTo(app, understand)
        understand.tap()
        XCTAssertTrue(app.buttons["openAnalysis"].waitForExistence(timeout: 3))
        capture("26-Friend-chat")
        app.buttons["openAnalysis"].tap()
        XCTAssertTrue(app.staticTexts["I think the late notice is the part that bothered her."].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["What I can’t tell"].exists)
        capture("07-Analysis-result")
        app.swipeUp()
        app.buttons["editReply"].tap()
        let draft = app.textViews["replyDraft"]
        XCTAssertTrue(draft.waitForExistence(timeout: 3))
        draft.tap()
        draft.typeText(" I can stay until seven.")
        let editedDraft = draft.value as? String ?? ""
        app.buttons["Done"].tap()
        app.swipeDown()
        app.buttons["analysisSource"].tap()
        XCTAssertTrue(has(app, MiaWords.last))
        capture("08-Source-exchange")
        app.buttons["Done"].tap()
        XCTAssertTrue(app.staticTexts["I think the late notice is the part that bothered her."].waitForExistence(timeout: 3))
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["“\(editedDraft)”"].exists)
        back(app)
        back(app)
        back(app)
        XCTAssertTrue(app.staticTexts["Today"].waitForExistence(timeout: 3))
        app.buttons["settings"].tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 3))
        back(app)
    }

    func testSearchPeopleAndActivities() {
        let app = launch()
        let search = app.textFields["search"]
        let chips = app.scrollViews["searchSuggestions"]
        XCTAssertTrue(chips.exists)
        XCTAssertGreaterThan(chips.frame.minY, search.frame.maxY - 1)
        XCTAssertFalse(app.buttons["searchDone"].exists)
        search.tap()
        XCTAssertTrue(app.buttons["searchDone"].waitForExistence(timeout: 2))
        XCTAssertTrue(focused(search))
        XCTAssertTrue(chips.exists)
        XCTAssertGreaterThan(chips.frame.minY, search.frame.maxY - 1)
        capture("12-Search-focused")
        app.buttons["searchDone"].tap()
        XCTAssertFalse(app.buttons["searchDone"].waitForExistence(timeout: 1))

        app.buttons["Search for Mia"].tap()
        XCTAssertTrue(app.buttons["friend-mia"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["activity-mia"].exists)
        app.buttons["friend-mia"].tap()
        XCTAssertTrue(app.staticTexts["profileName"].waitForExistence(timeout: 3))
        back(app)
        XCTAssertEqual(search.value as? String, "Mia")

        search.tap()
        XCTAssertTrue(focused(search))
        app.buttons["searchBack"].tap()
        XCTAssertTrue(app.staticTexts["Today"].waitForExistence(timeout: 2))
        XCTAssertFalse(focused(search))
        XCTAssertFalse(app.buttons["searchDone"].exists)
        XCTAssertTrue(app.buttons["Search for need +1 for VB tomorrow"].exists)

        app.buttons["Search for need +1 for VB tomorrow"].tap()
        XCTAssertTrue(app.buttons["activity-mia"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["activity-jules"].exists)
        XCTAssertFalse(app.buttons["activity-sarah"].exists)
        XCTAssertFalse(app.buttons["friend-mia"].exists)
        XCTAssertTrue(has(app, "Mentions volleyball"))
        XCTAssertFalse(app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH '“'")).firstMatch.exists)
        capture("02-Activity-results")
        app.buttons["activitySource-mia"].tap()
        XCTAssertTrue(has(app, "I love volleyball!"))
        app.buttons["Done"].tap()
        app.buttons["activity-jules"].tap()
        XCTAssertTrue(app.staticTexts["Jules Rivera"].waitForExistence(timeout: 3))
        back(app)
        XCTAssertEqual(search.value as? String, "need +1 for VB tomorrow")
        app.buttons["searchBack"].tap()

        search.tap()
        search.typeText("sports\n")
        XCTAssertTrue(app.buttons["activity-mia"].waitForExistence(timeout: 3))
        XCTAssertTrue(has(app, "Related interest"))
        app.buttons["Clear search"].tap()

        search.tap()
        search.typeText("@sarahp\n")
        XCTAssertTrue(app.buttons["friend-sarah"].waitForExistence(timeout: 3))
        app.buttons["Clear search"].tap()

        search.tap()
        search.typeText("nobodyxyz\n")
        XCTAssertTrue(app.otherElements["noResults"].exists || has(app, "No matches"))
        capture("04-No-results")
        app.buttons["searchBack"].tap()
        XCTAssertTrue(app.staticTexts["Today"].exists)
    }

    func testActivityEditsAreSearchable() {
        let app = launch()
        let search = app.textFields["search"]
        search.tap()
        search.typeText("pottery\n")
        XCTAssertTrue(has(app, "No matches"))
        app.buttons["Clear search"].tap()
        openProfile(app, "Jules", "jules")
        let add = app.buttons["add-together"]
        scrollTo(app, add)
        add.tap()
        let title = app.textFields["noteTitle"]
        XCTAssertTrue(title.waitForExistence(timeout: 3))
        title.tap()
        title.typeText("Pottery class")
        app.buttons["noteSave"].tap()
        XCTAssertTrue(app.staticTexts["Saved"].waitForExistence(timeout: 2) || app.descendants(matching: .any)["saveStatus"].label == "Saved")
        app.buttons["editorClose"].tap()
        back(app)
        app.buttons["Clear search"].tap()
        search.tap()
        search.typeText("pottery\n")
        XCTAssertTrue(app.buttons["activity-jules"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["activity-jules"].label.contains("Added by you"))
        capture("13-Activity-edit-searchable")
    }

    func testNotesPersistAndStayWithFriend() {
        let app = launch()
        openProfile(app, "Mia", "mia")
        let edit = app.buttons["edit-tea"]
        scrollTo(app, edit)
        edit.tap()
        let title = app.textFields["noteTitle"]
        XCTAssertTrue(title.waitForExistence(timeout: 3))
        title.tap()
        title.typeText(" sampler")
        XCTAssertTrue(has(app, "Draft · not saved yet"))
        capture("14-Editor-draft")
        app.buttons["noteSave"].tap()
        XCTAssertTrue(has(app, "Saved"))
        capture("15-Editor-saved")
        app.buttons["editorClose"].tap()
        let tea = app.buttons["note-tea"]
        XCTAssertTrue(tea.label.contains("Jasmine tea sampler"))
        XCTAssertTrue(tea.label.contains("From iMessage"))
        XCTAssertTrue(tea.label.contains("Edited by you"))

        let addMemory = app.buttons["add-memories"]
        scrollTo(app, addMemory)
        addMemory.tap()
        XCTAssertTrue(title.waitForExistence(timeout: 3))
        title.tap()
        title.typeText("Thrift haul at the flea market")
        app.buttons["noteSave"].tap()
        XCTAssertTrue(has(app, "Saved"))
        app.buttons["editorClose"].tap()
        XCTAssertTrue(has(app, "Thrift haul at the flea market"))
        XCTAssertTrue(has(app, "Added by you"))
        app.swipeUp(velocity: .slow)
        capture("16-Profile-with-notes")

        back(app)
        app.buttons["Clear search"].tap()
        openProfile(app, "Jules", "jules")
        XCTAssertFalse(has(app, "Thrift haul"))
        XCTAssertTrue(app.staticTexts["No memories saved yet."].exists || has(app, "No memories saved yet."))
        back(app)
        app.buttons["Clear search"].tap()
        openProfile(app, "Mia", "mia")
        XCTAssertTrue(has(app, "Jasmine tea sampler"))
        XCTAssertTrue(has(app, "Thrift haul at the flea market"))

        app.terminate()
        let relaunched = launch(reset: false, app: app)
        openProfile(relaunched, "Mia", "mia")
        XCTAssertTrue(has(relaunched, "Jasmine tea sampler"))
        XCTAssertTrue(has(relaunched, "Thrift haul at the flea market"))
        XCTAssertTrue(has(relaunched, "Gift idea: Jasmine tea sampler"))
        back(relaunched)
        relaunched.buttons["Clear search"].tap()
        openProfile(relaunched, "Jules", "jules")
        XCTAssertFalse(has(relaunched, "Thrift haul"))
    }

    func testSaveFailureKeepsInput() {
        let app = launch(environment: ["TEXTROVERT_FAIL_NEXT_SAVE": "1"])
        openProfile(app, "Sarah", "sarah")
        let add = app.buttons["add-gifts"]
        scrollTo(app, add)
        add.tap()
        let title = app.textFields["noteTitle"]
        XCTAssertTrue(title.waitForExistence(timeout: 3))
        title.tap()
        title.typeText("Ceramic mug")
        app.buttons["noteSave"].tap()
        XCTAssertTrue(has(app, "Couldn’t save. Your text is still here."))
        XCTAssertEqual(title.value as? String, "Ceramic mug")
        capture("17-Editor-failed")
        app.buttons["saveRetry"].tap()
        XCTAssertTrue(has(app, "Saved"))
        app.buttons["editorClose"].tap()
        XCTAssertTrue(has(app, "Ceramic mug"))
    }

    func testMilestonesFollowTheDate() {
        var app = launch(environment: ["TEXTROVERT_NOW": "2026-11-15T15:30"])
        XCTAssertTrue(has(app, "Mia’s birthday is tomorrow"))
        XCTAssertTrue(has(app, "1 year since you and Sarah first messaged"))
        XCTAssertTrue(app.descendants(matching: .any)["deadlineUrgent"].exists)
        capture("18-Today-urgent-deadline")
        app.buttons["milestone-sarah-friendship"].tap()
        XCTAssertTrue(app.staticTexts["Sarah Park"].waitForExistence(timeout: 3))
        app.buttons["milestoneSource"].tap()
        XCTAssertTrue(has(app, "So nice meeting you tonight!"))
        app.terminate()

        app = launch(environment: ["TEXTROVERT_NOW": "2026-11-16T09:00"], app: app)
        XCTAssertTrue(has(app, "Mia’s birthday is today"))
        XCTAssertFalse(app.descendants(matching: .any)["deadlineUrgent"].exists)
        XCTAssertTrue(has(app, "Asked for a reply by"))
        app.terminate()

        app = launch(environment: ["TEXTROVERT_NOW": "2026-11-17T09:00"], app: app)
        XCTAssertFalse(app.buttons["milestone-mia-birthday"].exists)
        XCTAssertTrue(has(app, "1 year since you and Sarah first messaged"))
        app.terminate()

        app = launch(environment: ["TEXTROVERT_NOW": "2026-11-26T09:00"], app: app)
        XCTAssertFalse(app.descendants(matching: .any)["comingUp"].exists)
        capture("19-Today-no-milestones")
    }

    func testGridParallax() throws {
        let still = ProcessInfo.processInfo.environment["EXPECT_STILL_GRID"] == "1"
        let app = launch()
        openProfile(app, "Mia", "mia")
        let anchor = app.buttons["add-plans"]
        XCTAssertTrue(anchor.waitForExistence(timeout: 3))
        let before = app.screenshot()
        let y0 = anchor.frame.minY
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.75))
        start.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6)), withVelocity: .slow, thenHoldForDuration: 0.6)
        sleep(1)
        let after = app.screenshot()
        let shift = anchor.frame.minY - y0
        XCTAssertLessThan(shift, -20)
        let phase0 = try XCTUnwrap(gridPhase(before))
        let phase1 = try XCTUnwrap(gridPhase(after))
        let observed = circular(phase1 - phase0)
        let expected = circular(still ? 0 : shift * 0.6)
        let attachment = XCTAttachment(string: "content shift \(shift)pt, grid phase \(phase0) → \(phase1), observed \(observed), expected \(expected), still=\(still)")
        attachment.name = "grid-measurement"
        attachment.lifetime = .keepAlways
        add(attachment)
        XCTAssertLessThan(abs(circular(observed - expected)), 2.5)
        if !still { XCTAssertGreaterThan(abs(circular(shift - observed)), 2.5) }
        capture(still ? "21-Grid-reduce-motion" : "20-Grid-after-scroll")
    }

    func testWrappedFromProfiles() {
        let app = launch()
        for (query, id, first) in [("Mia", "mia", "Mia"), ("Sarah", "sarah", "Sarah")] {
            openProfile(app, query, id)
            let open = app.buttons["openWrapped"]
            scrollTo(app, open)
            open.tap()
            XCTAssertTrue(app.buttons["wrappedClose"].waitForExistence(timeout: 5))
            XCTAssertTrue(has(app, "Wrapped, you and \(first)"))
            capture("24-Wrapped-\(first)-1")
            app.buttons["wrappedNext"].tap()
            sleep(1)
            capture("25-Wrapped-\(first)-2")
            app.buttons["wrappedClose"].tap()
            XCTAssertTrue(app.staticTexts["profileName"].waitForExistence(timeout: 3))
            back(app)
            app.buttons["Clear search"].tap()
        }
        openProfile(app, "Jules", "jules")
        XCTAssertTrue(app.buttons["openWrapped"].exists)
    }

    func testFriendChat() {
        let app = launch()
        openProfile(app, "Jules", "jules")
        let ask = app.textFields["askField"].exists ? app.textFields["askField"] : app.textViews["askField"]
        ask.tap()
        ask.typeText("What should I get Jules for his birthday?")
        app.buttons["askSend"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["askNoAnswer"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["historyChip"].exists)
        XCTAssertTrue(app.buttons["addPhoto"].exists)
        XCTAssertFalse(app.buttons["chatSend"].isEnabled)
        let field = app.textFields["chatField"].exists ? app.textFields["chatField"] : app.textViews["chatField"]
        field.tap()
        field.typeText("Does Jules like volleyball?")
        app.buttons["chatSend"].tap()
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "askNoAnswer").count, 2)
        capture("27-Friend-chat-jules")
    }

    func testSearchAsk() {
        let app = launch()
        let search = app.textFields["search"]
        search.tap()
        search.typeText("Mia\n")
        XCTAssertTrue(app.buttons["friend-mia"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["askHedgehog"].exists)
        XCTAssertFalse(app.navigationBars["Ask me"].exists)
        capture("28-Search-ask-card")
        app.buttons["Clear search"].tap()
        search.tap()
        search.typeText("who wants to play volleyball?\n")
        XCTAssertTrue(app.navigationBars["Ask me"].waitForExistence(timeout: 3))
        XCTAssertTrue(has(app, "Mia and Jules"))
        XCTAssertTrue(app.buttons["historyChip"].exists)
        capture("29-Search-ask-answer")
        let field = app.textFields["chatField"].exists ? app.textFields["chatField"] : app.textViews["chatField"]
        field.tap()
        field.typeText("What is the meaning of life?")
        app.buttons["chatSend"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["askNoAnswer"].waitForExistence(timeout: 3))
        XCTAssertTrue(has(app, "answer that one yet"))
        capture("30-Search-ask-fallback")
    }

    private func circular(_ value: CGFloat) -> CGFloat {
        let period: CGFloat = 22
        var v = value.truncatingRemainder(dividingBy: period)
        if v > period / 2 { v -= period }
        if v < -period / 2 { v += period }
        return v
    }

    private func gridPhase(_ shot: XCUIScreenshot) -> CGFloat? {
        guard let cg = shot.image.cgImage else { return nil }
        let scale = CGFloat(cg.width) / shot.image.size.width
        let width = cg.width, height = cg.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let context = CGContext(data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        context?.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
        let x = Int(11 * scale)
        var lum: [CGFloat] = []
        let top = Int(260 * scale), bottom = Int(720 * scale)
        for y in top..<bottom {
            let i = (y * width + x) * 4
            lum.append(0.3 * CGFloat(pixels[i]) + 0.59 * CGFloat(pixels[i + 1]) + 0.11 * CGFloat(pixels[i + 2]))
        }
        let paper = lum.sorted()[lum.count * 3 / 4]
        var lines: [CGFloat] = []
        var run: [Int] = []
        for (offset, value) in lum.enumerated() {
            if paper - value > 5 {
                run.append(offset)
            } else if !run.isEmpty {
                lines.append((CGFloat(run.reduce(0, +)) / CGFloat(run.count) + CGFloat(top)) / scale)
                run = []
            }
        }
        guard lines.count >= 8 else { return nil }
        let angles = lines.map { $0.truncatingRemainder(dividingBy: 22) / 22 * 2 * .pi }
        let s = angles.map(sin).reduce(0, +), c = angles.map(cos).reduce(0, +)
        var phase = atan2(s, c) / (2 * .pi) * 22
        if phase < 0 { phase += 22 }
        return phase
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

enum MiaWords {
    static let last = "I wish you’d told me sooner"
}
