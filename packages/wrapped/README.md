# @textrovert/wrapped

Conversation-specific Wrapped: up to three verified highlights per edition from one one-on-one chat and a visible date
range. Pure TypeScript with no React or React Native dependency; the Expo app renders it (see SCENES.md).

```ts
import { WrappedController, WrappedEditionStore, dateRangeFromDays } from "@textrovert/wrapped";

const store = await WrappedEditionStore.open(AsyncStorage);          // any { getItem, setItem, removeItem }
const range = dateRangeFromDays("2026-11-01", "2026-11-14", "America/Los_Angeles");
const controller = new WrappedController({ conversation, ownerID, range, store });
controller.subscribe(() => render(controller.phase));
await controller.open();                                               // cached edition, or edition 1
controller.generate();                                                 // "Another edition"
```

- `generate`, `resolve`, `revalidate`, `replyGaps`, `widerRange`, `select` (also as `WrappedEngine.*`) are the engine.
  Instants are epoch ms, durations seconds, ranges whole local days in an IANA zone with an exclusive end.
- Every quote is re-read from its source message (id, speaker, exact text, time in range, text kind) before it is shown.
- Conflict, private topics and roasts of the other person are left out by default, and counted on the edition.
- Model layer: a `WrappedModelSource` returns message ids, kind, a ≤ 6-word headline, a one-line why and a sensitive
  flag, never text. `WrappedSuggestionProvider` gates them; at most 2 of 3 cards come from the model; a late model
  feeds "Another edition". `includeWarmMoments` and `allowAffectionateTeasing` default to false.
- Ranking: a model pick gets `CORROBORATION_BONUS` (+1.5) when a rule-based card (not busiest day or reply gaps)
  independently found at least two of its messages, and a rule-based running joke scores at most
  `RUNNING_JOKE_SCORE_CAP` (3.25), so a callback the model found can take the joke slot in edition 1.
- `WrappedController` also takes a `remote` source (`generate({range, avoiding, number}) → {outcome, wider}`) for hosts
  that get editions from a server, as the Expo app does; failures show a `failed` phase that `generate()` retries.
- `@textrovert/wrapped/openai` is a server-only source (gpt-5-mini, structured output). Don't import it in the app.
  The local ask server exposes it as `POST /wrapped` (packages/history README).

Tests: `pnpm test` runs the ported Swift tests (engine and model layer, with the ranking and remote-source tests added
since the port) plus calendar and text parity tests.
