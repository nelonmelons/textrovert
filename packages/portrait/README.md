# @textrovert/portrait

A living portrait of your friendships, built from your chat history: a constellation of the people you talk to,
a memoir of each close friendship with tappable receipts, a streamgraph of who filled your weeks, and an atlas of
the topics you share. Mobile-first (390×844) for embedding in the iOS app through WKWebView, and it works on desktop.

## Run

```sh
pnpm --filter @textrovert/portrait dev        # http://localhost:5180
pnpm --filter @textrovert/portrait build-portrait
pnpm --filter @textrovert/portrait typecheck
```

The app loads `/portrait.json`, which the dev server serves from `.data/portrait.json` when it exists, and falls
back to the synthetic `fixtures/demo-portrait.json` otherwise. Add `?demo` to the URL to force the demo data.
Production builds never include `.data`.

Deep links: `#/orbit`, `#/rivers`, `#/atlas`, and `#/<view>/p/<personId>` for a person's story. When embedded,
taps post `"light"` or `"medium"` to `window.webkit.messageHandlers.haptic` if the native shell registers it.

## Embedded in the app

`pnpm --filter @textrovert/portrait build:embed` builds one self-contained HTML file (JS and CSS inlined, no data,
`dist-embed/index.html`) and writes it to `packages/mobile/src/components/portraitHtml.ts`, which
`PortraitWebView` loads in react-native-webview (an iframe on web). Rerun it after changing the portrait.

The embedded page never fetches anything. Its contract with the host:

| Direction | Message | Meaning |
| --- | --- | --- |
| page → host | `{ "type": "textrovert:ready" }` | Loaded and waiting for data. Sent again if the page reloads. |
| host → page | `window.textrovertPortrait(data)`, or `postMessage({ type: "textrovert:portrait", portrait: data })` | The portrait (`GET /portrait`), as an object or JSON text. |
| page → host | `{ "type": "textrovert:open-person", "personId", "name" }` | A person was tapped; open their profile (the API keys people by `name`). |
| page → host | `{ "type": "textrovert:haptic", "style": "light" \| "medium" }` | Play a tap haptic. |

Page → host messages go to `window.ReactNativeWebView.postMessage(JSON.stringify(message))` in the WebView and to
`window.parent.postMessage(message, "*")` in an iframe. Embedded, taps don't open the page's own story view; the
host shows the profile instead.

## Data

`scripts/build-portrait.ts` reads the local libSQL database and conversation directory and writes
`.data/portrait.json` with the builder in `packages/history/pipeline/portrait`, the same one behind the API's
`GET /portrait` and `GET /story` (ignored by git; it holds real messages). Inputs come from env:

| Variable | Default |
| --- | --- |
| `PORTRAIT_DB` | the local `packages/history/.data/ig.db` |
| `PORTRAIT_REFS` | the local `packages/history/.data/ig-refs.json` |
| `PORTRAIT_OWNER` | `local-ig` |
| `PORTRAIT_TZ` | `America/Los_Angeles` |
| `PORTRAIT_ENV` | `.env` file holding `OPENAI_API_KEY` (or set `OPENAI_API_KEY` directly) |
| `PORTRAIT_STORIES` | `15` memoirs |

Series are bucketed by week when the history spans under ~18 months and by month otherwise. Memoirs are written by
gpt-5-mini with a strict JSON schema; every footnote must point at a message in a conversation with that person, and
sentences with no valid footnote are dropped. A footnote on an episode's first message also pulls in that episode's
summary and the friend's fullest lines from it. Chapter periods come from the cited messages' dates, not the model.
LLM responses are cached in `.data/llm-cache`, so reruns cost nothing unless the inputs change.

`scripts/make-demo.ts` regenerates the synthetic fixture (invented people and messages only).

![Orbit](docs/screens/demo-orbit-peek.jpg)
