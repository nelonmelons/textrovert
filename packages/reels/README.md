# @textrovert/reels

Memory reels: a [Remotion](https://www.remotion.dev) project that turns a chat **episode** (a memorable stretch of a
conversation, see `packages/history/pipeline/assistant/episodes.ts`) into a 15–30 second vertical video
(1080×1920, 30 fps) that people can save and share.

## Scenes

1. **Title card**: episode title in big serif type, the chat's name and platform, the date range
   ("Oct 14 – Oct 30, 2026") and the participants' avatars.
2. **Chat replay**: bubbles land one by one in the source app's style (Instagram DM, iMessage, WhatsApp; Messenger,
   Telegram and SMS reuse the closest skin). Me is on the right, groups show sender names, others "type" first,
   and the view scrolls like a real chat. Long silences get a timestamp, cut stretches get a "12 messages later"
   marker, reactions sit on the bubbles, and attachments show as placeholder cards.
3. **Highlights**: one or two key quotes fill the screen word by word. The chat cuts away right after the quoted
   bubble lands and picks up where it left off.
4. **Plans** (when there are any): an itinerary with date badges.
5. **Photo collage** (when `photos` is non-empty): polaroid prints dropped onto the background.
6. **Closing card** with a placeholder Textrovert wordmark.

The background, accent color and grain follow the episode mood (hype, wholesome, planning, banter, chill, venting,
serious, chaotic). Timing lives in `src/timeline.ts`: typing and reading time grow with message length, then the
whole chat is squeezed or stretched so the reel lands between 15 and 30 seconds.

## Props

`ReelProps` in `src/types.ts`: chat title, platform and kind; participants with stable colors; episode title,
summary, start/end timestamps, mood and time zone; the ordered messages
(`{ id, sender, isMe, text, ts, media?, reactions?, skippedBefore? }`); highlight message ids; plans
(`{ what, date, when }`); and photo URLs (http(s), data URLs, or paths under `public/`).

`demo/demo-props.json` is a **synthetic** chat (made-up people and messages) used by Studio and the tests.

## Usage

```sh
pnpm --filter @textrovert/reels studio        # Remotion Studio with the demo props
pnpm --filter @textrovert/reels render:demo   # .data/demo.mp4 + .data/demo.png

# Real episodes, from the local libSQL store written by packages/history
pnpm --filter @textrovert/reels props --search "china trip" --chat "LA" --list   # find episode ids
pnpm --filter @textrovert/reels props 1652                  # -> .data/1652.json
pnpm --filter @textrovert/reels props 1652,1654,1657,1674   # merge consecutive episodes of one chat
pnpm --filter @textrovert/reels render .data/1652.json --frames 200,450   # -> .data/1652.mp4, .png, -f200.png ...
```

`scripts/episode-props.ts` reads `../history/.data/ig.db` and `../history/.data/ig-refs.json` by default
(override with `--db`/`--refs` or `REELS_DB`/`REELS_REFS`) and the `OPENAI_API_KEY` from the environment or
`../ingest/.env` (`--env`/`REELS_ENV`). It drops system noise ("liked a message", "sent an attachment"),
turns attachments and bare links into placeholder bubbles, and asks gpt-5-mini (`reasoning_effort: "minimal"`,
strict JSON schema) for the 20–35 messages that tell the story, 2–4 quote candidates and short plan labels. Every id
the model returns is checked against the episode; quotes must be 12–110 characters, and the script falls back to a
length/reaction heuristic with `--no-llm` or no key. Other flags: `--mood`, `--photos a.jpg,b.jpg`, `--out`.

## Privacy

Props built from real chats contain real names and messages. They, and every render, go to `.data/`, which the
root `.gitignore` excludes (as it does `*.mp4` and `*.db`). Never commit them; fixtures stay synthetic. The only
place real text leaves the machine is the OpenAI request that picks messages and quotes.

## License note

Remotion is source-available, not MIT. Its free license covers individuals, for-profit companies with up to 3
employees, non-profits, and evaluation; larger for-profit companies need a Company License
(https://www.remotion.dev/docs/license). Fonts (Inter, Instrument Serif) load from Google Fonts under the OFL.
