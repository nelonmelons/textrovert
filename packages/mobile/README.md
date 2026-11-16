# @textrovert/mobile

Textrovert's phone app: Expo (SDK 58, expo-router, TypeScript) for iOS, Android and web. Screens, layout and visual
design follow Emma's SwiftUI app (fe/textrovert-app); data comes from the Textrovert API when one is set up, and from
Emma's sample friends otherwise, so the app runs with no backend.

## Navigation

Four tabs (`src/app/(tabs)/`), with everything else pushed over them from the root stack (`src/app/_layout.tsx`):

- **Today**: replies waiting, coming up, plans (sample data, marked "Sample" when live), your people, search or ask,
  and a card into your stats.
- **Ask**: Emma's chat. Live, it answers from `POST /ask` with citations, grouped sources, a receipts sheet with the
  messages around each cited one, a friend scope picker, starters, typing status and retry. Photos keep her fixture
  replies.
- **People**: everyone you text (`GET /people`), or the **Network** graph (the portrait's orbit, groups and edges,
  replay). A person opens their profile.
- **You**: **Stats** (`GET /stats`: totals, sent vs received, reply times, who starts, busiest hours and days, months,
  closest people, style) with Kevin's `.textrovert` file import (`/stats`) as a second source, and **Topics** (the
  portrait's atlas).

Pushed screens: `friend/[id]` (Emma's profile; live adds per-friend stats, facts, plans, moments with "Make a reel",
topics that open the atlas at `/portrait?view=atlas/t/<topic>`, the Story of us, and Wrapped), `chat`, `source`,
`note`, `settings` (with the Demo data switch), `setup` (first run), `analysis`, `conversation`, `stats`,
`portrait` and `wrapped/[conversationId]` (full screen).

## Data

`src/api/client.ts` is the one place the API is configured: `EXPO_PUBLIC_API_URL` (unset means sample data) and
`EXPO_PUBLIC_API_KEY` (sent as `x-api-key`; the hosted API requires it), both inlined at build time. `friend.ts`
holds the friend, story, portrait, stats and reel routes; `mode.tsx` decides live vs demo (Settings → Demo data);
`people.ts` maps `/people` onto Emma's `Friend` shape. Wrapped's client lives in `src/features/wrapped/data.ts`.

## Run it on web

```sh
EXPO_PUBLIC_API_URL=http://127.0.0.1:8787 npx expo start --web --port 8081
```

The Ask API is `packages/history`'s `ask-server` (see its README). A phone can't reach your laptop's 127.0.0.1, so
native builds need the hosted API (`https://<deployment>.convex.site`) and its key.

## iOS builds

Native projects are generated (`ios/` and `android/` are gitignored). Bundle id `com.textrovert.app`; the
`.textrovert` document type is registered in `app.json`.

```sh
EXPO_PUBLIC_API_URL=https://<deployment>.convex.site EXPO_PUBLIC_API_KEY=<key> npm run build:ios
```

The package builds on its own, outside the monorepo, with its own `package-lock.json`. The Wrapped engine
(`packages/wrapped/src`) is copied into `vendor/wrapped` (gitignored) by `scripts/vendor-wrapped.js`, which runs on
install, start, web, typecheck and `build:ios`; metro and tsconfig resolve `@textrovert/wrapped` there. Run
`npm run vendor:wrapped` before archiving `packages/mobile` alone. After changing dependencies, refresh the lockfile
with `npm install --package-lock-only` in a copy outside the workspace and copy it back.

## Checks

`pnpm --filter @textrovert/mobile typecheck` and `npx expo export --platform ios`.
