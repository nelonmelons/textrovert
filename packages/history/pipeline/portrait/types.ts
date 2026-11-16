/** The portrait the build script writes and the app renders. Every series is aligned to `timeline.starts`. */
export interface Portrait {
  generatedAt: number;
  timeZone: string;
  synthetic?: boolean;
  me: { name: string; total: number };
  timeline: { unit: "week" | "month"; starts: number[]; labels: string[] };
  conversations: Conversation[];
  people: Person[];
  groups: Group[];
  edges: Edge[];
  episodes: EpisodeLite[];
  stories: Story[];
  /** Messages cited by stories and plans, keyed by message id. */
  receipts: Record<string, Receipt>;
}

export interface Conversation {
  id: string;
  title: string;
  kind: "dm" | "group";
  platform: string;
  messageCount: number;
}

export type Count = [label: string, n: number];

export interface Person {
  id: string;
  name: string;
  platform: string;
  /** Messages they sent in our DM, per bucket. */
  dmThem: number[];
  /** Messages I sent in our DM, per bucket. */
  dmMe: number[];
  /** Messages they sent in group chats we share, per bucket. */
  groupThem: number[];
  total: number;
  firstTs: number | null;
  lastTs: number | null;
  dm: string | null;
  groups: string[];
  episodes: number[];
  plans: PlanRef[];
  topics: Count[];
  moods: Count[];
  places: Count[];
  mood: string | null;
  /** 0..1, recent volume weighted by length of history. */
  closeness: number;
}

export interface Group {
  id: string;
  title: string;
  platform: string;
  members: string[];
  series: number[];
  total: number;
  topics: Count[];
}

export interface Edge {
  a: string;
  b: string;
  weight: number;
}

export interface Plan {
  what: string;
  date: string | null;
  when: string;
  who: string[];
  sources: number[];
}

export interface PlanRef extends Plan {
  episode: number;
  conversation: string;
  ts: number;
}

export interface EpisodeLite {
  id: number;
  conversation: string;
  start: number;
  end: number;
  title: string;
  summary: string;
  topics: string[];
  people: string[];
  mood: string;
  kind: string;
  plans: Plan[];
}

export interface Sentence {
  text: string;
  refs: number[];
  /** Episodes a footnote pointed at; their summaries open with the receipts. */
  episodes?: number[];
}

export interface Chapter {
  title: string;
  period: string;
  sentences: Sentence[];
}

export interface Story {
  person: string;
  headline: string;
  chapters: Chapter[];
}

export interface Receipt {
  id: number;
  ts: number;
  sender: string;
  text: string;
  conversation: string;
}
