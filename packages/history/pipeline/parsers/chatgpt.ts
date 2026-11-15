import { streamJsonArray } from "../jsonStream";
import type { ArchiveEntry, MessageInput, Parser, ParserIO } from "../types";

const SELF = "You";
const BOT = "ChatGPT";
const INVISIBLE_RE = /[\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g;
// Search results are embedded as private-use delimiters: "\ue200cite\ue202turn0search0\ue201".
const CITATION_RE = /\ue200[^\ue201]*\ue201/g;
const PRIVATE_USE_RE = /[\ue200-\ue206]/g;

interface Part {
  content_type?: string;
  text?: string;
}

interface Node {
  parent?: string | null;
  children?: string[];
  message?: {
    author?: { role?: string };
    create_time?: number | null;
    recipient?: string;
    content?: { content_type?: string; parts?: (string | Part | null)[]; text?: string };
    metadata?: { model_slug?: string; is_visually_hidden_from_conversation?: boolean; is_user_system_message?: boolean };
  } | null;
}

interface Conversation {
  id?: string;
  conversation_id?: string;
  title?: string | null;
  create_time?: number | null;
  update_time?: number | null;
  default_model_slug?: string | null;
  current_node?: string | null;
  mapping?: Record<string, Node>;
}

export const chatgptParser: Parser = {
  platform: "chatgpt",
  async claim(entries, peek) {
    const claimed: ArchiveEntry[] = [];
    for (const entry of entries) {
      if (!/\.json$/i.test(entry.path)) continue;
      const head = (await peek(entry)).trimStart();
      if (head.startsWith("[") && /"(?:mapping|current_node)"\s*:/.test(head)) claimed.push(entry);
    }
    return claimed;
  },
  async parse(entries, io) {
    for (const entry of entries) {
      let index = 0;
      for await (const raw of streamJsonArray(entry.open(), [])) {
        index++;
        try {
          await parseConversation(raw as Conversation, io);
        } catch (error) {
          io.warn(`${entry.path}: skipped conversation #${index}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  },
};

async function parseConversation(conversation: Conversation, io: ParserIO) {
  const mapping = conversation.mapping;
  if (!mapping || typeof mapping !== "object") return;
  const fallbackTs = seconds(conversation.create_time) ?? seconds(conversation.update_time) ?? 0;
  const messages: MessageInput[] = [];
  for (const id of branch(mapping, conversation.current_node)) {
    const message = toMessage(mapping[id].message, fallbackTs, conversation.default_model_slug);
    if (message) messages.push(message);
  }
  if (!messages.length) return;

  const title = conversation.title?.trim() ?? "";
  const externalId = String(conversation.conversation_id ?? conversation.id ?? `${fallbackTs}:${title}`);
  io.conversation({ externalId, title, kind: "ai", participants: [SELF, BOT], selfName: SELF });
  for (let i = 0; i < messages.length; i += 1000) await io.messages(externalId, messages.slice(i, i + 1000));
}

/** Node ids from the root to the leaf the user was looking at. */
function branch(mapping: Record<string, Node>, currentNode: string | null | undefined): string[] {
  let leaf = currentNode && mapping[currentNode] ? currentNode : null;
  if (!leaf) {
    let latest = -Infinity;
    for (const [id, node] of Object.entries(mapping)) {
      if (node.children?.length) continue;
      const time = node.message?.create_time ?? 0;
      if (time >= latest) {
        latest = time;
        leaf = id;
      }
    }
  }
  const path: string[] = [];
  const seen = new Set<string>();
  for (let id = leaf; id && mapping[id] && !seen.has(id); id = mapping[id].parent ?? null) {
    seen.add(id);
    path.push(id);
  }
  return path.reverse();
}

function toMessage(
  message: NonNullable<Node["message"]> | null | undefined,
  fallbackTs: number,
  defaultModel: string | null | undefined,
): MessageInput | null {
  const role = message?.author?.role;
  if (!message || (role !== "user" && role !== "assistant")) return null;
  const metadata = message.metadata;
  if (metadata?.is_visually_hidden_from_conversation || metadata?.is_user_system_message) return null;
  if (role === "assistant" && message.recipient && message.recipient !== "all") return null;
  const content = message.content;
  if (content?.content_type !== "text" && content?.content_type !== "multimodal_text") return null;

  const texts: string[] = [];
  const media = new Set<string>();
  for (const part of content.parts ?? []) {
    if (typeof part === "string") texts.push(part);
    else if (part?.content_type === "audio_transcription" && part.text) {
      texts.push(part.text);
      media.add("audio");
    } else if (part?.content_type === "image_asset_pointer") media.add("photo");
    else if (part?.content_type?.includes("audio")) media.add("audio");
  }
  if (!texts.length && typeof content.text === "string") texts.push(content.text);
  const text = texts.join("\n").replace(CITATION_RE, "").replace(PRIVATE_USE_RE, "").replace(INVISIBLE_RE, "").trim();
  if (!text && !media.size) return null;

  const meta: MessageInput["meta"] = {};
  if (media.size) meta.media = [...media];
  if (role === "assistant") {
    const model = metadata?.model_slug ?? defaultModel;
    if (model) meta.model = model;
  }
  return {
    ts: Math.round((seconds(message.create_time) ?? fallbackTs) * 1000),
    sender: role === "user" ? SELF : BOT,
    kind: text ? "text" : "media",
    text: text || null,
    ...(Object.keys(meta).length ? { meta } : {}),
  };
}

function seconds(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
