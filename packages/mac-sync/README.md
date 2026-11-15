# @textrovert/mac-sync

Keeps a user's iMessage history in Convex up to date. A launchd job on the Mac runs `imessage-exporter` every 15 minutes for messages since the last run (plus one day of overlap), parses them with `@textrovert/ingest`, and calls `sync:pushChats`. Convex merges new messages into each chat's stored history (duplicates are dropped), re-renders the transcript, and re-ranks the chat.

## Setup (on the Mac whose Messages app is signed in)

```sh
brew install imessage-exporter
pnpm install                                   # repo root
cd packages/mac-sync
node src/sync.ts setup --convex-url https://<deployment>.convex.cloud   # optional: --only "+15551234567,friend@icloud.com"
node src/sync.ts run --full                    # first sync: whole history
node src/sync.ts install                       # launchd job: every 15 min (--interval SECONDS) and at login
node src/sync.ts status
node src/sync.ts uninstall
```

The job must be able to read `~/Library/Messages/chat.db`, so grant **Full Disk Access** to the `node` binary the job runs (path printed by `install`) in System Settings → Privacy & Security → Full Disk Access. Logs go to `~/Library/Logs/textrovert-sync.log`.

`run --from-dir <imessage-exporter output>` pushes an existing export instead of running the exporter (useful for testing).

## Behavior

- **Sleep:** launchd doesn't run jobs while the Mac sleeps; a missed interval runs once on wake. The Mac also only receives new iMessages while awake, so each wake catches up everything.
- **Incremental:** `imessage-exporter -s` filters by day, so each run re-sends the last day; the server dedupes on (time, sender, text) and skips chats with nothing new.
- **Identity:** each Mac gets a random `deviceId` in `~/.textrovert/sync.json`; chats are keyed by `deviceId` + the exporter's file name (contact or group name).

## Reading the data

`api.sync.listChats({ deviceId, limit? })` returns chats best-first with `messageCount`, `fromMe`, `fromThem`, `recentCount`, `lastTs`, `lastMessage`, `score`, and signed `transcriptUrl` / `conversationUrl`. `api.sync.getDevice({ deviceId })` returns `lastSyncAt` and `chatCount`.
