import type { ConversationKind } from "../convex/validators";
import { readHead } from "./archive";
import { stableId } from "./hash";
import { resolveSelf, titleFromParticipants, type ResolvableConversation } from "./identity";
import { mergeConversation } from "./merge";
import { parsers as defaultParsers } from "./parsers";
import type { MessageRow, MessageStore } from "./store";
import { LocalTime } from "./time";
import type { Archive, ArchiveEntry, Parser, ParserIO, Platform } from "./types";

const FLUSH_ROWS = 2000;
const PROGRESS_INTERVAL_MS = 1500;
const MAX_WARNINGS = 30;
const TEXT_FILE_RE = /\.(json|txt|csv|html?|db)$/i;

export interface IngestedConversation {
  key: string;
  platform: Platform;
  externalId: string;
  title: string;
  kind: ConversationKind;
  participants: string[];
  selfName: string | null;
  /** Messages parsed from this upload (some may already have been stored by an earlier upload). */
  parsed: number;
}

export interface IngestProgress {
  messagesParsed: number;
  messagesStored: number;
  conversations: number;
}

export interface IngestResult {
  conversations: IngestedConversation[];
  sources: { platform: Platform; files: number; conversations: number; messages: number }[];
  learnedSelfNames: string[];
  warnings: string[];
  messagesParsed: number;
  messagesStored: number;
}

export class UnrecognizedExportError extends Error {}

interface ConversationState {
  platform: Platform;
  input: ResolvableConversation;
  parsed: number;
  lastTs: number;
  seenAtTs: Map<string, number>;
}

export function conversationKey(platform: Platform, externalId: string): string {
  return stableId(platform, externalId);
}

/**
 * Detects every chat export inside an upload, parses it into normalized messages, and writes them to the
 * message store (idempotently, so re-uploads only add what is new). Analysis happens afterwards from the store.
 */
export async function ingestArchive(options: {
  owner: string;
  archive: Archive;
  store: MessageStore;
  timeZone: string;
  selfNames: string[];
  onProgress?: (progress: IngestProgress) => unknown;
  parsers?: Parser[];
}): Promise<IngestResult> {
  const { owner, archive, store, onProgress } = options;
  const local = new LocalTime(options.timeZone);
  const hints = [...options.selfNames];
  const warnings: string[] = [];
  const conversations = new Map<string, ConversationState>();
  const sources = new Map<Platform, { files: number }>();
  let buffer: MessageRow[] = [];
  let writing: Promise<void> = Promise.resolve();
  let storeFailure: unknown = null;
  let messagesParsed = 0;
  let messagesStored = 0;
  let invalidTimestamps = 0;
  let lastProgress = 0;

  const warn = (message: string) => {
    if (warnings.length < MAX_WARNINGS) warnings.push(message);
  };
  // One write stays in flight while the parser produces the next batch.
  const flush = async () => {
    await writing;
    if (storeFailure) throw storeFailure;
    if (buffer.length === 0) return;
    const rows = buffer;
    buffer = [];
    writing = store.insert(owner, rows).then(
      (stored) => {
        messagesStored += stored;
      },
      (error: unknown) => {
        storeFailure = error;
      },
    );
  };
  const report = async (force = false) => {
    if (!onProgress || (!force && Date.now() - lastProgress < PROGRESS_INTERVAL_MS)) return;
    lastProgress = Date.now();
    await onProgress({ messagesParsed, messagesStored, conversations: conversations.size });
  };

  const peeked = new Map<ArchiveEntry, Promise<string>>();
  const peek = (entry: ArchiveEntry) => {
    let head = peeked.get(entry);
    if (!head) {
      head = readHead(entry).catch(() => "");
      peeked.set(entry, head);
    }
    return head;
  };

  let remaining = archive.entries;
  const plan: { parser: Parser; entries: ArchiveEntry[] }[] = [];
  for (const parser of options.parsers ?? defaultParsers) {
    const claimed = await parser.claim(remaining, peek);
    if (claimed.length === 0) continue;
    plan.push({ parser, entries: claimed });
    const taken = new Set(claimed);
    remaining = remaining.filter((entry) => !taken.has(entry));
  }
  peeked.clear();
  if (plan.length === 0) {
    throw new UnrecognizedExportError(
      "No chats found in " +
        archive.name +
        ". Supported exports: WhatsApp, iMessage (chat.db), Instagram, Messenger, Snapchat, Discord, Telegram, ChatGPT, Claude, and CSV.",
    );
  }
  const skipped = remaining.filter((entry) => TEXT_FILE_RE.test(entry.path));
  if (skipped.length > 0) {
    warn("Skipped " + skipped.length + " unrecognized file(s), e.g. " + skipped.slice(0, 3).map((e) => e.path).join(", "));
  }

  let failures = 0;
  for (const { parser, entries } of plan) {
    const platform = parser.platform;
    sources.set(platform, { files: entries.length });
    const io: ParserIO = {
      archiveName: archive.name,
      fromLocal: (y, mo, d, h, mi, s) => local.fromLocal(y, mo, d, h, mi, s),
      conversation(meta) {
        const key = conversationKey(platform, meta.externalId);
        const existing = conversations.get(key);
        conversations.set(key, {
          platform,
          input: { ...mergeConversation(existing?.input, meta), platform },
          parsed: existing?.parsed ?? 0,
          lastTs: existing?.lastTs ?? Number.NaN,
          seenAtTs: existing?.seenAtTs ?? new Map(),
        });
      },
      async messages(externalId, batch) {
        const key = conversationKey(platform, externalId);
        const state = conversations.get(key);
        if (!state) throw new Error(platform + " parser sent messages for undeclared conversation " + externalId);
        for (const m of batch) {
          if (!Number.isFinite(m.ts)) {
            invalidTimestamps++;
            continue;
          }
          const ts = Math.round(m.ts);
          const signature = ts + "|" + m.sender + "|" + m.kind + "|" + (m.text ?? "");
          // Identical messages at the same instant (two "lol"s in the same minute) get distinct, reproducible ids.
          if (ts !== state.lastTs) {
            state.lastTs = ts;
            state.seenAtTs.clear();
          }
          const occurrence = state.seenAtTs.get(signature) ?? 0;
          state.seenAtTs.set(signature, occurrence + 1);
          buffer.push({
            uid: stableId(key, signature, occurrence),
            conversation: key,
            ts,
            sender: m.sender,
            kind: m.kind,
            text: m.text ?? null,
            meta: m.meta && Object.keys(m.meta).length > 0 ? JSON.stringify(m.meta) : null,
          });
          state.parsed++;
          messagesParsed++;
        }
        if (buffer.length >= FLUSH_ROWS) await flush();
        await report();
      },
      selfHint(names) {
        hints.push(...names.filter(Boolean));
      },
      warn(message) {
        warn(platform + ": " + message);
      },
    };
    try {
      await parser.parse(entries, io);
    } catch (error) {
      if (storeFailure) throw storeFailure;
      failures++;
      warn(platform + ": " + (error instanceof Error ? error.message : String(error)));
    }
  }
  await flush();
  await writing;
  if (storeFailure) throw storeFailure;
  await report(true);
  if (invalidTimestamps > 0) warn("Skipped " + invalidTimestamps + " message(s) without a usable timestamp");
  if (failures === plan.length && messagesParsed === 0) {
    throw new Error("Couldn't read any chats from " + archive.name + ": " + warnings.join("; "));
  }

  const parsedConversations = [...conversations.entries()].filter(([, state]) => state.parsed > 0);
  const learnedSelfNames = resolveSelf(
    parsedConversations.map(([, state]) => state.input),
    hints,
  );

  return {
    conversations: parsedConversations.map(([key, state]) => ({
      key,
      platform: state.platform,
      externalId: state.input.externalId,
      title: state.input.title || titleFromParticipants(state.input.participants, state.input.selfName),
      kind: state.input.kind,
      participants: state.input.participants,
      selfName: state.input.selfName ?? null,
      parsed: state.parsed,
    })),
    sources: [...sources.entries()].map(([platform, { files }]) => {
      const mine = parsedConversations.filter(([, state]) => state.platform === platform);
      return { platform, files, conversations: mine.length, messages: mine.reduce((n, [, s]) => n + s.parsed, 0) };
    }),
    learnedSelfNames,
    warnings,
    messagesParsed,
    messagesStored,
  };
}
