# @textrovert/ingest

Turns chat exports and screen recordings into one `Conversation` shape plus a line-by-line transcript an LLM can read.

| Source | Input | Entry point |
| --- | --- | --- |
| WhatsApp | `_chat.txt` / `.zip` export (iOS or Android), or Export Assistant `.md` | `ingestText`, `ingestWhatsAppZip` |
| iMessage | `imessage-exporter -f txt` output (one file per chat, or the whole export folder) | `ingestText` |
| Instagram export | "Export your information" → Messages, JSON → `.zip` (every thread) | `ingestZip` / `ingestInstagramExport` |
| Instagram / iMessage / Hinge screen recording | video, read in chunks of ~10 frames by a vision model | `readRecording` then `framesToConversation` |

## CLI

```sh
pnpm install
pnpm ingest ~/Desktop/chat.txt                 # WhatsApp or iMessage txt
pnpm ingest recording.mp4                      # needs OPENAI_API_KEY in .env and ffmpeg
pnpm ingest --frames out/x.frames.json         # re-stitch saved vision output, no API calls
pnpm ingest instagram-export.zip               # ranked list of every chat in the export
pnpm ingest ~/Desktop/imsg-all --pick 1,3      # bulk iMessage folder: rank, then export chats 1 and 3
pnpm test && pnpm typecheck
```

Writes `out/<name>.conversation.json` and `out/<name>.transcript.txt`. `out/` and `.env` are gitignored.

## Output contract

```ts
Conversation { source, title, isGroup, participants: { id, name, isSelf }[], messages: Message[], warnings: string[] }
Message {
  i, ts /* local wall-clock ISO, no offset */, tsConfidence: "exact" | "inferred" | "none",
  senderId, isSelf, kind: "text" | "media" | "link" | "call" | "system" | "unsent", text,
  replyTo?, replyQuote?, reactions?: { by, emoji }[], edited?, readAfter? /* iMessage read receipts */, sourceRef
}
```

`renderTranscript(conversation)` produces a header with per-person stats (messages, words, conversations started, median reply time) and one line per message:

```
[#304 | 2026-09-12 Sat 21:21 | +<1m | THEM (Mom)] (replying to #299) 相差15000 {read after 1 second}
```

`~` before a time means it was estimated from the nearest date divider (screen recordings only show dividers).

## Picking the chats that matter

Bulk sources (an Instagram export, an imessage-exporter folder) produce many conversations. `rankConversations(conversations)` returns a `ChatSummary[]` for a picker screen: title, participants, 1:1 vs group, message counts from each side, messages in the last 30 days, last message preview, and a `score` that favors recent, two-sided, 1:1 chats. Show the top of that list, let the user tap the people they care about, and only send those conversations on for analysis.

## Notes

- Instagram exports double-encode UTF-8 (emoji show up as `Ã°Â` junk); `fixMojibake` repairs it. The account owner is inferred as the one participant present in every thread; with a single-thread export, ask the user and call `reassignSelf`.

- WhatsApp exports don't mark who "you" are unless the exporter writes `You`. Otherwise call `reassignSelf(conversation, name)` after asking the user.
- imessage-exporter prints threaded replies twice (indented under the parent and again in time order); the parser keeps the in-order copy and links `replyTo`.
- In the app, implement `getFrame(timeSec)` with `expo-video-thumbnails` and pass Convex storage URLs or data URLs; the parsing code is plain TypeScript with no Node-only imports outside `cli.ts`.
