import Foundation

// Fictional fixtures for Wrapped. Every name, message and time below is invented.
// Quantities shown in Wrapped are computed from these timestamps by WrappedEngine; none are typed in.

struct WrappedFixture: Identifiable {
    let id: String
    let title: String
    let conversation: WrappedConversation
    let range: WrappedDateRange
}

enum WrappedFixtures {
    static let timeZone = TimeZone(identifier: "America/Los_Angeles")!
    static let owner = WrappedParticipant(id: "emma", name: "Emma")

    static func date(_ month: Int, _ day: Int, _ hour: Int, _ minute: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar.date(from: DateComponents(year: 2026, month: month, day: day, hour: hour, minute: minute))!
    }

    static func range(_ m1: Int, _ d1: Int, through m2: Int, _ d2: Int) -> WrappedDateRange {
        WrappedDateRange(from: date(m1, d1, 12, 0), through: date(m2, d2, 12, 0), timeZone: timeZone)
    }

    private struct Spec {
        let sender: String?
        let when: Date?
        let text: String
        var kind: WrappedMessage.Kind = .text
    }

    private static func say(_ sender: String, _ m: Int, _ d: Int, _ h: Int, _ min: Int, _ text: String) -> Spec {
        Spec(sender: sender, when: date(m, d, h, min), text: text)
    }

    private static func build(_ prefix: String, _ specs: [Spec]) -> [WrappedMessage] {
        specs.enumerated().map { i, s in
            WrappedMessage(id: "\(prefix)-\(String(format: "%02d", i + 1))", senderID: s.sender, text: s.text, sentAt: s.when, kind: s.kind)
        }
    }

    // MARK: Mia: iMessage, a dentist, "define", a lost-shoes line, and three slow replies.

    static let mia = WrappedConversation(
        id: "mia-chen", service: "iMessage",
        participants: [owner, WrappedParticipant(id: "mia", name: "Mia Chen")],
        messages: build("mia", [
            say("mia", 10, 24, 18, 2, "Okay but is a hot dog a sandwich or a taco? Ruling needed."),
            say("emma", 10, 24, 18, 5, "Taco. Structurally it's a taco and I will die on this hill."),
            say("mia", 10, 24, 18, 6, "Putting that on your gravestone 😂"),
            say("mia", 10, 29, 9, 15, "I just paid four dollars for one peach. It better change my life."),
            say("emma", 10, 29, 9, 40, "File a report on the life change."),
            say("mia", 10, 29, 20, 10, "Update: the peach was fine. I want my four dollars back."),
            say("mia", 10, 30, 22, 30, "Costume update: I am a lamp."),
            say("emma", 11, 1, 9, 0, "A lamp is a great costume. Very illuminating."),
            say("mia", 11, 1, 10, 12, "Pickleball tournament update: I lost to a retired dentist."),
            say("emma", 11, 1, 10, 15, "Respect the dentist. They have hand-eye coordination and nothing to lose."),
            say("mia", 11, 1, 10, 16, "lol they had a headband collection"),
            say("emma", 11, 2, 17, 35, "On my way!"),
            say("mia", 11, 2, 17, 41, "Define 'on my way.' I'm at the door and you're clearly not."),
            say("emma", 11, 2, 17, 43, "Putting sneakers on. Spiritually on my way."),
            say("mia", 11, 3, 20, 12, "Did you see the group trip email?"),
            say("mia", 11, 3, 20, 13, "Please tell me you saw the group trip email"),
            say("emma", 11, 5, 9, 40, "Saw it, forgot, felt shame. Dinner tonight to make up for it?"),
            say("mia", 11, 5, 9, 44, "Tonight works. You're forgiven (conditionally)."),
            say("emma", 11, 6, 9, 44, "Last night was elite. Please frame the receipt."),
            say("emma", 11, 6, 18, 20, "I have located my shoes."),
            say("mia", 11, 6, 18, 21, "lmao a legend. Take a victory lap."),
            say("emma", 11, 6, 18, 25, "Thank you. I accept the crown."),
            say("mia", 11, 7, 12, 0, "Define 'a quick errand.'"),
            say("emma", 11, 7, 12, 30, "Three stores. Zero regrets."),
            say("emma", 11, 8, 18, 4, "I'm outside."),
            say("mia", 11, 8, 18, 5, "Outside where?? I'm at the front door"),
            say("emma", 11, 8, 18, 6, "Turns out I'm at the other bookstore."),
            say("mia", 11, 8, 18, 7, "I hate you. Come to the right one"),
            say("emma", 11, 8, 18, 8, "Running. Do not let them close."),
            say("mia", 11, 9, 12, 5, "Need a +1 for volleyball tomorrow at 10. Come? Bring water and low expectations."),
            say("emma", 11, 9, 12, 7, "Yes. I will bring neither."),
            say("emma", 11, 10, 12, 40, "mia you absolute clown, 'light volleyball' and my knees have filed a complaint"),
            say("mia", 11, 10, 12, 41, "Worth it 😂"),
            say("mia", 11, 10, 20, 0, "Define 'five minutes' because last time it was forty."),
            say("mia", 11, 10, 22, 31, "Update: I cannot feel my legs either"),
            say("emma", 11, 11, 22, 30, "Knees: retired. Volleyball: unretired."),
            say("mia", 11, 12, 17, 41, "I wish you'd told me sooner that you could only stay an hour"),
            say("emma", 11, 12, 17, 50, "You're right. I should have said."),
            say("mia", 11, 12, 18, 30, "It's fine. Mostly."),
            say("emma", 11, 12, 18, 40, "Define 'mostly.'"),
            say("mia", 11, 13, 9, 0, "Wanna get brunch Sunday? Juniper has the good pancakes."),
            say("emma", 11, 13, 9, 10, "Pancakes: yes. Alarm: negotiable."),
            Spec(sender: nil, when: date(11, 13, 9, 12), text: "Mia named the chat Taco Hill", kind: .system),
            say("mia", 11, 13, 14, 0, "I need an update on the pancake dentist."),
            Spec(sender: "emma", when: nil, text: "Dentist update pending."),
            say("mia", 11, 14, 8, 0, "Hello??")
        ]))

    // MARK: Sarah: Instagram, a fern named Gerald, a crow tangent, karaoke and brunch plans.

    static let sarah = WrappedConversation(
        id: "sarah-park", service: "Instagram",
        participants: [owner, WrappedParticipant(id: "sarah", name: "Sarah Park")],
        messages: build("sarah", [
            say("sarah", 10, 20, 19, 0, "I bought a fern. Name suggestions?"),
            say("emma", 10, 20, 19, 2, "Gerald."),
            say("sarah", 10, 20, 19, 2, "Gerald it is."),
            say("sarah", 10, 27, 8, 30, "Gerald dropped three leaves. Should I be worried?"),
            say("emma", 10, 27, 8, 40, "He's being dramatic. Give him a spritz."),
            say("sarah", 11, 2, 20, 15, "You in for karaoke Saturday at 8 at Lucky Mic? I'm doing the whole Bohemian Rhapsody and you can't stop me."),
            say("emma", 11, 2, 20, 31, "Only if I get the tambourine."),
            say("sarah", 11, 2, 20, 32, "The tambourine is yours. Gerald is jealous."),
            say("emma", 11, 3, 8, 10, "I made a spreadsheet to compare oat milks."),
            say("sarah", 11, 3, 8, 12, "A spreadsheet. For milk."),
            say("emma", 11, 3, 8, 13, "Columns for foam, price, and regret."),
            say("sarah", 11, 3, 8, 20, "Anyway, completely unrelated: do you think crows hold grudges?"),
            say("emma", 11, 3, 8, 21, "Yes. I walked past a crow once and it has not forgotten."),
            say("sarah", 11, 4, 13, 0, "can you venmo me for the tickets? I owe the rest of rent"),
            say("emma", 11, 4, 13, 5, "Sent."),
            say("sarah", 11, 6, 18, 30, "Gerald has a new leaf. I am so proud I could cry."),
            say("emma", 11, 6, 18, 33, "Send Gerald a headshot. I'll frame it."),
            say("sarah", 11, 7, 21, 0, "Are you alive?"),
            say("emma", 11, 9, 11, 10, "Alive. My phone went on a hike without me."),
            say("sarah", 11, 9, 11, 12, "A hike without you or without the phone?"),
            say("emma", 11, 9, 11, 13, "Honestly unclear."),
            say("emma", 11, 11, 16, 20, "sarah you absolute idiot, you parked three feet from the curb"),
            say("sarah", 11, 11, 16, 21, "The curb moved."),
            say("sarah", 11, 12, 9, 15, "Update: he is not a fern."),
            say("emma", 11, 12, 9, 16, "Then what is he??"),
            say("sarah", 11, 12, 9, 17, "Turns out he's a ficus. We have both been lying to a plant."),
            say("emma", 11, 12, 9, 20, "I need a moment. Gerald has been living a double life."),
            say("sarah", 11, 13, 20, 0, "Do you want to do Friday brunch at 11 at Juniper? I'm buying."),
            say("emma", 11, 13, 20, 12, "Fine. But I'm ordering for the table."),
            say("sarah", 11, 14, 19, 30, "Dress rehearsal tonight. Gerald wants a duet."),
            say("emma", 11, 14, 19, 45, "Gerald can have the high part.")
        ]))

    // MARK: Sparse and empty cases.

    static let jules = WrappedConversation(
        id: "jules-rivera", service: "WhatsApp",
        participants: [owner, WrappedParticipant(id: "jules", name: "Jules Rivera")],
        messages: build("jules", [
            say("jules", 11, 11, 19, 2, "Are you free Saturday? Volleyball at the park, 10 AM."),
            say("emma", 11, 11, 19, 5, "Yes, count me in."),
            say("jules", 11, 11, 19, 6, "Bring a ball?")
        ]))

    static let priya = WrappedConversation(
        id: "priya-nair", service: "iMessage",
        participants: [owner, WrappedParticipant(id: "priya", name: "Priya Nair")],
        messages: build("priya", [
            say("priya", 11, 9, 10, 0, "ok"),
            say("emma", 11, 9, 10, 4, "k sounds good"),
            say("priya", 11, 9, 10, 5, "great")
        ]))

    static let noah = WrappedConversation(
        id: "noah-kim", service: "Instagram",
        participants: [owner, WrappedParticipant(id: "noah", name: "Noah Kim")],
        messages: build("noah", [
            say("noah", 10, 2, 15, 0, "Did you ever return my charger?"),
            say("emma", 10, 2, 15, 30, "It is on my desk, I promise.")
        ]))

    static let group = WrappedConversation(
        id: "trip-group", service: "WhatsApp",
        participants: [owner, WrappedParticipant(id: "mia", name: "Mia Chen"), WrappedParticipant(id: "sarah", name: "Sarah Park")],
        messages: build("group", [
            say("mia", 11, 3, 9, 0, "Who is booking the cabin?"),
            say("sarah", 11, 3, 9, 1, "Not it.")
        ]))

    // MARK: Theo: deadpan humor and a paraphrased callback that the rules miss. The model path finds them.

    static let theo = WrappedConversation(
        id: "theo-ward", service: "iMessage",
        participants: [owner, WrappedParticipant(id: "theo", name: "Theo Ward")],
        messages: build("theo", [
            say("theo", 11, 2, 19, 0, "I've decided to become a person who owns a bread maker."),
            say("emma", 11, 2, 19, 4, "Bold. Who are you becoming."),
            say("theo", 11, 2, 19, 5, "Someone with warm loaves and no friends."),
            say("theo", 11, 4, 8, 30, "My landlord fixed the sink."),
            say("emma", 11, 4, 8, 31, "Congratulations to the sink."),
            say("theo", 11, 4, 8, 33, "It now runs hot, cold, and something in between that I can only describe as lukewarm regret."),
            say("emma", 11, 4, 8, 34, "As it should."),
            say("emma", 11, 6, 12, 10, "Want to get dumplings Friday at 7? The place with the suspicious fish tank."),
            say("theo", 11, 6, 12, 15, "Yes. I will be early and judgmental."),
            say("emma", 11, 6, 12, 16, "Perfect."),
            say("emma", 11, 9, 18, 20, "How is the appliance era going."),
            say("theo", 11, 9, 18, 26, "It made one loaf. The loaf was a brick. I am the brick now."),
            say("emma", 11, 9, 21, 0, "theo you absolute clown, you bought a breadmaker to make bricks"),
            say("theo", 11, 9, 21, 2, "The bricks are artisanal."),
            say("theo", 11, 12, 17, 0, "I'm upset that you didn't tell me you switched teams"),
            say("emma", 11, 12, 17, 10, "That's fair. I should have."),
            say("theo", 11, 13, 20, 0, "Honestly really glad you moved to this city."),
            say("emma", 11, 13, 20, 3, "Me too. Even with the plumbing."),
            say("theo", 11, 14, 9, 0, "The bread machine and I are no longer speaking."),
            say("emma", 11, 14, 9, 2, "Respect the boundary.")
        ]))

    /// What a model might return for Theo, including suggestions the gate must drop. Used by tests and the stub demo route.
    static let theoStubSuggestions: [WrappedModelSuggestion] = [
        WrappedModelSuggestion(kind: "callback", messageIDs: ["theo-01", "theo-11", "theo-19"], headline: "The bread maker saga",
                               why: "The bread maker returns three times, never under the same name.", sensitive: false),
        WrappedModelSuggestion(kind: "quotable", messageIDs: ["theo-05", "theo-06"], headline: "Who said it?",
                               why: "A deadpan reply to a plumbing update.", sensitive: false),
        WrappedModelSuggestion(kind: "warm", messageIDs: ["theo-17", "theo-18"], headline: "Glad you're here",
                               why: "A sincere moment between jokes.", sensitive: false),
        WrappedModelSuggestion(kind: "quotable", messageIDs: ["theo-13", "theo-14"], headline: "Artisanal bricks",
                               why: "Teasing that Theo turns into a brag.", sensitive: false),
        WrappedModelSuggestion(kind: "twist", messageIDs: ["theo-15", "theo-16", "theo-17"], headline: "A change of heart",
                               why: "A hard moment that resolves.", sensitive: false),
        WrappedModelSuggestion(kind: "quotable", messageIDs: ["theo-99", "theo-05"], headline: "Made up",
                               why: "References a message that does not exist.", sensitive: false),
        WrappedModelSuggestion(kind: "swerve", messageIDs: ["theo-07", "theo-08"], headline: "Dumpling pivot",
                               why: "Flagged by the model itself.", sensitive: true)
    ]

    static let defaultRange = range(11, 1, through: 11, 14)

    static let all: [WrappedFixture] = [
        WrappedFixture(id: "mia", title: "Mia", conversation: mia, range: defaultRange),
        WrappedFixture(id: "sarah", title: "Sarah", conversation: sarah, range: defaultRange),
        WrappedFixture(id: "jules", title: "Jules (sparse)", conversation: jules, range: defaultRange),
        WrappedFixture(id: "priya", title: "Priya (no highlight)", conversation: priya, range: defaultRange),
        WrappedFixture(id: "noah", title: "Noah (empty range)", conversation: noah, range: defaultRange),
        WrappedFixture(id: "theo", title: "Theo (model layer)", conversation: theo, range: defaultRange)
    ]
}
