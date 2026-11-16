# Wrapped scenes: what the React Native port needs

The Swift UI (WrappedTheme, WrappedScenes, WrappedView on `fe/textrovert-app`) is the reference. This package already
holds everything the UI reads: `WrappedController` is the old `WrappedModel` (phase, editions, open, generate, select,
widen, model timeout), and `buildShareText` is the exact share preview. The RN layer only renders `controller.phase`.

Suggested stack: `react-native-reanimated` (entrances, wipes, count-ups, repeats), `react-native-svg` (shapes, timeline,
bars), `expo-linear-gradient` (gradients), `@shopify/react-native-skia` only for the blurred glow fields, and
`react-native-pager-view` (or a FlatList pager) for slides. Read Reduce Motion with `AccessibilityInfo.isReduceMotionEnabled`
plus its change event, or Reanimated's `useReducedMotion()`.

## Palette and worlds

| Token | Hex | Use |
| --- | --- | --- |
| plum | #6843A5 | anchor, plum world mid |
| periwinkle | #DCE5FF | anchor |
| butter | #FFF0CE | default text on dark scenes |
| coral | #F6B3A6 | anchor, plum world hot |
| leaf | #B9D9A6 | anchor, leaf world hot |
| ink | #29252D | text on light fills (bubbles on hot/glow, guess panel) |

- `rainbow`: plum, #C8479B, coral, butter, leaf, periwinkle, left to right. Reserved for big moments only: opener name,
  ghost count, finale headline. Never chrome.
- `rainbowText` (text on dark): #F2A6D8, coral, butter, leaf, periwinkle. Gradient text needs `@react-native-masked-view/masked-view`
  plus a LinearGradient, or Skia text with a shader.
- `rainbowRing`: an angular gradient of the rainbow plus plum again. Use an SVG/Skia sweep gradient.
- Worlds (`deep`, `mid`, `hot`, `glow`): plum (#1D1030, plum, coral, butter), leaf (#15231A, #3F6B47, leaf, periwinkle),
  periwinkle (#151B3D, #4658B8, periwinkle, coral). Pick by FNV-1a over the conversation id's UTF-8 bytes:
  `h = 2166136261; for (b of utf8(id)) h = Math.imul(h ^ b, 16777619) >>> 0; world = worlds[h % 3]`.
- The whole cover is forced dark; the screen background is `world.deep`.

## Type treatments

Each scene uses one display treatment so an edition never reads as one repeated font. Base size 54 scaled with Dynamic
Type (use `PixelRatio.getFontScale()`), then by text length: up to 22 characters ×1.2, 44 ×0.86, 80 ×0.64, else ×0.5.

| Swift | RN approximation |
| --- | --- |
| serifItalic: black serif italic, tracking −0.8 | a bundled serif (for example Fraunces or New York) 900 italic |
| poster: compressed black, uppercase, ×1.08, tracking 0.5 | a condensed sans 900, `textTransform: "uppercase"` |
| wide: expanded heavy, ×0.82, tracking −0.5 | an expanded sans 800 |
| typewriter: monospaced bold, ×0.66, line spacing 4 | a mono 700 |
| rounded: rounded heavy, ×0.92 | SF Rounded on iOS (`fontFamily: "ui-rounded"` via expo-font fallback) or Nunito 800 |

Width variants (compressed and expanded) don't exist in RN system fonts, so they need bundled fonts with expo-font.

## Shared pieces

| Swift | What it does | RN |
| --- | --- | --- |
| `WrappedEnter(active, order, distance = 28)` | fade in and rise from +distance; spring(response 0.6, damping 0.8), delay order × 0.09 s; Reduce Motion: 0.1 s fade, no offset | `withDelay(order*90, withSpring(0, { duration: 600, dampingRatio: 0.8 }))` on translateY plus opacity, driven by the slide being active |
| `WrappedGlow(colors)` | 2–3 blurred circles (blur 70, opacity 0.55) drifting on sin/cos at 24 fps; paused when inactive or Reduce Motion | Skia `Canvas` with `Blur` and a `useClock`/`useFrameCallback`; x = w(0.5 + 0.38 sin(0.21t + 2.1i)), y = h(0.5 + 0.38 cos(0.17t + 2.73i)), r = min(w,h)(0.42 + 0.06 sin(0.3t + 2.1i)) |
| `WrappedCountUp` | animates an integer | Reanimated shared value plus `useAnimatedProps` on a TextInput, or ReText |
| `WrappedDiagonalWipe(progress)` | slanted mask (slant 7% of width) rising from the bottom | SVG/Skia clip path from an animated progress |
| `WrappedSlantedHalf`, `WrappedTicketShape` (stub 96, notch r 22), `WrappedGhostShape` (4 teeth), `WrappedTangentShape` | static shapes | SVG paths; the Swift path math ports line for line |
| `WrappedBubble` | chat bubble with uneven corners (22, and 6 on the tail side), caption beneath: "You or first name · stamp · service" | View with per-corner radii; owner bubbles right-aligned; one accessibility element: "Mia said, …. <caption>" |
| `WrappedScroll` | vertical scroll per slide, top 88, bottom 124 (clears the bars), padding 24 | ScrollView with `contentContainerStyle` minHeight = viewport |
| `WrappedEyebrow`, `WrappedTapPill` | small caps label; pill button with testID | Text; Pressable ≥ 44 pt with `testID` |

## Slides

Slide order: opener, one slide per highlight (already sorted guess → reveal → exchange by the engine), finale. Exhausted
and empty phases are a single message slide. Chrome: a segmented progress bar and Close on top, Back and Next (44–52 pt)
at the bottom over a black-to-clear gradient. Swiping must never be the only way to move.

| Scene | When | Layout and motion | RN notes |
| --- | --- | --- | --- |
| Opener | always first | gradient deep → mid 0.8 → deep, glow, a 520 pt rainbow ring (stroke 26) bottom-right rotating once per 60 s; eyebrow "Wrapped" or "Wrapped · edition N"; "YOU &" (44 expanded heavy, butter) over the friend's first name (92 serif italic, rainbowText); range label; "I read N of your <service> messages…" or the sparse line; staggered entrances 0–4 | ring: `withRepeat(withTiming(360, { duration: 60000, easing: Easing.linear }), -1)`; static under Reduce Motion; heading label "Wrapped, you and <First name>" |
| Who said it (`quotableLine`) | guess | setup quote as display text, prompt "<Owner> or <Friend>?", two guess buttons (`wrappedGuess-<id>`); on guess a butter panel wipes up from the bottom (scaleY 0 → 1, 0.55 s easeInOut): "You called it" or "It was", the speaker, then "<who>, <elapsed> later" and the reply bubble (ink fill) | mask with an animated height anchored bottom; Reduce Motion: instant |
| Running joke (`runningJoke`) | exchange | poster headline (butter); a timeline figure drawing the occurrence dates (`figure.dates`) over 1.4 s after 0.35 s; first quote bubble (glow fill); pill "Show the latest callback" reveals the last bubble (hot fill) with scale 0.85 from bottom-trailing | SVG polyline with animated strokeDashoffset; dots at each date positioned by day within the range |
| Plan ticket (`datedInvitation`) | exchange | "A plan, on the record"; the invitation in wide type inside a ticket shape (dashed butter perforation, tilted −2.5°); "See the answer" reveals a stamp (rotated −12°, scale 2.2 → 1) and the reply bubble | stamp: `withSpring` on scale from 2.2 plus opacity |
| Twist (`lastLineTwist`) | exchange | setup in typewriter type; "See how it ends" reveals the two punchlines one by one (0.12 s apart) while a leaf-coloured diagonal wipe covers the slide; caption turns ink on leaf | the reveal counter is `revealed` steps of max(punchlines, 1), each 0.24 s easeOut |
| Pivot (`topicChange`) | exchange | setup bubble (glow), a tangent line that draws over 1.0 s, then "What came next?" brings the swerve line in rounded type from the trailing edge, rotated 2° | SVG path with strokeDashoffset; `SlideInRight` entering animation |
| Ghost era (`replyGaps`) | reveal, private by default | wide headline, prompt; a ghost shape bobbing ±8 pt over 2.2 s; "Reveal the receipts" shows the count (rainbowText, count-up 1.2 s), gap bars per `figure.seconds` growing over 0.9 s with staggered delays, the longest-gap detail, star field (20 fps twinkle) | bars: widths proportional to seconds; label "Gap of <elapsed>"; never shown in the share text except its aggregate line |
| Busiest day (`busiestDay`) | reveal | poster headline; bar chart of `figure.counts` with the `peak` bar in hot; "Reveal the day" counts up the number (1.0 s) and shows the first and last bubbles of that day | bars spring in (response 0.7, damping 0.75) with per-bar delay |
| Warm (`warmMoment`) | exchange, only when `includeWarmMoments` | quiet scene: a soft glow breathing (scale 0.92 ↔ 1.08 over 3 s), two bubbles, reveal fades | appears only when the setting is on |
| Finale | always last | "Edition N of M", the hedgehog tea toast (two halves slide together from ±46 pt and −5°/5°, spring 0.55/0.55 after 0.25 s; together already under Reduce Motion), "Cheers to you and <First name>." (rainbowText), "That's what I found in <range>.", numbered headlines (01, 02 …), notes (left-out count), buttons "Another edition" (`wrappedAnotherEdition`), "Choose what to share" (`wrappedShareButton`), widen link (`wrappedWiden`), edition menu (`wrappedEditionMenu`) | toast image `hedgehog-toast.png`, masked into halves 125 pt wide each; label "Two hedgehogs clinking teacups" |
| Message | loading with a model, exhausted, empty | wide title and body; actions as pills. Copy, verbatim from Swift: loading "I’m reading your messages with <First>…"; exhausted "I’ve shown you everything in this range" with "Try <wider label>" and "Back to your last edition"; unsupported "Wrapped is for one-on-one chats" / "I can’t reliably tell who said what in a group chat, so I leave them out."; no messages / no highlights "Your first memory will go here" | the loading body said "Everything stays on your phone."; with the server model that is no longer true, so it needs new copy |

## Sheets

- Sources sheet (`wrappedSources`): "Messages shown" lists each quote with "<speaker> · <stamp> · <service>" and
  "Message <id>"; "Why this moment" shows `highlight.why` when non-empty (model cards have an empty why), plus "I counted N
  source messages." Model cards add: "I found this with the on-device model, then checked every quote above against the
  original message." That sentence must change for the server model.
- Share preview: one toggle per card, initial selection = `shareByDefault` (the ghost card starts off, labelled "Private by
  default"), and "Exactly what would be shared" shows `buildShareText(edition, selected, owner, friend, locale)` verbatim
  (`wrappedSharePreviewText`). The host's `onShare` receives exactly that string.

## Accessibility

- Focus moves to each slide's heading 0.4 s after the page changes (`AccessibilityInfo.setAccessibilityFocus` on the
  heading's `findNodeHandle`).
- Reduce Motion: replace the pager with a cross-fade, freeze glows, ring, stars and bobbing, make reveals instant.
- Keep the testIDs above so UI tests port one to one: `wrappedNext`, `wrappedBack`, `wrappedClose`, `wrappedSources`,
  `wrappedReveal`, `wrappedGuess-<participantID>`, `wrappedAnotherEdition`, `wrappedShareButton`, `wrappedSharePreviewText`,
  `wrappedWiden`, `wrappedBackToEdition`, `wrappedEditionMenu`.
