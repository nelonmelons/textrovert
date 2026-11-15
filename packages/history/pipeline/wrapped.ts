// Wrapped over the message store: maps stored rows to the Wrapped engine's conversation and runs one edition,
// optionally with a server-side model source. Read-only: it only receives rows.

import {
  WrappedEngine, defaultModelOptions, isModelSuggestion, makeModelPrompt, modelAwareProvider, raceModel,
  type WrappedConversation, type WrappedDateRange, type WrappedMessage, type WrappedModelOptions, type WrappedModelSource,
  type WrappedModelSuggestion, type WrappedOutcome,
} from "@textrovert/wrapped";

import type { ConversationRef } from "./assistant/agent";
import { isMetaActivityText } from "./parsers/meta";
import type { StoredMessage } from "./store";
import type { Platform } from "./types";

/** Participant id of the store owner's own messages. Everyone else's id is their sender name. */
export const WRAPPED_OWNER_ID = "owner";

const serviceNames: Record<Platform, string> = {
  whatsapp: "WhatsApp", imessage: "iMessage", instagram: "Instagram", messenger: "Messenger", telegram: "Telegram", discord: "Discord",
  snapchat: "Snapchat", chatgpt: "ChatGPT", claude: "Claude", csv: "CSV", signal: "Signal", slack: "Slack", sms: "SMS", other: "Other",
};

/**
 * Message ids are the store's row ids, so cached editions re-verify against the same rows. The owner's messages
 * (sender equal to the conversation's selfName) get WRAPPED_OWNER_ID. Rows that aren't text with text (media, calls,
 * system notices) become system messages, which Wrapped never quotes or counts; so do Instagram and Messenger activity
 * lines that were stored as text ("<name> sent an attachment."). Rows must be in (ts, id) order.
 */
export function toWrappedConversation(ref: ConversationRef, rows: StoredMessage[], ownerID = WRAPPED_OWNER_ID): WrappedConversation {
  const idFor = (name: string) => (ref.selfName !== null && name === ref.selfName ? ownerID : name);
  const participants = [...new Set(ref.participants)].map((name) => ({ id: idFor(name), name }));
  const meta = ref.platform === "instagram" || ref.platform === "messenger";
  const messages: WrappedMessage[] = rows.map((r) => ({
    id: String(r.id),
    senderID: r.sender ? idFor(r.sender) : null,
    text: r.text ?? "",
    sentAt: Number.isFinite(r.ts) ? r.ts : null,
    kind: r.kind === "text" && r.text !== null && !(meta && isMetaActivityText(r.text)) ? "text" : "system",
  }));
  return { id: ref.id, service: serviceNames[ref.platform] ?? ref.platform, participants, messages };
}

export interface WrappedRun {
  conversation: WrappedConversation;
  outcome: WrappedOutcome;
  model: {
    used: boolean;
    status: "off" | "skipped" | "onTime" | "late" | "failed";
    error?: string;
    suggestions: number;
    accepted: number;
    raw?: WrappedModelSuggestion[];
    ms?: number;
  };
}

/** Model prompt budget for a server model: larger than the on-device default, still only eligible messages. */
export const SERVER_PROMPT_BUDGET = { chunkCharacters: 16_000, maxChunks: 4 };

export async function runWrapped(args: {
  ref: ConversationRef;
  rows: StoredMessage[];
  range: WrappedDateRange;
  avoiding?: string[];
  number?: number;
  now?: number;
  modelSource?: WrappedModelSource | null;
  modelOptions?: WrappedModelOptions;
  timeoutMs?: number;
  debug?: boolean;
}): Promise<WrappedRun> {
  const { ref, range, number = 1, now = Date.now(), timeoutMs = 60_000 } = args;
  const conversation = toWrappedConversation(ref, ref.kind === "dm" ? args.rows : []);
  const options = args.modelOptions ?? defaultModelOptions();
  const avoiding = new Set(args.avoiding ?? []);
  if (ref.kind !== "dm") {
    return {
      conversation,
      outcome: { kind: "empty", reason: { kind: "unsupportedConversation" }, widerRange: null },
      model: { used: false, status: args.modelSource ? "skipped" : "off", suggestions: 0, accepted: 0 },
    };
  }
  let suggestions: WrappedModelSuggestion[] = [];
  let model: WrappedRun["model"] = { used: false, status: "off", suggestions: 0, accepted: 0 };
  if (args.modelSource) {
    const prompt = makeModelPrompt({ conversation, ownerID: WRAPPED_OWNER_ID, range, avoiding, options, ...SERVER_PROMPT_BUDGET });
    if (!prompt) {
      model = { ...model, status: "skipped" };
    } else {
      const started = Date.now();
      const race = await raceModel(args.modelSource, prompt, timeoutMs);
      const ms = Date.now() - started;
      if (race.status === "onTime") suggestions = race.suggestions;
      model = {
        used: true, status: race.status, suggestions: suggestions.length, accepted: 0, ms,
        ...(race.status === "failed" ? { error: race.error instanceof Error ? race.error.message : String(race.error) } : {}),
        ...(args.debug ? { raw: suggestions } : {}),
      };
    }
  }
  const outcome = WrappedEngine.generate({
    conversation, ownerID: WRAPPED_OWNER_ID, range, avoiding, number, now,
    provider: modelAwareProvider(suggestions, options),
  });
  if (outcome.kind === "edition") model.accepted = outcome.edition.highlights.filter(isModelSuggestion).length;
  return { conversation, outcome, model };
}
