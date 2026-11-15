# Wrapped · model-based picker layer (plan, not started)

Status: planned. Emma asked on Nov 15 for this to follow the isolated Wrapped handoff (TEXT-3), not ship before it.

## Goal
Find moments the pattern rules miss without giving up today's guarantees. Every quote must resolve to a real message ID, speaker, text and time inside the visible range. Sensitive moments stay out by default, and "Another edition" still prefers unseen sources.

## What it should catch that rules miss
- Deadpan humor and jokes answered with jokes (no "lol" marker).
- Paraphrased callbacks and in-joke nicknames across dates.
- Warm or sentimental moments, so recaps aren't only funny.
- Sarcastic conflict that has no trigger words (tighter exclusion), and affectionate teasing wrongly flagged by word lists (looser, opt-in).
- Non-English, slang and emoji-heavy chats.

## Design
1. **New provider, same pipeline.** `WrappedModelProvider: WrappedCandidateProviding` in a new file `app/Textrovert/Wrapped/WrappedModelProvider.swift`. The engine merges model candidates with `WrappedHeuristicProvider`. Verification, the sensitivity filter, unseen-source filtering and selection stay unchanged in `WrappedEngine`.
2. **On-device only.** Apple FoundationModels, which is in this Xcode's iOS SDK. No package dependency, no backend, no network, and no messages leave the phone. Gate it with `#if canImport(FoundationModels)` plus `if #available(iOS 26, *)` and `SystemLanguageModel.default.availability == .available`. Otherwise use the heuristics only, as today. The deployment target stays at iOS 17.
3. **Structured output.** A `@Generable` struct asks only for references: `kind` (callback, quotable, twist, swerve, plan, warm), `messageIDs` (ordered setup → punchline), `headline` (≤ 6 words), `why` (one sentence), `sensitive` (bool). The model never returns quote text. Display text always comes from the source message, so quotes can't be invented.
4. **Input.** Only text messages that are attributable, dated, inside the range and not already used in an edition. Each is passed as `id | speaker (You / first name) | local time | text`. Long chats are chunked by day with a token budget. Ambiguous or group chats are rejected before the model sees them, as today.
5. **Gate after the model.** Drop the candidate if any ID is unknown, out of range, a system message or already seen; if the setup and punchline speakers violate the presentation rules; if the model flags it sensitive; or if our own classifier flags any message. Headlines go through a length and profanity check. A model "why" is labelled as the model's reading, not a measured fact. Quantities (counts, gaps, days) are still computed only from timestamps.
6. **Scoring and mixing.** Model candidates get a base score below strong heuristic evidence (a measured running joke), with a bonus when a heuristic independently found the same messages. At most 2 of 3 highlights come from the model, so every edition keeps at least one evidence-computed card when one exists.
7. **Determinism.** Generation varies, so the edition cache matters more. Reopening always shows the saved edition, and revalidation on reopen already drops anything whose source changed. Demo and UI tests use a fixed-fixture mode with the model off. A debug flag records raw model output beside each candidate for review.
8. **UI.** No new screens. Each kind maps to an existing scene (warm → a new quiet "exchange" variant only if needed). The Sources sheet adds a small note when a moment was suggested by the on-device model.
9. **Latency.** Run it at open with the existing loading phase. If the model hasn't answered in about 2.5 s, show the heuristic edition, and the model's picks feed "Another edition".

## Tests
- Unit, with a stub provider (no model needed): fabricated IDs, altered speakers, out-of-range and seen IDs are rejected. The sensitive flag excludes. The model mix cap holds. Merging with heuristics stays deterministic for a fixed stub.
- Fixtures: add one chat with deadpan humor and a paraphrased callback that the heuristics miss and a stub returns, proving the path end to end.
- On-device smoke test on a supported simulator or phone: availability is reported and the fallback works when unavailable. This is manual, because model output isn't asserted exactly.

## Size and order
One focused chunk, all in new Wrapped files plus the engine's provider merge. Needs nothing from TEXT-2 beyond adding one more file to the target when integrating. Do it after TEXT-2 has integrated the current Wrapped and Emma has reviewed it on a phone.

## Open questions for Emma
- Include warm and sentimental moments by default, or only funny ones?
- Should the model be allowed to suggest affectionate teasing that our word list blocks, behind a per-edition toggle?
