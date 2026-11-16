# @textrovert/mobile

Textrovert's phone app: Expo (SDK 58, expo-router, TypeScript), for iOS, Android and web. The Ask tab works today: it
talks to the assistant through the local Ask API in `packages/history`. Friends lists the people from `GET /people`
and opens Ask scoped to one of them. Stats imports the file the Mac app saves with Save for iPhone (`mac/README.md`)
and shows fun numbers from the whole iMessage history, computed on the phone. Today is a placeholder until the SwiftUI
screen is ported.

## Run it on web (localhost)

1. Start the Ask API (see `packages/history/README.md`, "Local Ask API"). It listens on http://127.0.0.1:8787.
2. Start the app:

   ```sh
   pnpm install            # from the repo root
   pnpm --filter @textrovert/mobile web    # expo start --web --port 8081
   ```

   Open http://localhost:8081. On a wide window the app sits in a centered 390×844 phone frame.

The API base comes from `EXPO_PUBLIC_API_URL` (default `http://127.0.0.1:8787`). It is inlined when the JS bundle
is built, so set it before `expo start` or a native build: `EXPO_PUBLIC_API_URL=https://ask.example.dev pnpm web`.
A phone or simulator can't reach your laptop's 127.0.0.1, so native builds need a reachable URL: the hosted Ask API
(`packages/history`, "Hosted Ask API") at `https://<deployment>.convex.site`. It requires an API key, which the app
sends as `x-api-key` from `EXPO_PUBLIC_API_KEY` (also inlined at build time):
`EXPO_PUBLIC_API_URL=https://<deployment>.convex.site EXPO_PUBLIC_API_KEY=<key> npm run build:ios`.

## iOS builds

The native projects are generated (`ios/` and `android/` are gitignored). Bundle id: `com.textrovert.app`.

```sh
EXPO_PUBLIC_API_URL=https://ask.example.dev npm run build:ios
```

`build:ios` runs `expo prebuild --platform ios --clean` (CocoaPods included) and then `xcodebuild` for the
simulator; the app lands in `ios/build/Build/Products/Release-iphonesimulator/Textrovert.app`. `npm run ios` builds
and launches it on a local simulator instead.

The package also builds on its own, outside the monorepo: it has no workspace dependencies and keeps its own
`package-lock.json`, so `npm ci` in a copy of `packages/mobile` is enough. After changing dependencies, refresh that
lockfile with `npm install --package-lock-only` in a copy outside the workspace and copy it back.

## Layout

- `src/app/`: routes. `(tabs)/` holds Today, Ask (`index`), Friends and Stats.
- `src/theme.ts`: the SwiftUI app's Theme and Paper.swift ported: paper, panel, grid lines, ink, the section tones
  (accent, plans, celebrate, replies, coral, activities) in light and dark, brand colors, the Dynamic Type scale,
  radii and shadows. Ask uses the purple replies tone. `useTheme()` follows the system appearance.
- `src/components/`: reusable pieces for ported screens: `PaperScreen` (paper, grid and inline title bar),
  `GridPaper`, `Bubbles` (`MyBubble`, `AssistantTurn`), `HedgehogAvatar`, `Face`, `Chip`, `QuoteLine`,
  `Composer`, `Sheet` (bottom sheets via `useSheet()`), `TypingDots`, `PhoneFrame`, `FadeIn` and `ComingSoon`.
- `src/features/ask/`: the Ask screen, light-markdown answers with `[n]` pills, sources grouped by chat, the receipts
  sheet, the friend picker, starters and the shared Ask scope.
- `src/features/friends/`: the Friends list.
- `src/features/stats/`: the Stats tab. It imports a `.textrovert` file with expo-document-picker, keeps a copy in
  the app's documents with expo-file-system, and shows `textingStats` from `src/lib/messagesFile.ts`, which reads the
  file and counts in the phone's time zone.
- `src/lib/motion.ts` and `src/lib/haptics.ts`: Reduce Motion and device haptics (no-op on web).
- `src/lib/api.ts`: the Ask API client (2-minute timeout on `/ask`; answers usually take 10-30s).

## Checks

`pnpm --filter @textrovert/mobile typecheck`.
