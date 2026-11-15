# Wrapped · integration handoff (TEXT-3 → TEXT-2)

Status: complete and validated in an isolated harness. Not yet wired into the app. Wiring needs the Xcode project file, which TEXT-2 owns and Emma has reserved until her handoff.

Root: `/Users/emmadi/Documents/Codex/2026-11-14/welcome-emma-sign-out-https-events/outputs/Textrovert`

## Files (all new, all untracked, nothing else in app/ touched)

App target — add all 7 to the Textrovert target's Sources phase:

| File | What it holds |
|---|---|
| `app/Textrovert/Wrapped/WrappedModels.swift` | Standalone models: `WrappedParticipant`, `WrappedMessage`, `WrappedConversation`, `WrappedDateRange`, `WrappedHighlight`, `WrappedQuote`, `WrappedEdition`, `WrappedOutcome`, `WrappedShareText` |
| `app/Textrovert/Wrapped/WrappedAnalysis.swift` | `WrappedEngine` (generate, resolve, revalidate, replyGaps, widerRange), `WrappedHeuristicProvider`, the sensitivity classifier and the `WrappedCandidateProviding` protocol (the model-layer hook) |
| `app/Textrovert/Wrapped/WrappedStore.swift` | `WrappedEditionStore`: edition cache per owner + conversation + range, in UserDefaults |
| `app/Textrovert/Wrapped/WrappedFixtures.swift` | Fictional fixtures: Mia (iMessage), Sarah (Instagram), Jules (sparse), Priya (no highlight), Noah (empty range), a group chat |
| `app/Textrovert/Wrapped/WrappedTheme.swift` | `WrappedPalette` (Emma's anchors: plum #6843A5, periwinkle #DCE5FF, butter #FFF0CE, coral #F6B3A6, leaf #B9D9A6, ink #29252D, plus the rainbow reserved for big moments), `WrappedWorld` (per-conversation colour world), type treatments, shapes and motion helpers |
| `app/Textrovert/Wrapped/WrappedScenes.swift` | Story slides: opener, who-said-it, running-joke timeline, plan ticket, last-line twist, topic swerve, private reply-gap ghost, busiest day, finale, message/empty |
| `app/Textrovert/Wrapped/WrappedView.swift` | Public component `WrappedView`, its `WrappedModel`, the Sources sheet and the exact share preview |

Unit tests: `app/TextrovertWrappedTests/WrappedEngineTests.swift` (21 tests). They use `@testable import Textrovert`, so they need a **unit-test bundle** target hosted by the app. The project only has a UI-test target today. Add the target with TEST_HOST and BUNDLE_LOADER set to the app, and ENABLE_TESTABILITY = YES for Debug. Otherwise keep running them through the harness below.

Every symbol is prefixed `Wrapped`, and the scene and theme files are wrapped in `#if os(iOS)`. Nothing collides with `Theme`, `Friend`, `SourceMessage`, `Face` and the rest of TextrovertApp.swift (checked by grep). No dependencies, no assets and no Info.plist keys are needed.

## Public API

```swift
WrappedView(
    conversation: WrappedConversation,      // one-on-one only; groups get an honest "not supported" slide
    ownerID: String,                        // the signed-in user's participant id
    range: WrappedDateRange,                // the visible date range
    store: WrappedEditionStore = .shared,   // edition cache; inject your own for tests
    locale: Locale = .current,
    onClose: @escaping () -> Void,
    onShare: ((String) -> Void)? = nil,     // receives exactly the previewed text; nil hides the Share… button
    onRangeChange: ((WrappedDateRange) -> Void)? = nil,
    onAddMemory: (() -> Void)? = nil        // shown on empty states when provided
)
```

Engine, usable without UI: `WrappedEngine.generate(conversation:ownerID:range:avoiding:number:now:locale:provider:) -> WrappedOutcome` (`.edition`, `.exhausted(seenCount:widerRange:)` or `.empty(reason, widerRange:)`). Also `WrappedEngine.replyGaps(conversation:ownerID:range:)` and `WrappedEngine.revalidate(_:in:)`.

Date range: `WrappedDateRange(from: firstDay, through: lastDay, timeZone:)` covers whole local days, with an exclusive end.

## Minimal wiring (TEXT-2, once the project file is released)

1. Add the 7 files to the Textrovert target.
2. Present it from the friend profile's Wrapped entry. Fixture ids match `Friend.id` ("mia", "sarah", "jules"):

```swift
@State private var showWrapped = false
// …
.fullScreenCover(isPresented: $showWrapped) {
    if let f = WrappedFixtures.all.first(where: { $0.id == friend.id }) {
        WrappedView(conversation: f.conversation, ownerID: WrappedFixtures.owner.id, range: f.range,
                    onClose: { showWrapped = false },
                    onShare: { text in /* present ShareLink / UIActivityViewController with text */ })
    }
}
```

3. Hide the Wrapped entry for friends with no fixture, or pass a conversation with no messages, which gets an honest empty slide. The view forces dark appearance inside its own cover only.
4. For UI tests, the useful identifiers are: `wrappedNext`, `wrappedBack`, `wrappedClose`, `wrappedSources`, `wrappedReveal`, `wrappedGuess-<participantID>`, `wrappedAnotherEdition`, `wrappedShareButton`, `wrappedSharePreviewText`, `wrappedWiden`, `wrappedBackToEdition`, `wrappedEditionMenu`. The opener heading's accessibility label is "Wrapped, you and <First name>".

Real data later: map Nelson's transcript rows to `WrappedMessage(id:senderID:text:sentAt:kind:)`. Message ids must be stable and unique per conversation, because cached editions re-verify against them on reopen.

## Behaviour delivered

- Per-conversation analysis. Signals are running callbacks across dates, distinctive quotable lines answered with a laugh, last-line twists, topic swerves, dated plans, the owner's completed 24 h+ reply gaps, and the busiest day. Up to 3 highlights per edition, chosen for signal variety, with no source message used twice. Mia's edition 1 is [who said it · 3 late replies · "define" running joke]. Sarah's is ["gerald" running joke · crow swerve · "turns out he's a ficus" twist]. Edition 2 differs again.
- Each quote is shown only after resolving its id, speaker, exact text, time-in-range and text kind. Duplicate ids, system messages, undated messages and altered text are rejected.
- Reply gaps: incoming turns are grouped, and each is measured from the turn's last incoming message to the first owner reply. A turn counts once, only when both its start and the reply are in range. Groups, system messages, missing times and open turns are excluded. Elapsed seconds handle DST, and the Nov 1 fall-back is tested. Shown only when there are at least 2 gaps, framed for the owner only, and private by default.
- "Another edition" uses unseen sources only. Every edition is cached and reopen shows it, with the current edition index kept. Cached quotes are re-verified on reopen. When material runs out, a slide says so and offers a wider range, carrying seen sources forward.
- Conflict, private topics (money, health, credentials) and roasts aimed at the other person are excluded by default. The count is disclosed on the finale.
- Sparse chats get a short recap (1 card). A chat with nothing quotable or nothing in range gets "Your first memory will go here", with a wider-range action where data exists.
- The exact share preview lists independent card toggles and the literal text that would leave the phone. The reply-gap card is off by default and exports only its aggregate. Nothing is sent from Wrapped; the host owns the share sheet.
- Accessibility: Back, Next and Close are 44–52 pt buttons and don't depend on swiping. VoiceOver focus moves to each slide's heading. Bubbles read as "Mia said, …, Nov 6 at 6:21 PM, iMessage". Reduce Motion swaps the pager for a fade, freezes the drifting backgrounds and ring, and makes reveals instant. Dynamic Type scales display text, slides scroll vertically, and chrome is capped at xxxLarge.

## Validation

Harness (isolated, not the shared project): `review/wrapped/harness/WrappedHarness.xcodeproj` builds the 7 Wrapped files plus a tiny fixture picker, with bundle id `com.textrovert.wrappedharness`. It runs on simulator **iPhone 18 Pro Max `CDB64395-5276-4D76-9AAE-AF32CAAF8360`** because the shared iPhone 18 Pro simulator was being driven by another build at the same time, which caused false failures.

```sh
cd review/wrapped/harness
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer TEST_RUNNER_WRAPPED_SHOT_DIR=$PWD/../screens
xcodebuild -project WrappedHarness.xcodeproj -scheme WrappedHarness -destination 'platform=iOS Simulator,id=CDB64395-5276-4D76-9AAE-AF32CAAF8360' -derivedDataPath ~/.capy/work/wrapped-dd CODE_SIGNING_ALLOWED=NO test
```

The engine tests also run on macOS with no simulator via a throwaway SwiftPM package that symlinks the files (`~/.capy/work/wrapped-scratch/pkg`, `swift test`).

Final run (Nov 15, 1:53–1:56 PM PT, Xcode 27.1, iOS 27.0, iPhone 18 Pro Max sim): **TEST SUCCEEDED. 21/21 engine unit tests and 5/5 UI tests passed.**
- Engine: quote resolution and attribution, tampered claims rejected, guess with the same speaker or fabricated evidence rejected, range boundaries, reply-gap definition (open turn, missing-time turn, exactly 24 h counts, 23 h 59 m doesn't, turn before range excluded), DST elapsed time, groups and foreign owners, single-gap suppression, ghost private and owner-only, two conversations differ, unseen-only editions until exhausted with a wider range, wider range with carried seen sources, determinism, running-joke counts and timeline, busiest-day counts, sparse 1-card, honest empty states, sensitive exclusion, classifier, cache reopen and revalidation, share text contains only selected excerpts.
- UI: Mia full flow (guess → Sources sheet ids → ghost reveal → joke → finale → exact preview without the private card → Another edition → close → reopen shows edition 2), Sarah's different slides and edition 2, Sarah exhausted → wider range, Jules sparse → exhausted → back to edition, Priya zero highlights, Noah empty range → widen, and largest accessibility type keeps the guess, Back and Close reachable.
- Captain's defects re-checked in screenshots: "YOU CALLED IT" now sits below the progress bar (mia-02). The twist caption is ink on leaf and clears the bottom bar (sarah-04). The ghost slide clears the bar (mia-04). The large-type guess prompt is visible above the guess buttons (large-02). The ticket stamp no longer covers the reply (sarah-06).

Screenshots: `review/wrapped/screens/` (mia-01…08, sarah-01…07, jules-01…03, priya-01, noah-01…02, large-01…02).

## Limitations and deferred items

- **Pow omitted.** Native SwiftUI stands in for it: a masked panel wipe for the guess reveal, a diagonal wipe for twists, a stamp scale-in and spring entrances. There are no dependencies and no Lottie.
- **Export deferred** per the HTML's screenshot-review cut. The preview gives exact text to the host's `onShare`, and no image card is rendered. The system share sheet isn't presented by Wrapped itself.
- Not verified: spoken VoiceOver traversal, Reduce Motion on a device (the code path exists, but the simulator UI tests don't toggle it), every Dynamic Type size (default and AccessibilityXXXL were checked), landscape (the app is portrait only), and a physical device or Revyl, which TEXT-2 owns.
- The heuristics are English-centric and miss deadpan or paraphrased humor. The planned fix is the on-device model layer; see `model-layer-plan.md` (approved by Emma for after this handoff).
- Hedgehog art isn't integrated yet, by Emma's instruction. Suggested, sparing use: the toasting-tea pair on the Wrapped finale and the leaf-peek pose on the "seen everything" slide. Both PNGs have transparent backgrounds.


---

## Update · Nov 15 afternoon (TEXT-3): hedgehog finale, first-person narrator, EMM-6 model layer

The default build stays deterministic: with no `modelSource`, nothing changes in how editions are picked, and generation is still synchronous.

**What changed for TEXT-2**
- **Finale tea toast (finale only).** `WrappedToastArt` in WrappedScenes.swift loads `UIImage(named: "hedgehog-toast")` from `app/Textrovert/Art/hedgehog-toast.png`, which is already in your Resources phase. Both halves slide together and clink once. Under Reduce Motion they appear already together. The accessibility label is "Two hedgehogs clinking teacups". If the image is missing, the art is simply omitted. The finale headline is now "Cheers to you and <First name>." with "That's what I found in <range>."
- **First-person narrator.** All narrator copy now speaks as the hedgehog ("I counted…", "I think…", "I can't tell…", "My read: …") and never says "we". Quotes, speaker names and "You" attribution are unchanged. If your UI tests match Wrapped copy, two strings changed: "I've shown you everything in this range" (was "You've seen everything…") and the sparse opener, "I only found N messages in this range, so this one's short."
- **Text-on-dark rainbow.** `WrappedPalette.rainbowText` starts light, so every letter keeps contrast on the dark scenes.
- **WrappedModelProvider.swift (EMM-6)** is the file you already added. Nothing else needs to be added to the app target. The read-only compile check of your current project with my files succeeded.

**Model layer API (opt-in)**
```swift
WrappedView(conversation:ownerID:range:
            modelSource: WrappedOnDeviceModel.availableSource(),   // nil on unsupported OS/devices → rules only
            modelOptions: .stored(),                                 // funny-only, teasing off by default
            onClose: …)
```
- `WrappedOnDeviceModel.availableSource()` uses Apple FoundationModels on iOS 26+ when `SystemLanguageModel.default` is available. It's guarded by `#if canImport` and `#available`, the deployment target stays at 17, and no package is added.
- `WrappedModelOptions` has `includeWarmMoments = false` and `allowAffectionateTeasing = false`, stored under `textrovert.wrapped.includeWarmMoments` and `textrovert.wrapped.allowAffectionateTeasing`. `WrappedModelSettingsSection()` is a drop-in Settings section with both toggles, for when Emma decides.
- `WrappedStubModelSource(fixed:delay:)` plus `WrappedFixtures.theo` and `theoStubSuggestions` give a deterministic model demo route if you want one in the review build.
- Behaviour: the model returns only message ids, a kind, a headline of 6 words or fewer, a one-line why and a sensitive flag. It never returns quote text. The gate drops unknown, duplicate, out-of-order, out-of-range, system or undated ids; anything the model or the privacy classifier flags (conflict is always blocked, and roast-style teasing only passes with the teasing setting on); and headlines that are too long, contain profanity or are framed as conflict. Survivors go through the same quote verification and unseen-source rule as before. At most 2 of 3 cards come from the model, and a fresh rule-based card is kept whenever one exists. The model gets 2.5 s; if it's late, the rules-only edition shows and its suggestions feed "Another edition". If it errors, Wrapped falls back to rules. The prompt sends only eligible, unseen messages and never conflict or private ones. A model card's Sources sheet says it was found with the on-device model.

**Validation (Nov 15, 2:16–2:35 PM PT, iPhone 18 Pro Max sim `CDB64395…`)**
- Harness `review/wrapped/harness` final full run: **TEST SUCCEEDED. 39/39 unit tests (21 engine + 18 model layer, including async timeout, late-arrival and failure fallback) and 8/8 UI tests passed.** New UI tests cover: Theo with the stub (model guess, Sources note, model callback plus rule-based plan, teasing excluded, finale toast), Theo without a model (rules only), and the warm setting showing the "soft spot" slide. The Mia test asserts the toast is on the finale and not on other slides. After a final finale-spacing tweak (smaller art, widen action as a text link), the two finale-related UI tests were re-run and passed. The finale now clears the Back/Next bar (screens/mia-06-finale.png).
- macOS SwiftPM run of the same engine and model-layer tests: 35/35 passed (the iOS-only async tests aren't included there).
- Read-only `xcodebuild build` of your Textrovert.xcodeproj into my own derived data: **BUILD SUCCEEDED**. project.pbxproj checksum is unchanged.

**Not verified:** a real FoundationModels response on a device. The simulator path is stub-only, and model output isn't asserted. Spoken VoiceOver of the new finale art is also untested.


**Follow-up (Emma, 2:45 PM):** Cards the model picked no longer show a "My read: …" line. The model's reason is only used internally, so the slide and the Sources sheet show just the quotes, plus the note that this card was found with the on-device model. Rule-based cards that have no reason line now hide it rather than leaving a gap. The rerun passed 39/39 unit tests and 8/8 UI tests, and the app still builds. project.pbxproj is unchanged.
