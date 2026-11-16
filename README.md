# textrovert
textrovert - yc consumer mobile app hackathon 

## Packages

- `packages/mobile`: the Expo phone app. `pnpm --filter @textrovert/mobile web` serves it on http://localhost:8081.
- `packages/history`: the chat data layer and assistant. `pnpm --filter @textrovert/history ask-server` runs the
  local Ask API the app talks to (see its README for the env vars).
- `packages/portrait`: the portrait visualizations.

`pnpm typecheck` and `pnpm test` run across every package.
