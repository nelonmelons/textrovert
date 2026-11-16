import {
  WrappedEngine, addDays, dateRange, dateRangeFromDays, startOfDay,
  type WrappedDateRange, type WrappedModelSource, type WrappedOutcome, type WrappedParticipant,
} from "@textrovert/wrapped";

import type { StoredMessage } from "../store";
import { safeTimeZone } from "../time";
import { runWrapped, WRAPPED_OWNER_ID, type WrappedRun } from "../wrapped";
import type { ConversationRef } from "./agent";
import { ApiError, type WrappedApiRequest } from "./requests";

export { parseWrappedRequest, type WrappedApiRequest } from "./requests";

/** POST /wrapped, shared by the local server (scripts/ask-server.ts) and the hosted one (convex/http.ts). */

export interface WrappedApiResponse {
  conversation: { id: string; service: string; participants: WrappedParticipant[]; title: string; kind: string; ownerID: string };
  range: WrappedDateRange;
  outcome: WrappedOutcome;
  /** The next wider range around `range`, clamped to the chat's messages; null when there is nothing outside it. */
  wider: WrappedDateRange | null;
  model: WrappedRun["model"];
}

export const DEFAULT_WRAPPED_DAYS = 30;



/** One Wrapped edition for a DM. Rows are loaded only for DMs; groups answer "unsupported". */
export async function wrappedRequest(
  request: WrappedApiRequest,
  options: {
    conversations: ConversationRef[];
    loadRows: (ref: ConversationRef) => Promise<StoredMessage[]>;
    timeZone: string;
    modelSource: WrappedModelSource | null;
    now?: number;
  },
): Promise<WrappedApiResponse> {
  const ref = options.conversations.find((c) => c.id === request.conversationId);
  if (!ref) throw new ApiError(404, "No conversation " + JSON.stringify(request.conversationId));
  const tz = safeTimeZone(options.timeZone);
  const rows = ref.kind === "dm" ? await options.loadRows(ref) : [];
  let range: WrappedDateRange;
  if (request.from !== undefined && request.through !== undefined) {
    range = dateRangeFromDays(request.from, request.through, tz);
    if (range.end <= range.start) throw new ApiError(400, "through must not be before from");
  } else {
    const last = rows.reduce((max, r) => (Number.isFinite(r.ts) && r.ts > max ? r.ts : max), Number.isFinite(ref.lastAt) ? ref.lastAt : 0) || (options.now ?? Date.now());
    range = dateRange(addDays(startOfDay(last, tz), 1 - DEFAULT_WRAPPED_DAYS, tz), last, tz);
  }
  const run = await runWrapped({
    ref, rows, range,
    avoiding: request.avoiding,
    number: request.number,
    now: options.now,
    modelSource: request.model ? options.modelSource : null,
    modelOptions: { includeWarmMoments: request.includeWarmMoments, allowAffectionateTeasing: request.allowAffectionateTeasing },
    timeoutMs: request.timeoutMs,
    debug: request.debug,
  });
  const { messages, ...conversation } = run.conversation;
  return {
    conversation: { ...conversation, title: ref.title, kind: ref.kind, ownerID: WRAPPED_OWNER_ID },
    range,
    outcome: run.outcome,
    wider: messages.length > 0 ? WrappedEngine.widerRange(run.conversation, range) : null,
    model: run.model,
  };
}
