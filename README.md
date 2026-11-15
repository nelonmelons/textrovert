# textrovert
textrovert - yc consumer mobile app hackathon 

## iPhone UI demo — chunk 1

Open `Textrovert.xcodeproj` and run the shared `Textrovert` scheme. The app uses SwiftUI, requires iOS 17 or newer, and has no external dependencies. All conversations, people, dates and account labels are fictional fixtures; no contacts, backend, account connections or message sending are used.

Today leads with useful plan/reply summaries rather than quotes. Tapping a row opens its original message and a link to the corresponding profile. Profiles use one name, a purple Ask action for Mia, blue plans, green activities and peach gift ideas, with original messages one tap away. Empty sections do not invent context. Search supports names, handles, and phrases containing volleyball or the standalone abbreviation VB. Matching shared context does not imply availability. Clearing search returns to Today; profile back navigation preserves the query and results.

Mia has a scoped “Understand this conversation” example. The answer is explicitly a sample, distinguishes a tentative interpretation from uncertainty, links to the fictional source exchange, and offers an optional editable reply. Draft changes remain only while the example is open; they are not sent or persisted.

### Local verification

The Mac's selected developer path was stale, so commands explicitly select the installed Xcode without changing system settings:

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild -project Textrovert.xcodeproj -scheme Textrovert \
  -configuration Debug \
  -destination 'platform=iOS Simulator,id=E15AEED0-858F-4798-8E48-3839B0C89578' \
  -derivedDataPath build -resultBundlePath build/Chunk1-Review.xcresult \
  CODE_SIGNING_ALLOWED=NO test
xcrun simctl install E15AEED0-858F-4798-8E48-3839B0C89578 \
  build/Build/Products/Debug-iphonesimulator/Textrovert.app
xcrun simctl launch E15AEED0-858F-4798-8E48-3839B0C89578 com.textrovert.demo
```

The destination is the local iPhone 18 Pro simulator on iOS 27.0, using Xcode 27.1. Use a fresh result bundle path when repeating a run. UI tests cover plan/reply destinations, person and activity searches, handles, no results, query restoration, Settings, analysis sources, editable reply, and a large-type launch. Screenshots are exported to the enclosing project's `review/` folder for Emma's review before chunk 2.

Deep profile editing, full Ask/query processing, Wrapped, account management and the opening constellation are deferred. Physical-device signing/testing, VoiceOver traversal and Reduce Motion device checks are not yet verified.

### Revyl visual review

The fixture-only build was uploaded to the existing Textrovert app, not a new app. [Open the review build](https://app.revyl.ai/sessions/launch?buildId=cb496b84-169b-41ff-a615-c9e88a51eb1a). Build ID: `cb496b84-169b-41ff-a615-c9e88a51eb1a`.

```sh
ditto -c -k --sequesterRsrc --keepParent \
  build/Build/Products/Debug-iphonesimulator/Textrovert.app \
  /Users/emmadi/.capy/work/Textrovert-final-review.zip
/opt/homebrew/bin/revyl build upload \
  --file /Users/emmadi/.capy/work/Textrovert-final-review.zip \
  --app 1d45b697-735a-4a96-b42a-1ad8e1057592 --platform ios \
  --branch ui/friends-flow --version chunk1-final-review --preview --yes --json
```

Revyl verification exercised Today → original reference → profile, direct Mia search → profile, activity provenance, Ask → source exchange → back, and editing the optional reply without sending. The final build was reinstalled into the same review session and its profile, analysis, source and edited draft were checked again. Full VoiceOver traversal, all screens at every Dynamic Type size, and all-screen Dark Mode checks remain untested; the largest-type Today launch and Dark Mode Today were visually checked.
