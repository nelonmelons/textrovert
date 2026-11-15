import type { ConversationKind, Platform } from "../types";
import type { MessageStore, StoredMessage } from "../store";
import type { Embed, MemoryIndex } from "./memory";

/** One of the user's conversations, as the assistant sees it. `id` is what the app opens; `key` is the store key. */
export interface ConversationRef {
  id: string;
  key: string;
  title: string;
  platform: Platform;
  kind: ConversationKind;
  participants: string[];
  selfName: string | null;
  messageCount: number;
  lastAt: number;
}

export interface Citation {
  /** The [n] marker used in the answer text. */
  n: number;
  messageId: number;
  conversationId: string;
  conversationTitle: string;
  sender: string;
  fromMe: boolean;
  ts: number;
  /** Exact text from the original message: the model's quote when it matched, otherwise the message itself. */
  quote: string;
}

export interface AssistantAnswer {
  answer: string;
  citations: Citation[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
type LlmMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type Complete = (messages: LlmMessage[], tools: unknown[]) => Promise<{ content: string | null; tool_calls?: ToolCall[] }>;

const MAX_STEPS = 8;
const DIRECTORY_IN_PROMPT = 150;
const QUOTE_MAX = 280;

const conversationsParam = {
  type: "array",
  items: { type: "string" },
  description: "Conversation handles (like c3) to search within. Omit to search every chat.",
};
const dateParams = {
  after: { type: "string", description: "Only messages on or after this date, YYYY-MM-DD." },
  before: { type: "string", description: "Only messages on or before this date, YYYY-MM-DD." },
};

const TOOLS = [
  {
    name: "find_conversations",
    description: "Find chats by a person's name, nickname, or group title. Use it whenever the question mentions someone.",
    parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
  {
    name: "search_messages",
    description:
      "Keyword search over message text. Every word must appear, so use 1-3 distinctive words and try synonyms or spellings in separate calls (e.g. 'yosemite', then 'camping').",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, conversations: conversationsParam, ...dateParams },
      required: ["query"],
    },
  },
  {
    name: "search_by_meaning",
    description:
      "Semantic search over stretches of conversation, for things said in other words (e.g. 'something she wants as a gift', 'plans for a trip'). Returns matching passages with their messages.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, conversations: conversationsParam, ...dateParams },
      required: ["query"],
    },
  },
  {
    name: "read_conversation",
    description:
      "Read messages in order from one chat: around a message id, around a date, or the latest ones when neither is given. Use it to check context before answering.",
    parameters: {
      type: "object",
      properties: {
        conversation: { type: "string", description: "Conversation handle, like c3." },
        around_message: { type: "number", description: "A message id (#123) to read around." },
        date: { type: "string", description: "YYYY-MM-DD to read around." },
      },
      required: ["conversation"],
    },
  },
  {
    name: "answer",
    description:
      "Give the final answer. Mark every claim from the chats with [n] and list each n with the message id it came from and a short exact quote copied from that message. Say plainly when the chats don't contain the answer.",
    parameters: {
      type: "object",
      properties: {
        answer: { type: "string" },
        citations: {
          type: "array",
          items: {
            type: "object",
            properties: { n: { type: "number" }, message_id: { type: "number" }, quote: { type: "string" } },
            required: ["n", "message_id", "quote"],
          },
        },
      },
      required: ["answer", "citations"],
    },
  },
].map((t) => ({ type: "function", function: t }));

/**
 * Answers a question about the user's chats with an agent loop over the message store: it scopes itself to whoever
 * or whenever the question is about, searches by keyword and by meaning, reads context, and answers with citations.
 * Every citation is checked against the stored message, so quotes shown to the user are always the original words.
 */
export async function ask(options: {
  question: string;
  history?: ChatTurn[];
  conversations: ConversationRef[];
  owner: string;
  store: MessageStore;
  memory: MemoryIndex | null;
  embed: Embed | null;
  complete: Complete;
  timeZone: string;
  now: number;
}): Promise<AssistantAnswer> {
  const { owner, store, memory, embed, timeZone } = options;
  const handles = new Map(options.conversations.map((c, i) => ["c" + (i + 1), c]));
  const byKey = new Map([...handles].map(([h, c]) => [c.key, { handle: h, ...c }]));
  const seen = new Map<number, StoredMessage>();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const offsetAt = (ts: number) => {
    const p = Object.fromEntries(stamp.formatToParts(ts).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ts / 60_000) * 60_000;
  };
  const parseDay = (value: unknown, endOfDay: boolean): number | undefined => {
    const m = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
    if (!m) return undefined;
    const wall = Date.UTC(+m[1], +m[2] - 1, +m[3]) + (endOfDay ? 86_400_000 - 1 : 0);
    return wall - offsetAt(wall);
  };
  const scope = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value) || value.length === 0) return undefined;
    return value.map((h) => handles.get(String(h))?.key).filter((k): k is string => !!k);
  };
  const describe = (c: ConversationRef & { handle?: string }, handle: string) =>
    `${handle}: ${c.title} (${c.platform} ${c.kind}${c.kind === "group" ? ", " + c.participants.slice(0, 8).join(", ") : ""}; ${c.messageCount} msgs, last ${c.lastAt ? day.format(c.lastAt) : "?"})`;
  const line = (m: StoredMessage) => {
    seen.set(m.id, m);
    const c = byKey.get(m.conversation);
    const who = c?.selfName && m.sender === c.selfName ? "Me" : m.sender || "(system)";
    return `#${m.id} [${stamp.format(m.ts)}] ${c?.handle ?? "?"} ${who}: ${m.text ?? "[" + m.kind + "]"}`;
  };

  const run = async (name: string, args: Record<string, unknown>): Promise<string> => {
    const after = parseDay(args.after, false);
    const before = parseDay(args.before, true);
    const inRange = (m: { ts: number }) => (after === undefined || m.ts >= after) && (before === undefined || m.ts <= before);
    switch (name) {
      case "find_conversations": {
        const q = String(args.name ?? "").toLowerCase().trim();
        const words = q.split(/\s+/).filter(Boolean);
        const matches = [...handles].filter(([, c]) => {
          const hay = [c.title, ...c.participants].join(" | ").toLowerCase();
          return words.length > 0 && words.every((w) => hay.includes(w));
        });
        return matches.length ? matches.slice(0, 15).map(([h, c]) => describe(c, h)).join("\n") : "No chats match " + JSON.stringify(q) + ".";
      }
      case "search_messages": {
        const keys = scope(args.conversations);
        const limit = after !== undefined || before !== undefined ? 200 : 40;
        const hits = keys
          ? (await Promise.all(keys.slice(0, 10).map((k) => store.search(owner, String(args.query ?? ""), limit, k)))).flat()
          : await store.search(owner, String(args.query ?? ""), limit);
        const found = hits.filter(inRange).slice(0, 30);
        return found.length ? found.map(line).join("\n") : "No messages contain those words.";
      }
      case "search_by_meaning": {
        if (!memory || !embed) return "Meaning search isn't available yet; use search_messages.";
        const [vector] = await embed([String(args.query ?? "")]);
        const chunks = await memory.nearest(owner, vector, 6, { conversations: scope(args.conversations), after, before });
        if (chunks.length === 0) return "Nothing indexed matches yet.";
        const passages = await Promise.all(
          chunks.map(async (c) => {
            const msgs = await store.between(owner, c.conversation, c.startTs, c.endTs, 25);
            return msgs.map(line).join("\n");
          }),
        );
        return passages.join("\n---\n");
      }
      case "read_conversation": {
        const c = handles.get(String(args.conversation ?? ""));
        if (!c) return "Unknown conversation handle.";
        if (typeof args.around_message === "number") {
          const [m] = await store.byIds(owner, [args.around_message]);
          if (!m || m.conversation !== c.key) return "That message isn't in this chat.";
          return (await store.around(owner, c.key, { ts: m.ts, id: m.id }, 30)).map(line).join("\n");
        }
        const at = parseDay(args.date, false);
        const rows = at !== undefined ? await store.around(owner, c.key, { ts: at, id: 0 }, 30) : (await store.page(owner, c.key, 30, null)).reverse();
        return rows.length ? rows.map(line).join("\n") : "No messages there.";
      }
      default:
        return "Unknown tool " + name;
    }
  };

  const directory = [...handles].slice(0, DIRECTORY_IN_PROMPT).map(([h, c]) => describe(c, h));
  const messages: LlmMessage[] = [
    {
      role: "system",
      content: [
        "You answer questions about the user's own chat history across every messaging app they imported.",
        "Today is " + day.format(options.now) + " (" + timeZone + "). The user appears as \"Me\".",
        "Work out what the question is about and scope your searches: if it names a person, find their chats (DMs and shared groups) and search within those; if it names a time, pass dates. If it is open-ended (\"someone\", \"who\"), search everything.",
        "Search several ways before concluding something isn't there: keyword variants and meaning search. Read context around promising hits.",
        "Only state what the messages support, and only include messages that are really about what was asked. Put an [n] marker right after each claim in the answer text, and quote words exactly as they appear. Be concise and warm, never invent details, and don't rate friendships.",
        "The answer text is what the user reads: no closing offers or menus of follow-ups, and never end with the word Answer.",
        "Finish by calling answer.",
        "Chats, most recent first" + (handles.size > DIRECTORY_IN_PROMPT ? " (more via find_conversations)" : "") + ":",
        ...directory,
      ].join("\n"),
    },
    ...(options.history ?? []).slice(-6).map((t) => ({ role: t.role, content: t.content }) as LlmMessage),
    { role: "user", content: options.question },
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await options.complete(messages, step === MAX_STEPS - 1 ? TOOLS.filter((t) => t.function.name === "answer") : TOOLS);
    const calls = reply.tool_calls ?? [];
    if (calls.length === 0) return { answer: reply.content ?? "", citations: [] };
    messages.push({ role: "assistant", content: reply.content, tool_calls: calls });
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // fall through with no arguments
      }
      if (call.function.name === "answer") {
        return verify(String(args.answer ?? ""), Array.isArray(args.citations) ? args.citations : [], seen, byKey);
      }
      let output: string;
      try {
        output = await run(call.function.name, args);
      } catch (error) {
        output = "Tool failed: " + (error instanceof Error ? error.message : String(error));
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: output.slice(0, 12_000) });
    }
  }
  return { answer: "I couldn't finish looking through your chats for that. Try asking more specifically.", citations: [] };
}

const normalize = (s: string) =>
  s.normalize("NFKC").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Keeps only citations of messages the agent actually read in this conversation's tools, and makes every quote the
 * original text: the model's quote when it appears verbatim in the message, otherwise the message itself. Markers
 * for dropped citations are removed from the answer.
 */
export function verify(
  answer: string,
  raw: { n?: unknown; message_id?: unknown; quote?: unknown }[],
  seen: Map<number, StoredMessage>,
  conversations: Map<string, ConversationRef>,
): AssistantAnswer {
  const citations: Citation[] = [];
  const kept = new Set<number>();
  for (const c of raw) {
    const n = Number(c.n);
    const message = seen.get(Number(c.message_id));
    const conversation = message && conversations.get(message.conversation);
    if (!Number.isInteger(n) || kept.has(n) || !message || !conversation || !message.text) continue;
    const quote = String(c.quote ?? "");
    const at = normalize(message.text).indexOf(normalize(quote));
    const exact = quote.trim() && at >= 0 ? exactSlice(message.text, quote) : null;
    kept.add(n);
    citations.push({
      n,
      messageId: message.id,
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      sender: message.sender,
      fromMe: conversation.selfName !== null && message.sender === conversation.selfName,
      ts: message.ts,
      quote: (exact ?? message.text).slice(0, QUOTE_MAX),
    });
  }
  // The model sometimes repeats its citations or tool name as prose; the app renders citations itself.
  const body = answer.split(/\n\s*(?:citations|sources)\s*:/i)[0].replace(/\s*\banswer\.?\s*$/i, "");
  const cleaned = body.replace(/\[(\d+)\]/g, (m, d) => (kept.has(Number(d)) ? m : "")).replace(/ +([.,;!?])/g, "$1");
  return { answer: cleaned.trim(), citations: citations.sort((a, b) => a.n - b.n) };
}

/** The span of the original text matching the quote case- and whitespace-insensitively, in its original form. */
function exactSlice(text: string, quote: string): string | null {
  const words = quote.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['\u2018\u2019]/g, "['\u2018\u2019]").replace(/["\u201C\u201D]/g, '["\u201C\u201D]'));
  const match = new RegExp(words.join("\\s+"), "iu").exec(text.normalize("NFKC"));
  return match ? match[0] : null;
}

/** OpenAI chat completions with tools; the model must call a tool every step, ending with answer. */
export function openAiComplete(apiKey: string, model = "gpt-5-mini"): Complete {
  return async (messages, tools) => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model,
        ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: "low" } : {}),
        messages,
        tools,
        tool_choice: "required",
      }),
    });
    if (!res.ok) throw new Error("Assistant request failed: " + res.status + " " + (await res.text()).slice(0, 300));
    const json = (await res.json()) as { choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[] };
    return json.choices[0].message;
  };
}
