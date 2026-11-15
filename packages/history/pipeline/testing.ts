import { memoryArchive, readHead } from "./archive";
import { mergeConversation } from "./merge";
import { LocalTime } from "./time";
import type { ConversationInput, MessageInput, Parser } from "./types";

export interface ParserRun {
  claimed: string[];
  conversations: Map<string, ConversationInput>;
  messages: Map<string, MessageInput[]>;
  selfHints: string[];
  warnings: string[];
}

/** Runs one parser over in-memory files the way the pipeline does, and records everything it emits. */
export async function runParser(
  parser: Parser,
  files: Record<string, string | Uint8Array>,
  options: { timeZone?: string; archiveName?: string; chunkSize?: number } = {},
): Promise<ParserRun> {
  const archive = memoryArchive(files, options.archiveName ?? "upload.zip", options.chunkSize ?? 7);
  const local = new LocalTime(options.timeZone ?? "UTC");
  const claimed = await parser.claim(archive.entries, (entry) => readHead(entry));
  const run: ParserRun = {
    claimed: claimed.map((e) => e.path),
    conversations: new Map(),
    messages: new Map(),
    selfHints: [],
    warnings: [],
  };
  await parser.parse(claimed, {
    archiveName: archive.name,
    fromLocal: (y, mo, d, h, mi, s) => local.fromLocal(y, mo, d, h, mi, s),
    conversation(meta) {
      run.conversations.set(meta.externalId, mergeConversation(run.conversations.get(meta.externalId), meta));
    },
    async messages(externalId, batch) {
      if (!run.conversations.has(externalId)) throw new Error(`messages() before conversation() for ${externalId}`);
      const list = run.messages.get(externalId) ?? [];
      list.push(...batch);
      run.messages.set(externalId, list);
    },
    selfHint(names) {
      run.selfHints.push(...names);
    },
    warn(message) {
      run.warnings.push(message);
    },
  });
  return run;
}
