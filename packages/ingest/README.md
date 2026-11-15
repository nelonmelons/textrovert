# @textrovert/ingest

Turns chat exports and screen recordings into one `Conversation` shape plus a line-by-line transcript an LLM can read.

| Source | Input | Entry point |
| --- | --- | --- |
| WhatsApp | `_chat.txt` / `.zip` export (iOS or Android), or Export Assistant `.md` | `ingestText`, `ingestWhatsAppZip` |
| iMessage | `imessage-exporter -f txt` output (one file per chat) | `ingestText` |
| Instagram / iMessage / Hinge screen recording | video, read in chunks of ~10 frames by a vision model | `readRecording` then `framesToConversation` |

## CLI

```sh
pnpm install
pnpm ingest ~/Desktop/chat.txt                 # WhatsApp or iMessage txt
pnpm ingest recording.mp4                      # needs OPENAI_API_KEY in .env and ffmpeg
pnpm ingest --frames out/x.frames.json         # re-stitch saved vision output, no API calls
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

## Notes

- WhatsApp exports don't mark who "you" are unless the exporter writes `You`. Otherwise call `reassignSelf(conversation, name)` after asking the user.
- imessage-exporter prints threaded replies twice (indented under the parent and again in time order); the parser keeps the in-order copy and links `replyTo`.
- In the app, implement `getFrame(timeSec)` with `expo-video-thumbnails` and pass Convex storage URLs or data URLs; the parsing code is plain TypeScript with no Node-only imports outside `cli.ts`.
