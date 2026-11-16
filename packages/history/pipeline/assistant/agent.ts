import type { ConversationKind, Platform } from "../types";
import type { MessageStore, StoredMessage } from "../store";
import { clusterVectors, type EpisodeFilter, type EpisodeIndex, type StoredEpisode } from "./episodes";
import type { FactIndex, StoredFact } from "./facts";
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
const QUOTE_MAX = 120;
const EPISODE_READ_LIMIT = 80;

const conversationsParam = {
  type: "array",
  items: { type: "string" },
  description: "Conversation handles (like c3) to search within. Omit to search every chat.",
};
const dateParams = {
  after: { type: "string", description: "Only messages on or after this date, YYYY-MM-DD." },
  before: { type: "string", description: "Only messages on or before this date, YYYY-MM-DD." },
};

const episodeFilterParams = {
  conversations: conversationsParam,
  ...dateParams,
  person: { type: "string", description: "Only episodes where this person spoke or was talked about." },
  mood: { type: "string", enum: ["hype", "chill", "planning", "venting", "banter", "serious", "wholesome", "chaotic"] },
  kind: { type: "string", enum: ["logistics", "inside joke", "news/update", "debate", "support", "media sharing", "small talk", "decision"] },
};

const EPISODE_TOOLS = [
  {
    name: "find_episodes",
    description:
      "Episodes are summarized stretches of conversation with facets (title, summary, topics, people, places, plans, mood, kind). Filter them, optionally ranked by meaning with query. Best first step for broad or fuzzy questions (\"what have we been up to\", \"times we argued\", \"anything about her job\").",
    parameters: { type: "object", properties: { query: { type: "string" }, ...episodeFilterParams } },
  },
  {
    name: "group_episodes",
    description: "Counts episodes grouped by a facet (person, month, conversation, mood, kind, topic, place), with example titles per group. For 'who/when/how often' questions.",
    parameters: {
      type: "object",
      properties: { by: { type: "string", enum: ["person", "month", "conversation", "mood", "kind", "topic", "place"] }, ...episodeFilterParams },
      required: ["by"],
    },
  },
  {
    name: "cluster_topics",
    description: "Groups the matching episodes into topics by meaning and lists each topic's episodes with dates; name the topics yourself. For 'what do we talk about' or 'main themes' questions.",
    parameters: { type: "object", properties: episodeFilterParams },
  },
  {
    name: "list_plans",
    description: "Plans, events and intentions extracted from the chats, with dates when known and the messages they came from. Defaults to plans dated today or later.",
    parameters: { type: "object", properties: { ...episodeFilterParams, include_past: { type: "boolean" } } },
  },
];

const FACT_TOOLS = [
  {
    name: "person_facts",
    description:
      "What the chats say about a person (or Me): likes, wants, work, school, home, relationships, health, milestones, opinions, habits. Each fact has when it became known, its source message and exact quote; with include_history also facts that later changed (and when). Use for 'what does X like', 'what's new with X', 'how has X changed'.",
    parameters: {
      type: "object",
      properties: {
        person: { type: "string" },
        include_history: { type: "boolean" },
        since: { type: "string", description: "Only facts learned on or after YYYY-MM-DD, e.g. since you last talked." },
      },
      required: ["person"],
    },
  },
  {
    name: "search_facts",
    description: "Facts about anyone closest in meaning to a query, e.g. 'wants as a gift', 'got a new job', 'allergic'.",
    parameters: { type: "object", properties: { query: { type: "string" }, include_history: { type: "boolean" } }, required: ["query"] },
  },
];

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
            properties: {
              n: { type: "number" },
              message_id: { type: "number" },
              episode_id: { type: "string", description: "Only when no message was read for this claim: the episode (like E12) it came from." },
              quote: { type: "string", description: "The few words (under 15) of the message that support the claim, copied exactly." },
            },
            required: ["n", "quote"],
          },
        },
      },
      required: ["answer", "citations"],
    },
  },
];

const toTools = (defs: { name: string }[]) => defs.map((t) => ({ type: "function", function: t }));

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
  episodes?: EpisodeIndex | null;
  facts?: FactIndex | null;
  embed: Embed | null;
  complete: Complete;
  timeZone: string;
  now: number;
}): Promise<AssistantAnswer> {
  const { owner, store, memory, embed, timeZone } = options;
  const episodes = options.episodes ?? null;
  const facts = options.facts ?? null;
  const tools = toTools([...(episodes ? EPISODE_TOOLS : []), ...(facts ? FACT_TOOLS : []), ...TOOLS]);
  const handles = new Map(options.conversations.map((c, i) => ["c" + (i + 1), c]));
  const byKey = new Map([...handles].map(([h, c]) => [c.key, { handle: h, ...c }]));
  const seen = new Map<number, StoredMessage>();
  const episodesSeen = new Map<number, StoredEpisode>();
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
  // Every tool stays inside options.conversations: a person-scoped question, or a deployment serving one chat, never
  // reads summaries, facts or messages from the owner's other chats.
  const directoryKeys = [...byKey.keys()];
  const scope = (value: unknown): string[] => {
    const asked = Array.isArray(value) ? value.map((h) => handles.get(String(h))?.key).filter((k): k is string => !!k) : [];
    return asked.length ? asked : directoryKeys;
  };
  const describe = (c: ConversationRef & { handle?: string }, handle: string) =>
    `${handle}: ${c.title} (${c.platform} ${c.kind}${c.kind === "group" ? ", " + c.participants.slice(0, 8).join(", ") : ""}; ${c.messageCount} msgs, last ${c.lastAt ? day.format(c.lastAt) : "?"})`;
  const line = (m: StoredMessage) => {
    seen.set(m.id, m);
    const c = byKey.get(m.conversation);
    const who = c?.selfName && m.sender === c.selfName ? "Me" : m.sender || "(system)";
    return `#${m.id} [${stamp.format(m.ts)}] ${c?.handle ?? "?"} ${who}: ${m.text ?? "[" + m.kind + "]"}`;
  };

  const episodeLine = (e: StoredEpisode) => {
    episodesSeen.set(e.id, e);
    const c = byKey.get(e.conversation);
    const extras = [e.people.length ? "people: " + e.people.join(", ") : "", e.places.length ? "places: " + e.places.join(", ") : ""].filter(Boolean).join("; ");
    return `E${e.id} [${stamp.format(e.startTs)} → ${stamp.format(e.endTs)}] ${c?.handle ?? "?"} ${c?.title ?? ""} · ${e.mood}/${e.kind} · starts at #${e.firstId}\n  ${e.title}: ${e.summary}${extras ? " (" + extras + ")" : ""}`;
  };
  const episodeFilter = (args: Record<string, unknown>, after?: number, before?: number): EpisodeFilter => ({
    conversations: scope(args.conversations),
    after,
    before,
    person: typeof args.person === "string" && args.person.trim() ? args.person.trim() : undefined,
    mood: typeof args.mood === "string" ? args.mood : undefined,
    kind: typeof args.kind === "string" ? args.kind : undefined,
  });
  const factLine = (f: StoredFact, source: StoredMessage | undefined) => {
    if (source) seen.set(source.id, source);
    const c = byKey.get(f.conversation);
    const window = f.validTo === null ? "since " + day.format(f.validFrom) : day.format(f.validFrom) + " → " + day.format(f.validTo) + " (changed)";
    return `${f.subject} ${f.predicate}: ${f.object} [${window}] from #${f.messageId} in ${c?.handle ?? "?"} ${c?.title ?? ""}: "${f.quote}"`;
  };
  const month = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" });

  const run = async (name: string, args: Record<string, unknown>): Promise<string> => {
    const after = parseDay(args.after, false);
    const before = parseDay(args.before, true);
    if (episodes && name in EPISODE_RUNNERS) return EPISODE_RUNNERS[name](args, after, before);
    if (facts && (name === "person_facts" || name === "search_facts")) {
      let found =
        name === "person_facts"
          ? await facts.about(owner, String(args.person ?? ""), { includeHistory: !!args.include_history, since: parseDay(args.since, false), limit: 200 })
          : embed
            ? await facts.search(owner, (await embed([String(args.query ?? "")]))[0], 100, !!args.include_history)
            : [];
      found = found.filter((f) => byKey.has(f.conversation)).slice(0, name === "person_facts" ? 60 : 20);
      if (found.length === 0) return "No facts recorded.";
      const sources = new Map((await store.byIds(owner, [...new Set(found.map((f) => f.messageId))])).map((m) => [m.id, m]));
      return found.map((f) => factLine(f, sources.get(f.messageId))).join("\n");
    }
    return runBase(name, args, after, before);
  };

  const EPISODE_RUNNERS: Record<string, (args: Record<string, unknown>, after?: number, before?: number) => Promise<string>> = {
    async find_episodes(args, after, before) {
      const query = typeof args.query === "string" && args.query.trim() ? args.query : null;
      const vector = query && embed ? (await embed([query]))[0] : undefined;
      const found = await episodes!.find(owner, episodeFilter(args, after, before), 12, vector);
      return found.length ? found.map(episodeLine).join("\n") : "No episodes match.";
    },
    async group_episodes(args, after, before) {
      const found = await episodes!.find(owner, episodeFilter(args, after, before), 3000);
      const groups = new Map<string, StoredEpisode[]>();
      const add = (k: string, e: StoredEpisode) => groups.set(k, [...(groups.get(k) ?? []), e]);
      for (const e of found) {
        const by = String(args.by);
        if (by === "person") for (const p of new Set([...e.senders, ...e.people])) add(p, e);
        else if (by === "month") add(month.format(e.startTs), e);
        else if (by === "conversation") add(byKey.get(e.conversation)?.title ?? "?", e);
        else if (by === "mood") add(e.mood, e);
        else if (by === "kind") add(e.kind, e);
        else if (by === "topic") for (const t of e.topics) add(t.toLowerCase(), e);
        else if (by === "place") for (const p of e.places) add(p, e);
      }
      const rows = [...groups].sort((a, b) => b[1].length - a[1].length).slice(0, 25);
      return rows.length
        ? `${found.length} episodes\n` + rows.map(([k, es]) => `${k}: ${es.length} — e.g. ${es.slice(0, 3).map((e) => e.title).join("; ")}`).join("\n")
        : "No episodes match.";
    },
    async cluster_topics(args, after, before) {
      const found = await episodes!.find(owner, episodeFilter(args, after, before), 600);
      if (found.length < 3) return found.length ? found.map(episodeLine).join("\n") : "No episodes match.";
      const vectors = await episodes!.vectors(owner, found.map((e) => e.id));
      const usable = found.filter((e) => vectors.has(e.id));
      const clusters = clusterVectors(usable.map((e) => vectors.get(e.id)!));
      return clusters
        .slice(0, 15)
        .map((idx, i) => {
          const es = idx.map((j) => usable[j]).sort((a, b) => a.startTs - b.startTs);
          for (const e of es.slice(0, 6)) episodesSeen.set(e.id, e);
          return `Topic ${i + 1} (${es.length} episodes, ${day.format(es[0].startTs)} → ${day.format(es[es.length - 1].endTs)}):\n` + es.slice(0, 6).map((e) => `  E${e.id} ${day.format(e.startTs)} ${e.title}`).join("\n");
        })
        .join("\n");
    },
    async list_plans(args, after, before) {
      const found = await episodes!.find(owner, episodeFilter(args, undefined, before), 3000);
      const today = day.format(options.now);
      const plans = found.flatMap((e) => e.plans.map((p) => ({ ...p, e })));
      const wanted = plans
        .filter((p) => (args.include_past ? true : p.date !== null && p.date >= today))
        .filter((p) => after === undefined || (p.date !== null && p.date >= day.format(after)))
        .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"))
        .slice(0, 40);
      if (wanted.length === 0) return "No plans found.";
      const sources = await store.byIds(owner, [...new Set(wanted.flatMap((p) => p.sources))].slice(0, 120));
      const byId = new Map(sources.map((m) => [m.id, m]));
      return wanted
        .map((p) => {
          const c = byKey.get(p.e.conversation);
          const said = p.sources.map((id) => byId.get(id)).filter((m): m is StoredMessage => !!m).map(line);
          return `${p.date ?? "date unknown"} (${p.when}) ${p.what}${p.who.length ? " — " + p.who.join(", ") : ""} [${c?.handle ?? "?"} ${c?.title ?? ""}]\n  ${said.join("\n  ")}`;
        })
        .join("\n");
    },
  };

  const runBase = async (name: string, args: Record<string, unknown>, after?: number, before?: number): Promise<string> => {
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
        const hits =
          keys.length <= 10
            ? (await Promise.all(keys.map((k) => store.search(owner, String(args.query ?? ""), limit, k)))).flat()
            : await store.search(owner, String(args.query ?? ""), limit * 5);
        const found = hits.filter((m) => byKey.has(m.conversation) && keys.includes(m.conversation) && inRange(m)).slice(0, 30);
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
        ...(episodes
          ? [
              "Episodes, groupings, topics and plans are summaries: use them to orient, then cite the underlying messages (read around an episode's starting #id, or the source messages a plan lists). If a claim rests only on an episode you didn't read, cite it with episode_id (like E12) and the words you expect, and it is matched to the message that supports it.",
            ]
          : []),
        ...(facts
          ? ["Facts carry their source message and exact quote, so cite the fact's #id with that quote. When a fact changed, say what it was and what it became, with dates."]
          : []),
        "Only state what the messages support, and only include messages that are really about what was asked. Put an [n] marker right after each claim in the answer text, and quote the few words (under 15) that support it exactly as they appear. Be concise and warm, never invent details, and don't rate friendships.",
        "The answer text is what the user reads. Address the user as \"you\", never \"Me\" or \"You (Me)\". Never write message ids, #numbers, episode ids or chat handles: the [n] markers are the only references. End when the answer ends: no offers (\"If you want, I can…\", \"Want me to…\"), no menus of follow-ups, and never end with the word Answer.",
        "Finish by calling answer.",
        "Chats, most recent first" + (handles.size > DIRECTORY_IN_PROMPT ? " (more via find_conversations)" : "") + ":",
        ...directory,
      ].join("\n"),
    },
    ...(options.history ?? []).slice(-6).map((t) => ({ role: t.role, content: t.content }) as LlmMessage),
    { role: "user", content: options.question },
  ];

  /**
   * Citations the agent grounded in an episode summary rather than a message it read: an explicit episode_id, a message
   * id inside an episode it was shown, or an episode id passed as a message id. Each is matched to the episode message
   * that best supports the claim, so summary-based answers keep their sources.
   */
  const resolveCitations = async (answer: string, raw: RawCitation[]): Promise<RawCitation[]> => {
    const out: RawCitation[] = [];
    for (const c of raw) {
      const id = Number(c.message_id);
      if (seen.has(id)) {
        out.push(c);
        continue;
      }
      const explicit = /(\d+)/.exec(String(c.episode_id ?? (typeof c.message_id === "string" && /^e/i.test(c.message_id) ? c.message_id : "")))?.[1];
      const containing = Number.isInteger(id) ? [...episodesSeen.values()].find((e) => id >= e.firstId && id <= e.maxId) : undefined;
      if (!explicit && containing) {
        const [m] = await store.byIds(owner, [id]);
        const fits = m && m.conversation === containing.conversation && byKey.has(m.conversation);
        // An episode id can collide with a message id; the episode wins unless the message itself carries the quote.
        if (fits && (!episodesSeen.has(id) || bestSupport([m], String(c.quote ?? "")))) {
          seen.set(m.id, m);
          out.push({ ...c, message_id: m.id });
          continue;
        }
      }
      const episode = episodesSeen.get(explicit ? Number(explicit) : id);
      if (!episode || !byKey.has(episode.conversation)) {
        out.push(c);
        continue;
      }
      const messages = await store.between(owner, episode.conversation, episode.startTs, episode.endTs, EPISODE_READ_LIMIT);
      const best =
        bestSupport(messages, String(c.quote ?? "") + " " + claimFor(answer, Number(c.n))) ?? bestSupport(messages, episode.title + " " + episode.summary);
      if (!best) continue;
      seen.set(best.id, best);
      out.push({ ...c, message_id: best.id });
    }
    return out;
  };

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await options.complete(messages, step === MAX_STEPS - 1 ? tools.filter((t) => t.function.name === "answer") : tools);
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
        const answer = String(args.answer ?? "");
        const raw = Array.isArray(args.citations) ? (args.citations as RawCitation[]) : [];
        return verify(answer, await resolveCitations(answer, raw), seen, byKey);
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
  raw: RawCitation[],
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
    kept.add(n);
    citations.push({
      n,
      messageId: message.id,
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      sender: message.sender,
      fromMe: conversation.selfName !== null && message.sender === conversation.selfName,
      ts: message.ts,
      quote: pickQuote(message.text, String(c.quote ?? "")),
    });
  }
  // The model sometimes repeats its citations or tool name as prose; the app renders citations itself.
  const body = answer.split(/\n\s*(?:citations|sources)\s*:/i)[0].replace(/\s*\banswer\.?\s*$/i, "");
  const cleaned = body.replace(/\[(\d+)\]/g, (m, d) => (kept.has(Number(d)) ? m : ""));
  return { answer: tidyAnswer(cleaned), citations: citations.sort((a, b) => a.n - b.n) };
}

export interface RawCitation {
  n?: unknown;
  message_id?: unknown;
  episode_id?: unknown;
  quote?: unknown;
}

const OFFER_RE =
  /^(?:if you(?:'d| would)? (?:want|like)\b[^.?!]*\b(?:i can|i could|i'll|i will|let me)\b|i can also\b|i could also\b|happy to\b|shall i\b|should i\b)|\b(?:want me to|would you like(?: me)? to|like me to|let me know if)\b/i;
const ID_PAREN = /\s*\((?:(?:messages?|msgs?|episodes?|ids?|see)\s*#?E?\d+|#\d+|E\d+|c\d+)(?:\s*(?:,|and|&|-|–)\s*#?E?\d+)*\)/gi;
const ID_INLINE = /\s*\b(?:(?:in|from|see)\s+)?(?:messages?|msgs?|episodes?)\s+#?E?\d+(?:\s*(?:,|and)\s*#?E?\d+)*/gi;
const HASH_ID = /\s*#\d{3,}\b/g;

/**
 * Cleans what the user reads: no trailing offers or follow-up menus, no raw message, episode or chat ids, and the user
 * called "you" rather than "You (Me)".
 */
export function tidyAnswer(text: string): string {
  const atSentenceStart = (s: string, at: number) => /(^|[.!?\n]\s*)$/.test(s.slice(0, at));
  const named = text
    .replace(/\b(you|your|yours)\s*\(\s*["“]?me["”]?\s*\)/gi, "$1")
    .replace(/["“]?\bMe["”]?\s*\(\s*(?:you|yourself)\s*\)/g, (_m, at: number, s: string) => (atSentenceStart(s, at) ? "You" : "you"))
    .replace(ID_PAREN, "")
    .replace(ID_INLINE, "")
    .replace(HASH_ID, "");
  const lines = named.split("\n").map((line) => {
    if (!line.trim()) return line;
    const sentences = line.split(/(?<=[.!?])\s+/);
    const keep = sentences.filter((s) => !OFFER_RE.test(s.replace(/^[\s*•\-–—]+/, "")));
    return keep.length === sentences.length ? line : keep.join(" ").trim() ? keep.join(" ") : null;
  });
  return lines
    .filter((l): l is string => l !== null)
    .join("\n")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const STOPWORDS = new Set("the and for that this with you your are was were have has had but not they them their our out about what when who just from like its it's i'm can will would there then than into".split(" "));
const tokens = (s: string) => new Set(normalize(s).split(/[^\p{L}\p{N}']+/u).filter((w) => w.length >= 3 && !STOPWORDS.has(w)));

/** The text of the answer's sentence that carries marker [n], to match a citation to the message saying it. */
export function claimFor(answer: string, n: number): string {
  if (!Number.isInteger(n)) return "";
  return answer.split(/(?<=[.!?\n])\s+/).find((s) => s.includes("[" + n + "]"))?.replace(/\[\d+\]/g, "") ?? "";
}

/** The message that best supports a hint: one containing it verbatim, else the most shared words; null when none share any. */
export function bestSupport(messages: StoredMessage[], hint: string): StoredMessage | null {
  const want = tokens(hint);
  const quote = normalize(hint);
  let best: StoredMessage | null = null;
  let bestScore = 0;
  for (const m of messages) {
    if (!m.text) continue;
    const text = normalize(m.text);
    const have = tokens(m.text);
    const score = (quote.length >= 4 && text.includes(quote) ? 100 : 0) + [...want].filter((w) => have.has(w)).length;
    if (score > bestScore) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The span of the message to highlight: the model's quote when it appears in the message, else the sentence sharing
 * the most words with it, cut at a word boundary to QUOTE_MAX characters. Always a prefix of an exact span of the text.
 */
export function pickQuote(text: string, quote: string): string {
  const exact = quote.trim() && normalize(text).includes(normalize(quote)) ? exactSlice(text, quote) : null;
  if (exact) return capQuote(exact);
  const sentences = text.split(/(?<=[.!?\n])\s+/).filter((s) => s.trim());
  const want = tokens(quote);
  const scored = sentences.map((s) => ({ s, score: [...tokens(s)].filter((w) => want.has(w)).length }));
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a), scored[0] ?? { s: text, score: 0 });
  return capQuote(best.s.trim());
}

function capQuote(s: string): string {
  if (s.length <= QUOTE_MAX) return s;
  const cut = s.slice(0, QUOTE_MAX);
  const space = cut.search(/\s\S*$/);
  const out = space > QUOTE_MAX / 2 ? cut.slice(0, space) : cut;
  return out.replace(/[\uD800-\uDBFF]$/, "").trimEnd();
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
