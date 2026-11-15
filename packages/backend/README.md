# @textrovert/backend

Convex backend that exposes `@textrovert/ingest` to the app: upload a chat export or the frames of a screen recording, get back a `Conversation` and an LLM-ready transcript.

**Auth is TODO.** Every function is public and unauthenticated (hackathon mode); anyone with the deployment URL can read every conversation.

## Run

```sh
pnpm install                       # from the repo root
cd packages/backend
npx convex dev                     # first run logs in / creates a dev deployment, writes .env.local
npx convex env set OPENAI_API_KEY sk-...   # needed for recordings only
npx convex env set TURSO_DATABASE_URL "$(turso db show textrovert --url)"
npx convex env set TURSO_AUTH_TOKEN "$(turso db tokens create textrovert)"
```

For a throwaway local backend with no Convex account: `CONVEX_AGENT_MODE=anonymous npx convex dev` (state lives in `.convex/`, gitignored).

Env vars (Convex deployment env, not `.env`):

| Name | Used by |
| --- | --- |
| `OPENAI_API_KEY` | `ingestRecording` (vision model). Missing key makes `ingestRecording` throw immediately. |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Every function that writes or reads messages. The app never sees them. |

## API (`api.imports.*`)

| Function | Kind | What it does |
| --- | --- | --- |
| `generateUploadUrl()` | mutation | Returns a one-time upload URL; POST the file bytes to it and read `{ storageId }` from the JSON response. |
| `ingestFile({ storageId, filename, selfName? })` | mutation | Creates an import and returns its `importId` right away; parsing runs in a scheduled action. Zip (by magic bytes) → WhatsApp zip, otherwise text (WhatsApp or iMessage txt). `selfName` marks which WhatsApp participant is the user. |
| `ingestRecording({ frames: { storageId, timeSec }[], recordedAt?, tzOffsetMinutes?, framesPerWindow? })` | mutation | Creates an import, returns `importId`, and schedules the vision pass: frames sorted by time, grouped into windows of `framesPerWindow` (default 10) overlapping by 2, 8 windows in flight, `progress` updated after each window. `recordedAt` is epoch ms (default now); pass `tzOffsetMinutes: new Date().getTimezoneOffset()` so "Today"/"Yesterday" dividers resolve in the phone's timezone (the server runs in UTC). |
| `getImport({ importId })` | query | The import row (`status`, `progress`, `error`) plus its `conversations`. Subscribe to it for progress. |
| `listConversations()` | query | Newest 100 conversations. |
| `getConversation({ conversationId })` | query | One conversation row. |

Every conversation row is a summary: `chatKey`, `source`, `title`, `isGroup`, `participants`, `messageCount`, `fromMe`, `fromThem`, `recentCount`, `firstTs`, `lastTs`, `lastMessage`, `score`, `warnings`. The messages themselves live in Turso (see below); read them with the `messages.*` actions using the row's `chatKey`.

`ingestFile`/`ingestRecording` are mutations, not actions, so the app gets the `importId` before processing finishes and can subscribe to `getImport`. Parse and vision failures never throw to the client; they set `status: "error"` and `error` on the import.

## Client usage (Expo)

```ts
import { useMutation, useQuery } from "convex/react";
import * as VideoThumbnails from "expo-video-thumbnails";
import { api } from "../../packages/backend/convex/_generated/api";

async function upload(generateUploadUrl: () => Promise<string>, uri: string, type: string) {
  const blob = await (await fetch(uri)).blob();
  const res = await fetch(await generateUploadUrl(), { method: "POST", headers: { "Content-Type": type }, body: blob });
  return (await res.json()).storageId;
}

// Chat export (.txt or WhatsApp .zip)
const generateUploadUrl = useMutation(api.imports.generateUploadUrl);
const ingestFile = useMutation(api.imports.ingestFile);
const storageId = await upload(generateUploadUrl, file.uri, file.mimeType ?? "application/octet-stream");
const importId = await ingestFile({ storageId, filename: file.name });

// Screen recording: ~6 fps of JPEG frames over the whole video
const ingestRecording = useMutation(api.imports.ingestRecording);
const frames = [];
for (let t = 0; t < durationSec; t += 1 / 6) {
  const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, { time: Math.round(t * 1000), quality: 0.7 });
  frames.push({ storageId: await upload(generateUploadUrl, uri, "image/jpeg"), timeSec: t });
}
const recordingImportId = await ingestRecording({
  frames,
  recordedAt: Date.now(),
  tzOffsetMinutes: new Date().getTimezoneOffset(),
});

// Progress + results (reactive)
const imp = useQuery(api.imports.getImport, { importId });
// imp.status: "processing" | "done" | "error"; imp.progress: { done, total } windows; imp.error
const getTranscript = useAction(api.messages.getTranscript);
const transcript = imp?.status === "done" ? await getTranscript({ chatKey: imp.conversations[0].chatKey }) : null;
```

Upload frames with some parallelism (e.g. 6 at a time) in the real app; a 60 s recording is ~360 frames. Frame blobs are deleted from storage once the recording is processed.

## Notes

- `@textrovert/ingest` is imported straight from its TypeScript source (`.ts` extension imports); esbuild bundles it as-is and `convex/tsconfig.json` sets `allowImportingTsExtensions` so the typecheck accepts it.
- On a local deployment, storage URLs point at 127.0.0.1, which OpenAI cannot reach, so frames are sent to the vision model as base64 data URLs there; cloud deployments send the storage URLs directly.
- `pnpm typecheck` runs `tsc` over `convex/`; `npx convex dev --once` does codegen, typecheck, and push.

## Bulk imports and the chat picker

`ingestFile` accepts a WhatsApp export, an imessage-exporter `.txt`, a zip of an imessage-exporter folder, or an Instagram "Export your information" zip (Messages, JSON). A bulk zip creates one `conversations` row per chat. `getImport` returns them sorted by `score` (highest first), and each row carries `fromMe`, `fromThem`, `recentCount` (messages in the last 30 days), `lastMessage`, and `isGroup`, which is everything a "pick your important people" screen needs. Fetch transcripts only for the chats the user picks.

## Message storage (Turso)

Convex's free plan caps the database at 0.5 GB, so every message is stored in Turso (hosted SQLite, 5 GB free) and Convex keeps only summaries, imports, and progress. Messages are keyed by `(chat_key, time|sender|text|occurrence)`, so re-importing or re-syncing a chat never duplicates rows, and an FTS5 index powers search. The schema is created on first write (`convex/lib/messageStore.ts`).

| Function | Kind | What it does |
| --- | --- | --- |
| `messages.getTranscript({ chatKey })` | action | The LLM-ready transcript (`renderTranscript`) built from Turso. |
| `messages.getMessages({ chatKey, offset?, limit? })` | action | `{ total, messages }` in time order; `limit` defaults to 200, max 1000. |
| `messages.search({ query, chatKeys, limit? })` | action | Full-text search within the given chats; each hit has `chatKey`, `ts`, `senderId`, `isSelf`, `text`, and a `snippet` with matches in `[brackets]`. |

These are actions because they call Turso over the network, so use `useAction` (no live subscription). Run `pnpm test` for the store's tests against an in-memory SQLite database.
